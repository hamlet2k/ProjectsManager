/**
 * Legacy local-only system tag. No longer auto-applied; filtering uses repo chips
 * from task↔issue links. Still hidden in UI when leftover rows exist.
 */
export const GITHUB_SYSTEM_TAG = 'github'

export function isGithubSystemTag(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === GITHUB_SYSTEM_TAG
}
