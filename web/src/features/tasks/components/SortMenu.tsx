import { useEffect, useRef, useState } from 'react'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { SortMode } from './TaskBoard'

const SORT_OPTIONS: { value: SortMode; label: string; hint: string }[] = [
  { value: 'rank', label: 'Rank', hint: 'Manual priority order' },
  { value: 'name', label: 'Name', hint: 'A → Z' },
  { value: 'due', label: 'Due date', hint: 'Grouped by when due' },
  { value: 'created', label: 'Created', hint: 'Newest first' },
  { value: 'tags', label: 'Tags', hint: 'Grouped by tag' },
]

export function SortMenu({
  value,
  onChange,
  className,
}: {
  value: SortMode
  onChange: (mode: SortMode) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0]!

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (t && rootRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        className={cn(
          'sticky-pill sticky-pill-bubble sticky-pill-sort',
          open && 'is-open',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort by ${current.label}`}
        title="Sort order"
        onClick={() => setOpen((v) => !v)}
      >
        <Icons.List size="1.1em" className="shrink-0 opacity-80" />
        <span className="sticky-sort-label">
          <span className="max-sm:sr-only">Sort · </span>
          {current.label}
        </span>
        <Icons.ChevronDown
          size="0.85em"
          className={cn('shrink-0 opacity-70 transition-transform', open && 'rotate-180')}
        />
        {value !== 'rank' ? <span className="sticky-pill-dot" /> : null}
      </button>

      {open ? (
        <div
          className="sticky-sort-menu notebook-panel floating-elevated"
          role="listbox"
          aria-label="Sort tasks by"
        >
          <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Sort by
          </p>
          <ul className="space-y-1">
            {SORT_OPTIONS.map((opt) => {
              const active = opt.value === value
              return (
                <li key={opt.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn('sticky-sort-option', active && 'is-active')}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                  >
                    <span className="sticky-sort-option-main">
                      <span className="font-semibold">{opt.label}</span>
                      <span className="text-xs text-[var(--color-muted)]">{opt.hint}</span>
                    </span>
                    {active ? <Icons.Check size="0.95em" className="shrink-0 text-[var(--color-primary)]" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
