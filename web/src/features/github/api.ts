import { getSupabase } from '@/lib/supabase/client'
import type { ScopeGitHubConfig, TaskGitHubConfig } from '@/lib/supabase/types'

async function extractFnError(error: unknown, data: unknown): Promise<string> {
  if (data && typeof data === 'object' && data !== null && 'error' in data) {
    const e = (data as { error?: unknown }).error
    if (typeof e === 'string' && e.trim()) return e
  }
  const err = error as { message?: string; context?: Response }
  if (err?.context && typeof err.context.json === 'function') {
    try {
      const body = await err.context.json()
      if (body?.error && typeof body.error === 'string') return body.error
    } catch {
      /* ignore */
    }
  }
  if (err?.message) {
    if (err.message.includes('non-2xx')) {
      return 'GitHub request failed. Check your PAT under Settings (classic repo scope or fine-grained Issues access), then Test connection.'
    }
    return err.message
  }
  return 'Request failed'
}

async function invokeGitHubProxy<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('github-proxy', {
    body: { action, ...payload },
  })
  if (error) throw new Error(await extractFnError(error, data))
  if (data && typeof data === 'object' && data !== null && 'error' in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error))
  }
  return data as T
}

async function invokeCredentials<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('github-credentials', {
    body: { action, ...payload },
  })
  if (error) throw new Error(await extractFnError(error, data))
  if (data && typeof data === 'object' && data !== null && 'error' in data && (data as { error?: string }).error) {
    throw new Error(String((data as { error: string }).error))
  }
  return data as T
}

export async function saveGitHubToken(token: string) {
  return invokeCredentials<{ ok: boolean; token_hint: string }>('save', { token })
}

export async function deleteGitHubToken() {
  return invokeCredentials<{ ok: boolean }>('delete')
}

export async function getGitHubTokenStatus() {
  return invokeCredentials<{ configured: boolean; token_hint: string | null }>('status')
}

export async function testGitHubConnection() {
  return invokeGitHubProxy<{ ok: boolean; login?: string }>('test')
}

export async function listGitHubRepos() {
  return invokeGitHubProxy<{
    repositories: Array<{ id: number; name: string; owner: string; full_name: string }>
  }>('list_repos')
}

export async function listGitHubMilestones(owner: string, repo: string) {
  return invokeGitHubProxy<{
    milestones: Array<{ number: number; title: string; due_on: string | null; state: string }>
  }>('list_milestones', { owner, repo })
}

export async function listGitHubProjects(owner: string, repo: string) {
  return invokeGitHubProxy<{
    projects: Array<{ id: string; title: string; number?: number; url?: string }>
  }>('list_projects', { owner, repo })
}

export async function createIssueForTask(input: {
  taskId: string
  title?: string
  body?: string
}) {
  return invokeGitHubProxy<{ config: TaskGitHubConfig }>('create_issue', input)
}

/**
 * Sync linked issue. Without mode, server uses last-write-wins (compare updated_at).
 * mode 'pull' | 'push' forces a direction when needed.
 */
export async function syncTaskWithGitHub(taskId: string, mode?: 'pull' | 'push') {
  return invokeGitHubProxy<{ config: TaskGitHubConfig | null; mode?: string }>(
    'sync_task',
    mode ? { taskId, mode } : { taskId },
  )
}

export async function closeIssueForTask(taskId: string) {
  return invokeGitHubProxy<{ config: TaskGitHubConfig }>('close_issue', { taskId })
}

