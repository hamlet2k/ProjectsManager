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

export async function syncTaskWithGitHub(taskId: string) {
  return invokeGitHubProxy<{ config: TaskGitHubConfig | null }>('sync_task', { taskId })
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
    return { integratedIds: new Set<string>(), configsByScope: new Map<string, ScopeGitHubConfig[]>() }
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
  for (const [scopeId, list] of configsByScope) {
    if (
      list.some(
        (c) =>
          c.github_integration_enabled &&
          c.github_repo_owner &&
          c.github_repo_name,
      )
    ) {
      integratedIds.add(scopeId)
    }
  }
  return { integratedIds, configsByScope }
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
