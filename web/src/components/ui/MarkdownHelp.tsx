import { useState } from 'react'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'

const SNIPPETS: { syntax: string; meaning: string }[] = [
  { syntax: '**bold**', meaning: 'Bold' },
  { syntax: '_italic_', meaning: 'Italic' },
  { syntax: '`code`', meaning: 'Inline code' },
  { syntax: '# Heading', meaning: 'Heading' },
  { syntax: '- item', meaning: 'Bullet list' },
  { syntax: '1. item', meaning: 'Numbered list' },
  { syntax: '- [ ] todo', meaning: 'Checklist' },
  { syntax: '[text](url)', meaning: 'Link' },
  { syntax: '> quote', meaning: 'Blockquote' },
  { syntax: '---', meaning: 'Horizontal rule' },
]

/** Compact Markdown cheatsheet toggle for description fields. */
export function MarkdownHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('relative inline-flex', className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-muted)] underline decoration-wavy underline-offset-2 hover:text-[var(--color-text)]"
        title="Markdown formatting help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icons.Markdown size="0.95em" />
        Markdown help
      </button>
      {open ? (
        <div
          className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg"
          role="dialog"
          aria-label="Markdown cheat sheet"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Description syntax
            </p>
            <button
              type="button"
              className="icon-btn !h-6 !w-6"
              title="Close"
              onClick={() => setOpen(false)}
            >
              <Icons.X size="0.75em" />
            </button>
          </div>
          <ul className="space-y-1.5 text-xs">
            {SNIPPETS.map((s) => (
              <li key={s.syntax} className="flex items-baseline justify-between gap-2">
                <code className="rounded bg-[var(--color-surface-2)] px-1 py-0.5 font-mono text-[11px]">
                  {s.syntax}
                </code>
                <span className="shrink-0 text-[var(--color-muted)]">{s.meaning}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-[var(--color-muted)]">
            Descriptions render as Markdown when you expand a task.
          </p>
        </div>
      ) : null}
    </div>
  )
}
