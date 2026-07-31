/**
 * Import exported Flask JSON into Supabase.
 *
 * Env:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node import.mjs ./export
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import ws from 'ws'

const dir = process.argv[2] || './export'
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

function load(name) {
  const p = join(dir, `${name}.json`)
  if (!existsSync(p)) {
    console.warn(`Missing ${p}, treating as empty`)
    return []
  }
  return JSON.parse(readFileSync(p, 'utf8'))
}

function uuid() {
  return crypto.randomUUID()
}

const idMap = {
  users: {},
  scopes: {},
  tasks: {},
  tags: {},
  shares: {},
  notifications: {},
  scope_github: {},
  task_github: {},
  sync_logs: {},
}

const tempPasswords = []

async function main() {
  const users = load('user')
  console.log(`Users: ${users.length}`)

  // Prefetch auth users once for email linking
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authByEmail = new Map(
    (listed.data?.users ?? []).map((x) => [String(x.email || '').toLowerCase(), x]),
  )

  for (const u of users) {
    const password = randomBytes(12).toString('base64url')
    const email = String(u.email || '').trim()
    const emailKey = email.toLowerCase()
    const theme = u.theme === 'dark' ? 'dark' : u.theme === 'light' ? 'light' : 'system'
    const profilePatch = {
      username: u.username,
      name: u.name,
      email,
      role: u.role === 'admin' ? 'admin' : 'user',
      theme,
      github_integration_enabled: Boolean(u.github_integration_enabled),
      legacy_id: u.id,
    }

    const existing = authByEmail.get(emailKey)
    if (existing) {
      idMap.users[u.id] = existing.id
      const { error: upErr } = await supabase.from('profiles').upsert({
        id: existing.id,
        ...profilePatch,
      })
      if (upErr) {
        // Username conflict: keep existing username, still set legacy_id/name
        const { error: up2 } = await supabase
          .from('profiles')
          .update({
            name: u.name,
            github_integration_enabled: Boolean(u.github_integration_enabled),
            legacy_id: u.id,
            theme,
          })
          .eq('id', existing.id)
        if (up2) console.error(`Profile link ${email}:`, up2.message)
      }
      console.log(`Linked existing auth user ${email} -> ${existing.id}`)
      continue
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: u.name,
        username: u.username,
        theme,
      },
    })
    if (error) {
      console.error(`Failed user ${email}:`, error.message)
      continue
    }
    idMap.users[u.id] = data.user.id
    authByEmail.set(emailKey, data.user)
    tempPasswords.push({ email, password, legacy_id: u.id, username: u.username })
    await supabase.from('profiles').upsert({
      id: data.user.id,
      ...profilePatch,
    })
    console.log(`Created user ${email} -> ${data.user.id}`)
  }

  // Prefer reusing scopes already imported (legacy_id)
  const { data: existingScopes } = await supabase.from('scopes').select('id, legacy_id')
  const scopeByLegacy = new Map(
    (existingScopes ?? []).filter((s) => s.legacy_id != null).map((s) => [s.legacy_id, s.id]),
  )

  const scopes = load('scope')
  for (const s of scopes) {
    const owner_id = idMap.users[s.owner_id]
    if (!owner_id) {
      console.warn(`Skip scope ${s.id}: missing owner ${s.owner_id}`)
      continue
    }
    if (scopeByLegacy.has(s.id)) {
      idMap.scopes[s.id] = scopeByLegacy.get(s.id)
      console.log(`Reuse scope legacy ${s.id}`)
      continue
    }
    const id = uuid()
    idMap.scopes[s.id] = id
    const { error } = await supabase.from('scopes').insert({
      id,
      name: s.name,
      description: s.description,
      rank: s.rank ?? 1,
      owner_id,
      legacy_id: s.id,
    })
    if (error) console.error(`Scope ${s.id}:`, error.message)
    else {
      // Old schema: GitHub fields lived on scope row → owner config
      if (s.github_repo_name || s.github_repo_owner || s.github_integration_enabled) {
        const { error: ghErr } = await supabase.from('scope_github_configs').upsert(
          {
            scope_id: id,
            user_id: owner_id,
            github_integration_enabled: Boolean(s.github_integration_enabled),
            github_repo_id: s.github_repo_id ?? null,
            github_repo_name: s.github_repo_name ?? null,
            github_repo_owner: s.github_repo_owner ?? null,
            github_project_id: s.github_project_id ?? null,
            github_project_name: s.github_project_name ?? null,
            github_milestone_number: s.github_milestone_number ?? null,
            github_milestone_title: s.github_milestone_title ?? null,
          },
          { onConflict: 'scope_id,user_id' },
        )
        if (ghErr) console.error(`scope github ${s.id}:`, ghErr.message)
      }
    }
  }
  console.log(`Scopes mapped: ${Object.keys(idMap.scopes).length}`)

  const shares = load('scope_shares')
  for (const sh of shares) {
    const scope_id = idMap.scopes[sh.scope_id]
    const user_id = idMap.users[sh.user_id]
    const inviter_id = sh.inviter_id ? idMap.users[sh.inviter_id] : null
    if (!scope_id || !user_id) continue
    const id = uuid()
    idMap.shares[sh.id] = id
    const { error } = await supabase.from('scope_shares').insert({
      id,
      scope_id,
      user_id,
      inviter_id,
      role: sh.role === 'viewer' ? 'viewer' : 'editor',
      status: ['pending', 'accepted', 'revoked', 'rejected'].includes(sh.status)
        ? sh.status
        : 'pending',
      legacy_id: sh.id,
    })
    if (error) console.error(`Share ${sh.id}:`, error.message)
  }

  const tags = load('tag')
  for (const t of tags) {
    const scope_id = idMap.scopes[t.scope_id]
    if (!scope_id) continue
    const id = uuid()
    idMap.tags[t.id] = id
    const { error } = await supabase.from('tags').insert({
      id,
      scope_id,
      name: t.name,
      legacy_id: t.id,
    })
    if (error) console.error(`Tag ${t.id}:`, error.message)
  }

  // Tasks: parents before children
  const tasks = load('task')
  const scopeOwnerLegacy = new Map(scopes.map((s) => [s.id, s.owner_id]))
  const remaining = [...tasks]
  let guard = 0
  while (remaining.length && guard < tasks.length + 5) {
    guard += 1
    const next = []
    for (const t of remaining) {
      if (t.parent_task_id && !idMap.tasks[t.parent_task_id]) {
        next.push(t)
        continue
      }
      const scope_id = idMap.scopes[t.scope_id]
      if (!scope_id) continue
      const id = uuid()
      idMap.tasks[t.id] = id
      const owner_id = t.owner_id ? idMap.users[t.owner_id] : null
      const { error } = await supabase.from('tasks').insert({
        id,
        scope_id,
        parent_task_id: t.parent_task_id ? idMap.tasks[t.parent_task_id] : null,
        owner_id,
        name: t.name,
        description: t.description,
        start_date: t.start_date,
        end_date: t.end_date,
        rank: t.rank ?? 0,
        completed: Boolean(t.completed),
        completed_date: t.completed_date,
        legacy_id: t.id,
      })
      if (error) console.error(`Task ${t.id}:`, error.message)
      else if (t.github_issue_number || t.github_issue_id) {
        const ghUser =
          owner_id || idMap.users[scopeOwnerLegacy.get(t.scope_id)]
        if (ghUser) {
          const { error: ghErr } = await supabase.from('task_github_configs').upsert(
            {
              task_id: id,
              user_id: ghUser,
              github_issue_id: t.github_issue_id ?? null,
              github_issue_node_id: t.github_issue_node_id ?? null,
              github_issue_number: t.github_issue_number ?? null,
              github_issue_url: t.github_issue_url ?? null,
              github_issue_state: t.github_issue_state ?? null,
              github_repo_id: t.github_repo_id ?? null,
              github_repo_name: t.github_repo_name ?? null,
              github_repo_owner: t.github_repo_owner ?? null,
              github_project_id: t.github_project_id ?? null,
              github_project_name: t.github_project_name ?? null,
              github_milestone_number: t.github_milestone_number ?? null,
              github_milestone_title: t.github_milestone_title ?? null,
              github_milestone_due_on: t.github_milestone_due_on ?? null,
            },
            { onConflict: 'task_id,user_id' },
          )
          if (ghErr) console.error(`task github ${t.id}:`, ghErr.message)
        }
      }
    }
    if (next.length === remaining.length) {
      // break cycles / orphans
      for (const t of next) {
        const scope_id = idMap.scopes[t.scope_id]
        if (!scope_id) continue
        const id = uuid()
        idMap.tasks[t.id] = id
        await supabase.from('tasks').insert({
          id,
          scope_id,
          parent_task_id: null,
          owner_id: t.owner_id ? idMap.users[t.owner_id] : null,
          name: t.name,
          description: t.description,
          rank: t.rank ?? 0,
          completed: Boolean(t.completed),
          completed_date: t.completed_date,
          legacy_id: t.id,
        })
      }
      break
    }
    remaining.length = 0
    remaining.push(...next)
  }
  console.log(`Tasks mapped: ${Object.keys(idMap.tasks).length}`)

  const taskTags = load('task_tags')
  for (const tt of taskTags) {
    const task_id = idMap.tasks[tt.task_id]
    const tag_id = idMap.tags[tt.tag_id]
    if (!task_id || !tag_id) continue
    const { error } = await supabase.from('task_tags').insert({ task_id, tag_id })
    if (error && !error.message.includes('duplicate')) console.error(error.message)
  }

  for (const c of load('scope_github_config')) {
    const scope_id = idMap.scopes[c.scope_id]
    const user_id = idMap.users[c.user_id]
    if (!scope_id || !user_id) continue
    const { error } = await supabase.from('scope_github_configs').insert({
      id: uuid(),
      scope_id,
      user_id,
      github_integration_enabled: Boolean(c.github_integration_enabled),
      github_repo_id: c.github_repo_id,
      github_repo_name: c.github_repo_name,
      github_repo_owner: c.github_repo_owner,
      github_project_id: c.github_project_id,
      github_project_name: c.github_project_name,
      github_milestone_number: c.github_milestone_number,
      github_milestone_title: c.github_milestone_title,
      github_label_name: c.github_label_name,
      is_shared_repo: Boolean(c.is_shared_repo),
      source_user_id: c.source_user_id ? idMap.users[c.source_user_id] : null,
      is_detached: Boolean(c.is_detached),
      legacy_id: c.id,
    })
    if (error) console.error(`scope_github ${c.id}:`, error.message)
  }

  for (const c of load('task_github_config')) {
    const task_id = idMap.tasks[c.task_id]
    const user_id = idMap.users[c.user_id]
    if (!task_id || !user_id) continue
    const { error } = await supabase.from('task_github_configs').insert({
      id: uuid(),
      task_id,
      user_id,
      github_issue_id: c.github_issue_id,
      github_issue_node_id: c.github_issue_node_id,
      github_issue_number: c.github_issue_number,
      github_issue_url: c.github_issue_url,
      github_issue_state: c.github_issue_state,
      github_repo_id: c.github_repo_id,
      github_repo_name: c.github_repo_name,
      github_repo_owner: c.github_repo_owner,
      github_project_id: c.github_project_id,
      github_project_name: c.github_project_name,
      github_milestone_number: c.github_milestone_number,
      github_milestone_title: c.github_milestone_title,
      github_milestone_due_on: c.github_milestone_due_on,
      legacy_id: c.id,
    })
    if (error) console.error(`task_github ${c.id}:`, error.message)
  }

  // Skip re-creating share invite notifications noise; import historical if desired
  for (const n of load('notifications')) {
    const user_id = idMap.users[n.user_id]
    if (!user_id) continue
    const { error } = await supabase.from('notifications').insert({
      id: uuid(),
      user_id,
      scope_id: n.scope_id ? idMap.scopes[n.scope_id] : null,
      share_id: n.share_id ? idMap.shares[n.share_id] : null,
      notification_type: n.notification_type,
      title: n.title,
      message: n.message,
      status: n.status,
      requires_action: Boolean(n.requires_action),
      payload: n.payload ?? {},
      legacy_id: n.id,
      read_at: n.read_at,
      resolved_at: n.resolved_at,
    })
    if (error) console.error(`notification ${n.id}:`, error.message)
  }

  for (const s of load('sync_log')) {
    const task_id = idMap.tasks[s.task_id]
    if (!task_id) continue
    await supabase.from('sync_logs').insert({
      id: uuid(),
      task_id,
      action: s.action,
      status: s.status,
      message: s.message,
    })
  }

  writeFileSync(join(dir, 'id-map.json'), JSON.stringify(idMap, null, 2))
  writeFileSync(join(dir, 'temp-passwords.json'), JSON.stringify(tempPasswords, null, 2))
  console.log('Wrote id-map.json and temp-passwords.json (keep private!)')
  console.log('Import complete.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
