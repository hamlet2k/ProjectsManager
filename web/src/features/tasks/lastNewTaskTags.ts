/** Remember tag picks when creating tasks (quick-add + new-task modal) — per project. */

import { getProjectJson, setProjectJson } from '@/lib/projectPrefs'

const KEY = 'last-new-task-tags'

export function loadLastNewTaskTagIds(
  scopeId: string | undefined,
  validTagIds?: Iterable<string>,
): string[] {
  let raw = getProjectJson<string[]>(scopeId, KEY, [])
  if (!Array.isArray(raw)) raw = []
  raw = raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
  // Legacy global fallback (one-time style)
  if (raw.length === 0 && typeof localStorage !== 'undefined') {
    try {
      const legacy = JSON.parse(localStorage.getItem('pm-last-new-task-tags') || '[]') as unknown
      if (Array.isArray(legacy)) {
        raw = legacy.filter((x): x is string => typeof x === 'string' && x.length > 0)
        if (raw.length && scopeId) setProjectJson(scopeId, KEY, raw)
      }
    } catch {
      /* ignore */
    }
  }
  if (!validTagIds) return raw
  const allowed = new Set(validTagIds)
  return raw.filter((id) => allowed.has(id))
}

export function saveLastNewTaskTagIds(scopeId: string | undefined, tagIds: string[]) {
  if (!scopeId) return
  setProjectJson(scopeId, KEY, tagIds)
}
