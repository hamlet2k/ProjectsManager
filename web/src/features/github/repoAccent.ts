import type { CSSProperties } from 'react'

/**
 * Pastel accents for multi-repo issue pills — muted so they sit with the
 * black/white Sketchy theme (soft wash + grey-tinted borders, not neon).
 */
const ACCENTS_LIGHT = [
  { bg: '#e8eef5', border: '#9aa8b8', text: '#3d4a5c' }, // slate blue
  { bg: '#e9f2ec', border: '#8fa99a', text: '#3a5244' }, // sage
  { bg: '#f3eee6', border: '#b5a48c', text: '#5c4e3a' }, // sand
  { bg: '#eeeaf3', border: '#a89bb5', text: '#4a3f58' }, // lavender
  { bg: '#f3e9ed', border: '#b89aa6', text: '#5a3f4a' }, // rose
  { bg: '#e8f1f1', border: '#8fabaa', text: '#3a5252' }, // mist teal
  { bg: '#f2ebe6', border: '#b5a092', text: '#5a4a3e' }, // clay
  { bg: '#e9ecf4', border: '#9aa3b8', text: '#3e4558' }, // periwinkle
] as const

const ACCENTS_DARK = [
  { bg: 'rgba(148, 163, 184, 0.18)', border: '#7c8a9c', text: '#d4dce6' },
  { bg: 'rgba(134, 160, 145, 0.2)', border: '#7a9485', text: '#cfe0d6' },
  { bg: 'rgba(180, 164, 140, 0.18)', border: '#9a8b74', text: '#e0d6c8' },
  { bg: 'rgba(160, 148, 175, 0.2)', border: '#8a7e9a', text: '#ddd4e8' },
  { bg: 'rgba(175, 145, 158, 0.18)', border: '#967e8a', text: '#e8d4dc' },
  { bg: 'rgba(130, 160, 158, 0.18)', border: '#75918f', text: '#d0e0df' },
  { bg: 'rgba(175, 155, 140, 0.18)', border: '#967e6e', text: '#e5d6ca' },
  { bg: 'rgba(145, 152, 175, 0.2)', border: '#7e8498', text: '#d5d8e6' },
] as const

function hashRepo(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

export function repoKey(
  owner: string | null | undefined,
  name: string | null | undefined,
): string | null {
  if (!owner || !name) return null
  return `${owner}/${name}`
}

export function repoAccentStyle(
  owner: string | null | undefined,
  name: string | null | undefined,
  dark?: boolean,
): CSSProperties | undefined {
  const key = repoKey(owner, name)
  if (!key) return undefined
  const palette = (dark ?? isDarkTheme()) ? ACCENTS_DARK : ACCENTS_LIGHT
  const a = palette[hashRepo(key) % palette.length]!
  return {
    background: a.bg,
    borderColor: a.border,
    color: a.text,
  }
}

export type RepoUsage = {
  key: string
  owner: string
  name: string
  count: number
  isDefault: boolean
}

/** Unique repos represented by task links, sorted with default first. */
export function summarizeLinkedRepos(
  configs: Iterable<{ github_repo_owner: string | null; github_repo_name: string | null; github_issue_number: number | null }>,
  defaultRepo: string | null,
): RepoUsage[] {
  const map = new Map<string, RepoUsage>()
  for (const c of configs) {
    if (!c.github_issue_number) continue
    const key = repoKey(c.github_repo_owner, c.github_repo_name)
    if (!key || !c.github_repo_owner || !c.github_repo_name) continue
    const cur = map.get(key) ?? {
      key,
      owner: c.github_repo_owner,
      name: c.github_repo_name,
      count: 0,
      isDefault: defaultRepo === key,
    }
    cur.count += 1
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return b.count - a.count || a.key.localeCompare(b.key)
  })
}
