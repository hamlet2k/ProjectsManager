/** App-only system tag for GitHub-linked tasks (not pushed as a GitHub issue label). */
export const GITHUB_SYSTEM_TAG = 'github'

export function isGithubSystemTag(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === GITHUB_SYSTEM_TAG
}
