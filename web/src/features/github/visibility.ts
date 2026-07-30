/**
 * GitHub integration visibility & capability helpers.
 * Contract: docs/product-backlog.md — one scope → one repo; user opt-in + integrated exception.
 */
import type { Profile, ScopeGitHubConfig } from '@/lib/supabase/types'

export type GitHubCapabilities = {
  /** Scope has an active repo binding (any member). */
  scopeIntegrated: boolean
  /** Canonical binding for the scope (prefer owner). */
  binding: ScopeGitHubConfig | null
  /** Show any GitHub chrome for this scope. */
  canSee: boolean
  /** Create/sync/close/configure that needs PAT + preference. */
  canMutate: boolean
  /** Change the scope's single repo binding. */
  canConfigure: boolean
  /** User wants GitHub in the product. */
  preferenceOn: boolean
  /** Binding exists but user cannot mutate (read-only mode). */
  readOnly: boolean
}

/** Active binding = enabled + repo identified. */
export function isActiveBinding(c: ScopeGitHubConfig | null | undefined): boolean {
  if (!c) return false
  if (!c.github_integration_enabled) return false
  return Boolean(c.github_repo_owner && c.github_repo_name)
}

/**
 * One scope → one repo: pick canonical binding.
 * Prefer owner's active config; else any active config (most recently updated).
 */
export function getCanonicalScopeBinding(
  configs: ScopeGitHubConfig[],
  ownerId: string | null | undefined,
): ScopeGitHubConfig | null {
  const active = configs.filter(isActiveBinding)
  if (active.length === 0) return null
  if (ownerId) {
    const ownerCfg = active.find((c) => c.user_id === ownerId)
    if (ownerCfg) return ownerCfg
  }
  return [...active].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null
}

export function isScopeGitHubIntegrated(
  configs: ScopeGitHubConfig[],
  ownerId?: string | null,
): boolean {
  return getCanonicalScopeBinding(configs, ownerId) != null
}

export function computeGitHubCapabilities(input: {
  profile: Pick<Profile, 'github_integration_enabled'> | null | undefined
  scopeOwnerId: string | null | undefined
  currentUserId: string | null | undefined
  configs: ScopeGitHubConfig[]
  /** Owner or editor can configure/mutate when preference on. */
  canEditScope: boolean
  isOwner: boolean
}): GitHubCapabilities {
  const preferenceOn = Boolean(input.profile?.github_integration_enabled)
  const binding = getCanonicalScopeBinding(input.configs, input.scopeOwnerId)
  const scopeIntegrated = binding != null
  const canSee = preferenceOn || scopeIntegrated
  const canMutate = preferenceOn && input.canEditScope
  const canConfigure = preferenceOn && (input.isOwner || input.canEditScope)

  return {
    scopeIntegrated,
    binding,
    canSee,
    canMutate,
    canConfigure,
    preferenceOn,
    readOnly: canSee && !canMutate,
  }
}

export function repoLabel(c: ScopeGitHubConfig | null | undefined): string | null {
  if (!c?.github_repo_owner || !c.github_repo_name) return null
  return `${c.github_repo_owner}/${c.github_repo_name}`
}

/**
 * Repo fields stored even when soft-disabled (for re-enable without re-picking).
 * Prefer current user, then owner, then latest updated.
 */
export function getStoredRepoLabel(
  configs: ScopeGitHubConfig[],
  ownerId?: string | null,
  currentUserId?: string | null,
): string | null {
  const withRepo = configs.filter((c) => c.github_repo_owner && c.github_repo_name)
  if (withRepo.length === 0) return null
  if (currentUserId) {
    const mine = withRepo.find((c) => c.user_id === currentUserId)
    if (mine) return repoLabel(mine)
  }
  if (ownerId) {
    const owner = withRepo.find((c) => c.user_id === ownerId)
    if (owner) return repoLabel(owner)
  }
  return repoLabel(
    [...withRepo].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0],
  )
}

/**
 * One issue link per task (scope-global): prefer current user's row, else any with an issue number.
 */
export function pickTaskGitHubConfig<T extends { user_id: string; task_id: string; github_issue_number: number | null }>(
  configs: T[],
  taskId: string,
  currentUserId: string | null | undefined,
): T | undefined {
  const forTask = configs.filter((c) => c.task_id === taskId)
  if (forTask.length === 0) return undefined
  if (currentUserId) {
    const mine = forTask.find((c) => c.user_id === currentUserId && c.github_issue_number)
    if (mine) return mine
  }
  return forTask.find((c) => c.github_issue_number) ?? forTask[0]
}

export function mapTaskGitHubByTaskId<T extends { user_id: string; task_id: string; github_issue_number: number | null }>(
  configs: T[],
  currentUserId: string | null | undefined,
): Map<string, T> {
  const m = new Map<string, T>()
  const taskIds = new Set(configs.map((c) => c.task_id))
  for (const taskId of taskIds) {
    const picked = pickTaskGitHubConfig(configs, taskId, currentUserId)
    if (picked) m.set(taskId, picked)
  }
  return m
}
