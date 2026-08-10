/**
 * CLI / MCP backend: personal access tokens manage tasks on allowed projects.
 *
 * Auth: Authorization: Bearer pmcli_<prefix>_<secret>
 * Body: { action, ...params }
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto on hosted)
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

type TokenRow = {
  id: string
  user_id: string
  name: string
  scope_ids: string[] | null
  can_write: boolean
  revoked_at: string | null
}

type Ctx = {
  admin: SupabaseClient
  token: TokenRow
}

async function resolveToken(admin: SupabaseClient, authHeader: string | null): Promise<TokenRow | null> {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) return null
  const raw = authHeader.slice(7).trim()
  if (!raw.startsWith('pmcli_')) return null
  const hash = await sha256Hex(raw)
  const { data, error } = await admin
    .from('cli_access_tokens')
    .select('id, user_id, name, scope_ids, can_write, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle()
  if (error || !data) return null
  const row = data as TokenRow
  if (row.revoked_at) return null
  // fire-and-forget last_used
  void admin.from('cli_access_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', row.id)
  return row
}

async function userCanAccess(
  admin: SupabaseClient,
  userId: string,
  scopeId: string,
  minRole: 'viewer' | 'editor',
): Promise<boolean> {
  const { data: scope } = await admin.from('scopes').select('id, owner_id').eq('id', scopeId).maybeSingle()
  if (!scope) return false
  if ((scope as { owner_id: string }).owner_id === userId) return true
  const { data: share } = await admin
    .from('scope_shares')
    .select('role, status')
    .eq('scope_id', scopeId)
    .eq('user_id', userId)
    .eq('status', 'accepted')
    .maybeSingle()
  if (!share) return false
  if (minRole === 'viewer') return true
  return (share as { role: string }).role === 'editor'
}

function tokenAllowsScope(token: TokenRow, scopeId: string): boolean {
  if (!token.scope_ids || token.scope_ids.length === 0) return true
  return token.scope_ids.includes(scopeId)
}

async function requireScope(
  ctx: Ctx,
  scopeId: string,
  write: boolean,
): Promise<Response | null> {
  if (!scopeId) return json({ error: 'Missing scope_id' }, 400)
  if (!tokenAllowsScope(ctx.token, scopeId)) {
    return json({ error: 'Token is not allowed on this project' }, 403)
  }
  if (write && !ctx.token.can_write) {
    return json({ error: 'Token is read-only' }, 403)
  }
  const ok = await userCanAccess(ctx.admin, ctx.token.user_id, scopeId, write ? 'editor' : 'viewer')
  if (!ok) return json({ error: 'No access to this project' }, 403)
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    const token = await resolveToken(admin, req.headers.get('Authorization'))
    if (!token) return json({ error: 'Invalid or revoked CLI token' }, 401)

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || 'list_projects')
    const ctx: Ctx = { admin, token }

    // --- list projects ---
    if (action === 'list_projects') {
      const { data: owned } = await admin
        .from('scopes')
        .select('id, name, description, rank, owner_id')
        .eq('owner_id', token.user_id)
        .order('rank')
      const { data: shares } = await admin
        .from('scope_shares')
        .select('scope_id, role, scopes(id, name, description, rank, owner_id)')
        .eq('user_id', token.user_id)
        .eq('status', 'accepted')

      type ScopeBrief = {
        id: string
        name: string
        description: string | null
        rank: number
        owner_id: string
        access: 'owner' | 'editor' | 'viewer'
      }
      const map = new Map<string, ScopeBrief>()
      for (const s of owned ?? []) {
        const row = s as ScopeBrief
        map.set(row.id, { ...row, access: 'owner' })
      }
      for (const sh of shares ?? []) {
        const s = (sh as { scopes: ScopeBrief | ScopeBrief[] | null; role: string }).scopes
        const role = (sh as { role: string }).role
        const scope = Array.isArray(s) ? s[0] : s
        if (!scope?.id || map.has(scope.id)) continue
        map.set(scope.id, {
          ...scope,
          access: role === 'editor' ? 'editor' : 'viewer',
        })
      }

      let projects = [...map.values()]
      if (token.scope_ids?.length) {
        const allow = new Set(token.scope_ids)
        projects = projects.filter((p) => allow.has(p.id))
      }
      projects.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      return json({
        projects,
        token: { name: token.name, can_write: token.can_write, scope_ids: token.scope_ids },
      })
    }

    // --- list_tasks ---
    if (action === 'list_tasks') {
      const scopeId = String(body.scope_id || '')
      const denied = await requireScope(ctx, scopeId, false)
      if (denied) return denied
      const includeCompleted = body.include_completed !== false
      let q = admin
        .from('tasks')
        .select('id, scope_id, name, description, completed, completed_date, end_date, rank, created_at, updated_at')
        .eq('scope_id', scopeId)
        .order('rank', { ascending: true })
        .limit(Math.min(Number(body.limit) || 200, 500))
      if (!includeCompleted) q = q.eq('completed', false)
      const { data, error } = await q
      if (error) return json({ error: error.message }, 500)

      const taskIds = (data ?? []).map((t) => (t as { id: string }).id)
      let tagsByTask: Record<string, string[]> = {}
      if (taskIds.length) {
        const { data: tags } = await admin.from('tags').select('id, name').eq('scope_id', scopeId)
        const tagName = new Map((tags ?? []).map((t) => [(t as { id: string }).id, (t as { name: string }).name]))
        const { data: ttags } = await admin.from('task_tags').select('task_id, tag_id').in('task_id', taskIds)
        tagsByTask = {}
        for (const tt of ttags ?? []) {
          const tid = (tt as { task_id: string }).task_id
          const name = tagName.get((tt as { tag_id: string }).tag_id)
          if (!name) continue
          if (!tagsByTask[tid]) tagsByTask[tid] = []
          tagsByTask[tid]!.push(name)
        }
      }

      const tasks = (data ?? []).map((t) => {
        const row = t as { id: string }
        return { ...t, tags: tagsByTask[row.id] ?? [] }
      })
      return json({ tasks })
    }

    // --- list_tags ---
    if (action === 'list_tags') {
      const scopeId = String(body.scope_id || '')
      const denied = await requireScope(ctx, scopeId, false)
      if (denied) return denied
      const { data, error } = await admin
        .from('tags')
        .select('id, name, scope_id')
        .eq('scope_id', scopeId)
        .order('name')
      if (error) return json({ error: error.message }, 500)
      return json({ tags: data ?? [] })
    }

    // --- create_task ---
    if (action === 'create_task') {
      const scopeId = String(body.scope_id || '')
      const denied = await requireScope(ctx, scopeId, true)
      if (denied) return denied
      const name = String(body.name || '').trim()
      if (!name) return json({ error: 'Missing name' }, 400)

      const { data: maxRank } = await admin
        .from('tasks')
        .select('rank')
        .eq('scope_id', scopeId)
        .order('rank', { ascending: false })
        .limit(1)
        .maybeSingle()
      const rank = ((maxRank as { rank: number } | null)?.rank ?? -1) + 1

      const endDate = body.end_date ? String(body.end_date) : null
      const { data: task, error } = await admin
        .from('tasks')
        .insert({
          scope_id: scopeId,
          name: name.slice(0, 200),
          description: body.description != null ? String(body.description).slice(0, 8000) : null,
          end_date: endDate && /^\d{4}-\d{2}-\d{2}/.test(endDate) ? endDate.slice(0, 10) : null,
          owner_id: token.user_id,
          rank,
        })
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 500)

      const tagNames = Array.isArray(body.tag_names)
        ? (body.tag_names as unknown[]).map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean)
        : []
      if (tagNames.length) {
        const tagIds: string[] = []
        for (const tn of tagNames.slice(0, 10)) {
          const { data: existing } = await admin
            .from('tags')
            .select('id')
            .eq('scope_id', scopeId)
            .ilike('name', tn)
            .maybeSingle()
          if (existing) {
            tagIds.push((existing as { id: string }).id)
            continue
          }
          const { data: created } = await admin
            .from('tags')
            .insert({ scope_id: scopeId, name: tn.slice(0, 40) })
            .select('id')
            .single()
          if (created) tagIds.push((created as { id: string }).id)
        }
        if (tagIds.length) {
          await admin.from('task_tags').insert(
            tagIds.map((tag_id) => ({ task_id: (task as { id: string }).id, tag_id })),
          )
        }
      }
      return json({ task })
    }

    // --- update_task ---
    if (action === 'update_task') {
      const taskId = String(body.task_id || '')
      if (!taskId) return json({ error: 'Missing task_id' }, 400)
      const { data: existing, error: e1 } = await admin
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle()
      if (e1 || !existing) return json({ error: 'Task not found' }, 404)
      const scopeId = (existing as { scope_id: string }).scope_id
      const denied = await requireScope(ctx, scopeId, true)
      if (denied) return denied

      const patch: Record<string, unknown> = {}
      if (body.name != null) patch.name = String(body.name).trim().slice(0, 200)
      if (body.description !== undefined) {
        patch.description =
          body.description == null ? null : String(body.description).slice(0, 8000)
      }
      if (body.end_date !== undefined) {
        const ed = body.end_date == null ? null : String(body.end_date)
        patch.end_date = ed && /^\d{4}-\d{2}-\d{2}/.test(ed) ? ed.slice(0, 10) : null
      }
      if (typeof body.completed === 'boolean') {
        patch.completed = body.completed
        patch.completed_date = body.completed ? new Date().toISOString() : null
      }
      if (!Object.keys(patch).length && !Array.isArray(body.tag_names)) {
        return json({ error: 'No fields to update' }, 400)
      }

      let task = existing
      if (Object.keys(patch).length) {
        const { data, error } = await admin.from('tasks').update(patch).eq('id', taskId).select('*').single()
        if (error) return json({ error: error.message }, 500)
        task = data
      }

      if (Array.isArray(body.tag_names)) {
        const tagNames = (body.tag_names as unknown[])
          .map((t) => String(t).replace(/^#/, '').trim())
          .filter(Boolean)
          .slice(0, 10)
        const tagIds: string[] = []
        for (const tn of tagNames) {
          const { data: ex } = await admin
            .from('tags')
            .select('id')
            .eq('scope_id', scopeId)
            .ilike('name', tn)
            .maybeSingle()
          if (ex) {
            tagIds.push((ex as { id: string }).id)
            continue
          }
          const { data: created } = await admin
            .from('tags')
            .insert({ scope_id: scopeId, name: tn.slice(0, 40) })
            .select('id')
            .single()
          if (created) tagIds.push((created as { id: string }).id)
        }
        await admin.from('task_tags').delete().eq('task_id', taskId)
        if (tagIds.length) {
          await admin.from('task_tags').insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })))
        }
      }
      return json({ task })
    }

    // --- complete / uncomplete ---
    if (action === 'complete_task' || action === 'uncomplete_task') {
      const taskId = String(body.task_id || '')
      if (!taskId) return json({ error: 'Missing task_id' }, 400)
      const { data: existing } = await admin.from('tasks').select('id, scope_id, name').eq('id', taskId).maybeSingle()
      if (!existing) return json({ error: 'Task not found' }, 404)
      const scopeId = (existing as { scope_id: string }).scope_id
      const denied = await requireScope(ctx, scopeId, true)
      if (denied) return denied
      const completed = action === 'complete_task'
      const { data: task, error } = await admin
        .from('tasks')
        .update({
          completed,
          completed_date: completed ? new Date().toISOString() : null,
        })
        .eq('id', taskId)
        .select('*')
        .single()
      if (error) return json({ error: error.message }, 500)
      return json({ task })
    }

    // --- delete_task ---
    if (action === 'delete_task') {
      const taskId = String(body.task_id || '')
      if (!taskId) return json({ error: 'Missing task_id' }, 400)
      const { data: existing } = await admin.from('tasks').select('id, scope_id').eq('id', taskId).maybeSingle()
      if (!existing) return json({ error: 'Task not found' }, 404)
      const denied = await requireScope(ctx, (existing as { scope_id: string }).scope_id, true)
      if (denied) return denied
      const { error } = await admin.from('tasks').delete().eq('id', taskId)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true, deleted_id: taskId })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'CLI API failed' }, 500)
  }
})
