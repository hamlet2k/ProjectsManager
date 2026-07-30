// Supabase Edge Function: GitHub API proxy (repos, milestones, issues, sync)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GITHUB_API = 'https://api.github.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('projects-manager-github-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function decryptToken(payload: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

/** GitHub accepts Bearer for classic (ghp_) and fine-grained (github_pat_) PATs. */
function authHeader(token: string): string {
  const t = token.trim()
  return `Bearer ${t}`
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: authHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function ghJson<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await gh(token, path, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 400)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

type ScopeConfig = {
  user_id?: string
  github_integration_enabled: boolean
  github_repo_owner: string | null
  github_repo_name: string | null
  github_repo_id: number | null
  github_milestone_number: number | null
  github_milestone_title: string | null
  github_project_id: string | null
  github_project_name: string | null
  github_label_name: string | null
  close_issue_on_complete?: boolean
  updated_at?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const secret = Deno.env.get('GITHUB_TOKEN_SECRET')
    if (!secret || secret.length < 16) {
      return json({ error: 'GITHUB_TOKEN_SECRET is not configured on the Edge Function' }, 500)
    }

    const authHeaderIn = req.headers.get('Authorization')
    if (!authHeaderIn) return json({ error: 'Missing Authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeaderIn } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: cred, error: credErr } = await admin
      .from('github_credentials')
      .select('token_encrypted')
      .eq('user_id', user.id)
      .maybeSingle()
    if (credErr) return json({ error: credErr.message }, 400)
    if (!cred?.token_encrypted) {
      return json({ error: 'No GitHub token configured. Save a PAT under Settings first.' }, 400)
    }

    let token: string
    try {
      token = (await decryptToken(cred.token_encrypted, secret)).trim()
    } catch {
      return json(
        {
          error:
            'Could not decrypt stored token. Remove the token in Settings and save a new PAT (GITHUB_TOKEN_SECRET may have changed).',
        },
        400,
      )
    }
    if (!token) return json({ error: 'Stored GitHub token is empty' }, 400)

    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    if (action === 'test') {
      try {
        const me = await ghJson<{ login: string }>(token, '/user')
        return json({ ok: true, login: me.login })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'test failed'
        return json(
          {
            error: msg.includes('401')
              ? 'GitHub rejected the token (401). Use a classic PAT with repo scope, or a fine-grained PAT with repository access + Issues read/write.'
              : msg,
          },
          400,
        )
      }
    }

    if (action === 'list_repos') {
      try {
        type RepoRaw = {
          id: number
          name: string
          owner: { login: string } | string
          full_name: string
        }
        const repos: RepoRaw[] = []
        let page = 1
        // affiliation covers owner + collab + org for classic and most fine-grained tokens
        while (page <= 5) {
          const batch = await ghJson<RepoRaw[]>(
            token,
            `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
          )
          repos.push(...batch)
          if (batch.length < 100) break
          page += 1
        }
        return json({
          repositories: repos.map((r) => ({
            id: r.id,
            name: r.name,
            owner: typeof r.owner === 'string' ? r.owner : r.owner.login,
            full_name: r.full_name,
          })),
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'list_repos failed'
        return json({ error: msg }, 400)
      }
    }

    if (action === 'list_milestones') {
      const owner = String(body.owner ?? '')
      const repo = String(body.repo ?? '')
      if (!owner || !repo) return json({ error: 'owner and repo required' }, 400)
      try {
        const milestones = await ghJson<
          Array<{ number: number; title: string; due_on: string | null; state: string }>
        >(token, `/repos/${owner}/${repo}/milestones?state=all&per_page=100`)
        return json({
          milestones: milestones.map((m) => ({
            number: m.number,
            title: m.title,
            due_on: m.due_on,
            state: m.state,
          })),
        })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'list_milestones failed' }, 400)
      }
    }

    if (action === 'list_projects') {
      const owner = String(body.owner ?? '')
      if (!owner) return json({ error: 'owner required' }, 400)
      const query = `
        query($login: String!) {
          repositoryOwner(login: $login) {
            ... on User { projectsV2(first: 20) { nodes { id title number url closed } } }
            ... on Organization { projectsV2(first: 20) { nodes { id title number url closed } } }
          }
        }`
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: authHeader(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { login: owner } }),
      })
      const payload = await res.json()
      const nodes = payload?.data?.repositoryOwner?.projectsV2?.nodes ?? []
      return json({
        projects: nodes
          .filter((n: { closed?: boolean } | null) => n && !n.closed)
          .map((n: { id: string; title: string; number?: number; url?: string }) => ({
            id: n.id,
            title: n.title,
            number: n.number,
            url: n.url,
          })),
      })
    }

    /** One project → one repo: owner’s active config, else latest active. */
    async function loadCanonicalScopeConfig(scopeId: string): Promise<ScopeConfig | null> {
      const { data: scope } = await admin.from('scopes').select('owner_id').eq('id', scopeId).maybeSingle()
      const { data: configs } = await admin
        .from('scope_github_configs')
        .select('*')
        .eq('scope_id', scopeId)
      const list = (configs ?? []) as ScopeConfig[]
      const active = list.filter(
        (c) => c.github_integration_enabled && c.github_repo_owner && c.github_repo_name,
      )
      if (active.length === 0) {
        // Fallback: current user's row even if partially filled
        const mine = list.find((c) => c.user_id === user!.id)
        return mine ?? null
      }
      if (scope?.owner_id) {
        const ownerCfg = active.find((c) => c.user_id === scope.owner_id)
        if (ownerCfg) return ownerCfg
      }
      return (
        [...active].sort((a, b) =>
          String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
        )[0] ?? null
      )
    }

    async function loadTaskLink(taskId: string) {
      const { data: mine } = await admin
        .from('task_github_configs')
        .select('*')
        .eq('task_id', taskId)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (mine?.github_issue_number) return mine

      const { data: anyLink } = await admin
        .from('task_github_configs')
        .select('*')
        .eq('task_id', taskId)
        .not('github_issue_number', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return anyLink ?? mine ?? null
    }

    async function upsertTaskConfig(
      taskId: string,
      patch: Record<string, unknown>,
      rowUserId?: string,
    ) {
      const uid = rowUserId ?? user!.id
      const { data, error } = await admin
        .from('task_github_configs')
        .upsert({ task_id: taskId, user_id: uid, ...patch }, { onConflict: 'task_id,user_id' })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data
    }

    async function logSync(taskId: string, actionName: string, status: string, message?: string) {
      await admin.from('sync_logs').insert({
        task_id: taskId,
        user_id: user!.id,
        action: actionName,
        status,
        message: message ?? null,
      })
    }

    async function ensureLabel(owner: string, repo: string, label: string) {
      const check = await gh(token, `/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`)
      if (check.ok) return
      if (check.status === 404) {
        const create = await gh(token, `/repos/${owner}/${repo}/labels`, {
          method: 'POST',
          body: JSON.stringify({
            name: label,
            color: '0E8A16',
            description: 'Projects Manager',
          }),
        })
        if (!create.ok && create.status !== 422) {
          const t = await create.text()
          console.warn('ensureLabel failed', create.status, t.slice(0, 200))
        }
      }
    }

    if (action === 'create_issue') {
      const taskId = String(body.taskId ?? '')
      if (!taskId) return json({ error: 'taskId required' }, 400)

      const existing = await loadTaskLink(taskId)
      if (existing?.github_issue_number) {
        return json({
          error: `Task already linked to issue #${existing.github_issue_number}`,
          config: existing,
        }, 400)
      }

      const { data: task, error: taskErr } = await admin.from('tasks').select('*').eq('id', taskId).single()
      if (taskErr || !task) return json({ error: 'Task not found' }, 404)

      const scopeCfg = await loadCanonicalScopeConfig(task.scope_id)
      if (!scopeCfg?.github_repo_owner || !scopeCfg.github_repo_name) {
        return json(
          {
            error:
              'GitHub repo not configured for this project. Open project → GitHub and select a repository.',
          },
          400,
        )
      }

      const owner = scopeCfg.github_repo_owner
      const repo = scopeCfg.github_repo_name
      const labels: string[] = []
      if (scopeCfg.github_label_name) {
        try {
          await ensureLabel(owner, repo, scopeCfg.github_label_name)
          labels.push(scopeCfg.github_label_name)
        } catch {
          /* continue without label */
        }
      }

      const issueBody: Record<string, unknown> = {
        title: String(body.title ?? task.name),
        body: String(body.body ?? task.description ?? ''),
      }
      if (labels.length) issueBody.labels = labels
      if (scopeCfg.github_milestone_number) issueBody.milestone = scopeCfg.github_milestone_number

      try {
        let issue: {
          id: number
          node_id: string
          number: number
          html_url: string
          state: string
        }
        try {
          issue = await ghJson(token, `/repos/${owner}/${repo}/issues`, {
            method: 'POST',
            body: JSON.stringify(issueBody),
          })
        } catch (first) {
          // Retry without labels/milestone if GitHub rejects optional fields
          const msg = first instanceof Error ? first.message : ''
          if (msg.includes('422') || msg.includes('Label') || msg.includes('milestone')) {
            issue = await ghJson(token, `/repos/${owner}/${repo}/issues`, {
              method: 'POST',
              body: JSON.stringify({
                title: issueBody.title,
                body: issueBody.body,
              }),
            })
          } else {
            throw first
          }
        }

        const config = await upsertTaskConfig(taskId, {
          github_issue_id: issue.id,
          github_issue_node_id: issue.node_id,
          github_issue_number: issue.number,
          github_issue_url: issue.html_url,
          github_issue_state: issue.state,
          github_repo_id: scopeCfg.github_repo_id,
          github_repo_name: repo,
          github_repo_owner: owner,
          github_project_id: scopeCfg.github_project_id,
          github_project_name: scopeCfg.github_project_name,
          github_milestone_number: scopeCfg.github_milestone_number,
          github_milestone_title: scopeCfg.github_milestone_title,
        })
        await logSync(taskId, 'create_issue', 'success', `Issue #${issue.number}`)
        return json({ config })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'create failed'
        await logSync(taskId, 'create_issue', 'error', msg)
        return json({ error: msg }, 400)
      }
    }

    if (action === 'sync_task' || action === 'close_issue') {
      const taskId = String(body.taskId ?? '')
      if (!taskId) return json({ error: 'taskId required' }, 400)

      const cfg = await loadTaskLink(taskId)
      if (!cfg?.github_issue_number || !cfg.github_repo_owner || !cfg.github_repo_name) {
        return json({ config: null, error: 'No linked issue for this task' }, 400)
      }

      const owner = cfg.github_repo_owner as string
      const repo = cfg.github_repo_name as string
      const number = cfg.github_issue_number as number
      const rowUser = (cfg.user_id as string) || user.id

      try {
        if (action === 'close_issue') {
          const issue = await ghJson<{
            id: number
            node_id: string
            number: number
            html_url: string
            state: string
          }>(token, `/repos/${owner}/${repo}/issues/${number}`, {
            method: 'PATCH',
            body: JSON.stringify({ state: 'closed' }),
          })
          const config = await upsertTaskConfig(
            taskId,
            {
              github_issue_state: issue.state,
              github_issue_url: issue.html_url,
            },
            rowUser,
          )
          await logSync(taskId, 'close_issue', 'success')
          return json({ config })
        }

        const issue = await ghJson<{
          id: number
          node_id: string
          number: number
          html_url: string
          state: string
          title: string
          body: string | null
        }>(token, `/repos/${owner}/${repo}/issues/${number}`)

        const config = await upsertTaskConfig(
          taskId,
          {
            github_issue_id: issue.id,
            github_issue_node_id: issue.node_id,
            github_issue_number: issue.number,
            github_issue_url: issue.html_url,
            github_issue_state: issue.state,
          },
          rowUser,
        )

        if (issue.state === 'closed') {
          await admin
            .from('tasks')
            .update({ completed: true, completed_date: new Date().toISOString() })
            .eq('id', taskId)
            .eq('completed', false)
        }

        await logSync(taskId, 'sync_task', 'success')
        return json({ config })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'sync failed'
        await logSync(taskId, action, 'error', msg)
        return json({ error: msg }, 400)
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
