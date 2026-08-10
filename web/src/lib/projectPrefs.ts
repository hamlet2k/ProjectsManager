/**
 * Per-project local preferences (filters, last tags, GH-on-add, etc.).
 * Keys are scoped by project (scope) id so switching projects keeps separate state.
 */

export function projectPrefKey(scopeId: string, key: string): string {
  return `pm:proj:${scopeId}:${key}`
}

export function getProjectPref(scopeId: string | undefined, key: string, fallback = ''): string {
  if (!scopeId || typeof localStorage === 'undefined') return fallback
  try {
    const v = localStorage.getItem(projectPrefKey(scopeId, key))
    return v == null ? fallback : v
  } catch {
    return fallback
  }
}

export function setProjectPref(scopeId: string | undefined, key: string, value: string) {
  if (!scopeId || typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(projectPrefKey(scopeId, key), value)
  } catch {
    /* ignore quota */
  }
}

export function getProjectJson<T>(scopeId: string | undefined, key: string, fallback: T): T {
  const raw = getProjectPref(scopeId, key, '')
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function setProjectJson(scopeId: string | undefined, key: string, value: unknown) {
  setProjectPref(scopeId, key, JSON.stringify(value))
}

/** Migrate once from legacy global keys into a project key (optional first-load). */
export function migrateGlobalToProject(
  scopeId: string | undefined,
  projectKey: string,
  globalKey: string,
): string | null {
  if (!scopeId) return null
  const existing = localStorage.getItem(projectPrefKey(scopeId, projectKey))
  if (existing != null) return existing
  try {
    const g = localStorage.getItem(globalKey)
    if (g != null) {
      localStorage.setItem(projectPrefKey(scopeId, projectKey), g)
      return g
    }
  } catch {
    /* ignore */
  }
  return null
}
