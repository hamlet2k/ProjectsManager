import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import { HELP_ARTICLES, getHelpArticle } from './articles'
import { useHelp } from './HelpContext'

function HelpMarkdown({
  source,
  onOpenSlug,
}: {
  source: string
  onOpenSlug: (slug: string) => void
}) {
  return (
    <div className="prose prose-sm max-w-none help-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const h = href ?? ''
            // Internal help deep links: ?help=slug or help:slug
            const helpMatch =
              h.match(/^\?help=([a-z0-9-]+)$/i) ||
              h.match(/^help:([a-z0-9-]+)$/i) ||
              h.match(/^\?help$/)
            if (helpMatch) {
              const next = helpMatch[1] ?? ''
              return (
                <button
                  type="button"
                  className="help-inline-link"
                  onClick={() => onOpenSlug(next)}
                >
                  {children}
                </button>
              )
            }
            if (h.startsWith('#')) {
              return <a href={h}>{children}</a>
            }
            return (
              <a href={h} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}

export function HelpCenter() {
  const { open, slug, openHelp, closeHelp } = useHelp()
  const article = useMemo(() => getHelpArticle(slug), [slug])

  const title = article ? article.title : 'Help Center'

  return (
    <Modal open={open} title={title} onClose={closeHelp} size="xl">
      {article ? (
        <div className="space-y-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]"
            onClick={() => openHelp('')}
          >
            <Icons.Back size="0.9em" />
            All topics
          </button>
          <HelpMarkdown source={article.body} onOpenSlug={(s) => openHelp(s || '')} />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Guides for Projects Manager. Open a topic, or use the{' '}
            <Icons.Help className="inline align-[-0.1em]" size="0.95em" /> icons next to complex
            settings for jump-in help.
          </p>
          <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
            {HELP_ARTICLES.map((a) => (
              <li key={a.slug}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-3 text-left transition',
                    'hover:bg-[var(--color-surface-2)]',
                  )}
                  onClick={() => openHelp(a.slug)}
                >
                  <span className="text-sm font-semibold text-[var(--color-text)]">{a.title}</span>
                  {a.description ? (
                    <span className="text-xs text-[var(--color-muted)]">{a.description}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {HELP_ARTICLES.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No help documents found.</p>
          ) : null}
        </div>
      )}
      <div className="mt-4 flex justify-end border-t border-[var(--color-border)] pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={closeHelp}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
