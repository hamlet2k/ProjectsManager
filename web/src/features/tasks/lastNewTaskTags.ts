/** Remember tag picks when creating tasks (quick-add + new-task modal). */

const LS_KEY = 'pm-last-new-task-tags'

export function loadLastNewTaskTagIds(validTagIds?: Iterable<string>): string[] {
  let raw: string[] = []
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]') as unknown
    if (Array.isArray(parsed)) {
      raw = parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
    }
  } catch {
    raw = []
  }
  if (!validTagIds) return raw
  const allowed = new Set(validTagIds)
  return raw.filter((id) => allowed.has(id))
}

export function saveLastNewTaskTagIds(tagIds: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(tagIds))
}
