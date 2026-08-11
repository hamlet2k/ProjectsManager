/** User-facing help articles (static Markdown, Vite raw import). */

export type HelpArticleMeta = {
  slug: string
  title: string
  description: string
  order: number
  body: string
}

type FrontMatter = {
  title?: string
  description?: string
  order?: number
}

const rawModules = import.meta.glob('./content/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function parseFrontMatter(raw: string): { meta: FrontMatter; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---')) {
    return { meta: {}, body: trimmed }
  }
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: trimmed }
  const fmBlock = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).replace(/^\s*\n/, '')
  const meta: FrontMatter = {}
  for (const line of fmBlock.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]
    let val = m[2]?.trim() ?? ''
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key === 'order') meta.order = Number(val) || 0
    else if (key === 'title') meta.title = val
    else if (key === 'description') meta.description = val
  }
  return { meta, body }
}

function slugFromPath(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

function firstHeading(body: string): string | undefined {
  const m = body.match(/^#\s+(.+)$/m)
  return m?.[1]?.trim()
}

function firstParagraph(body: string): string {
  const withoutHeading = body.replace(/^#\s+.+\n+/, '')
  const para = withoutHeading.split(/\n\n+/)[0]?.replace(/\n/g, ' ').trim() ?? ''
  return para.length > 160 ? `${para.slice(0, 157)}…` : para
}

export const HELP_ARTICLES: HelpArticleMeta[] = Object.entries(rawModules)
  .map(([path, raw]) => {
    const slug = slugFromPath(path)
    const { meta, body } = parseFrontMatter(raw)
    const title = meta.title || firstHeading(body) || slug
    const description = meta.description || firstParagraph(body)
    const order = meta.order ?? 999
    return { slug, title, description, order, body }
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

export const HELP_BY_SLUG: Record<string, HelpArticleMeta> = Object.fromEntries(
  HELP_ARTICLES.map((a) => [a.slug, a]),
)

export function getHelpArticle(slug: string | null | undefined): HelpArticleMeta | null {
  if (!slug) return null
  return HELP_BY_SLUG[slug] ?? null
}

/** Known slugs for typed HelpHint usage */
export const HelpSlugs = {
  gettingStarted: 'getting-started',
  sharing: 'sharing-projects',
  githubToken: 'github-token',
  githubProject: 'github-project-link',
  voice: 'voice-assistant',
  cliMcp: 'cli-mcp',
  account: 'account-signin',
  keyboard: 'keyboard-shortcuts',
  markdown: 'markdown-descriptions',
  importExport: 'import-export',
} as const

export type HelpSlug = (typeof HelpSlugs)[keyof typeof HelpSlugs]