export async function fetchScopeGitHubConfig(scopeId: string, userId: string) {
  const { data, error } = await getSupabase()
    .from('scope_github_configs')
    .select('*')
    .eq('scope_id', scopeId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data as ScopeGitHubConfig | null
}

/** All GitHub configs for a scope (members can read after RLS update). */
export async function fetchScopeGitHubConfigs(scopeId: string) {
  const { data, error } = await getSupabase()
    .from('scope_github_configs')
    .select('*')
    .eq('scope_id', scopeId)
  if (error) throw error
  return (data ?? []) as ScopeGitHubConfig[]
}

/** Which scopes have an active GitHub binding (enabled + repo). */
export async function fetchGitHubFlagsForScopes(scopeIds: string[]) {
  if (scopeIds.length === 0) {
    return {
      integratedIds: new Set<string>(),
      configsByScope: new Map<string, ScopeGitHubConfig[]>(),
      repoLabelByScope: new Map<string, string>(),
    }
  }
  const { data, error } = await getSupabase()
    .from('scope_github_configs')
    .select('*')
    .in('scope_id', scopeIds)
  if (error) throw error
  const configsByScope = new Map<string, ScopeGitHubConfig[]>()
  for (const row of (data ?? []) as ScopeGitHubConfig[]) {
    const list = configsByScope.get(row.scope_id) ?? []
    list.push(row)
    configsByScope.set(row.scope_id, list)
  }
  const integratedIds = new Set<string>()
  const repoLabelByScope = new Map<string, string>()
  for (const [scopeId, list] of configsByScope) {
    const active = list
      .filter(
        (c) =>
          c.github_integration_enabled && c.github_repo_owner && c.github_repo_name,
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    if (active.length) {
      integratedIds.add(scopeId)
      const c = active[0]!
      repoLabelByScope.set(scopeId, `${c.github_repo_owner}/${c.github_repo_name}`)
    }
  }
  return { integratedIds, configsByScope, repoLabelByScope }
}

/** Accepted share summaries for owned scopes (tooltip / hover). */
export async function fetchShareSummariesForScopes(scopeIds: string[]) {
  if (scopeIds.length === 0) return new Map<string, { count: number; names: string[] }>()
  const supabase = getSupabase()
  const { data: shares, error } = await supabase
    .from('scope_shares')
    .select('scope_id, user_id')
    .in('scope_id', scopeIds)
    .eq('status', 'accepted')
  if (error) throw error
  const rows = (shares ?? []) as { scope_id: string; user_id: string }[]
  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const nameByUser = new Map<string, string>()
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, username, email')
      .in('id', userIds)
    for (const p of (profiles ?? []) as {
      id: string
      name: string | null
      username: string | null
      email: string | null
    }[]) {
      nameByUser.set(p.id, p.name || p.username || p.email || 'Member')
    }
  }
  const map = new Map<string, { count: number; names: string[] }>()
  for (const row of rows) {
    const cur = map.get(row.scope_id) ?? { count: 0, names: [] }
    cur.count += 1
    const label = nameByUser.get(row.user_id) || 'Member'
    if (cur.names.length < 8) cur.names.push(label)
    map.set(row.scope_id, cur)
  }
  return map
}

/** All task↔issue links visible for these tasks (any user; RLS must allow). */
export async function fetchTaskGitHubConfigsForTasks(taskIds: string[]) {
  if (taskIds.length === 0) return [] as TaskGitHubConfig[]
  const { data, error } = await getSupabase()
    .from('task_github_configs')
    .select('*')
    .in('task_id', taskIds)
  if (error) throw error
  return (data ?? []) as TaskGitHubConfig[]
}

/** Soft-disable every binding on a project (repo fields kept). */
export async function disableScopeGitHubBinding(scopeId: string) {
  const { error } = await getSupabase().rpc('disable_scope_github_binding', {
    p_scope_id: scopeId,
  })
  if (error) throw error
}

/** Soft-disable all of the current user's project GitHub bindings. */
export async function disableMyGitHubScopeConfigs() {
  const { data, error } = await getSupabase().rpc('disable_my_github_scope_configs')
  if (error) throw error
  return (data as number) ?? 0
}

/** Notify other members that the project GitHub binding changed. */
export async function notifyGitHubBindingChange(
  scopeId: string,
  title: string,
  message: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await getSupabase().rpc('notify_github_binding_change', {
    p_scope_id: scopeId,
    p_title: title,
    p_message: message,
    p_payload: payload,
  })
  if (error) throw error
}

export async function upsertScopeGitHubConfig(
  scopeId: string,
  userId: string,
  patch: Partial<
    Pick<
      ScopeGitHubConfig,
      | 'github_integration_enabled'
      | 'github_repo_id'
      | 'github_repo_name'
      | 'github_repo_owner'
      | 'github_project_id'
      | 'github_project_name'
      | 'github_milestone_number'
      | 'github_milestone_title'
      | 'github_label_name'
    > & { close_issue_on_complete?: boolean }
  >,
) {
  const { data, error } = await getSupabase()
    .from('scope_github_configs')
    .upsert(
      {
        scope_id: scopeId,
        user_id: userId,
        ...patch,
      },
      { onConflict: 'scope_id,user_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as ScopeGitHubConfig
}
