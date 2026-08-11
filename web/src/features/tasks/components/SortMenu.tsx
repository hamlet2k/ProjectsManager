import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * Sketchy sort control — portal menu so it never stretches sticky pills
 * (absolute menus inside flex rows were getting position:relative from
 * .notebook-panel.floating-elevated and blowing up Search/Filters).
 */
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
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const current = SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0]!

  const placeMenu = () => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    setPos({
      top: r.bottom + 8,
      right: Math.max(8, window.innerWidth - r.right),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    placeMenu()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (btnRef.current?.contains(t as Node)) return
      if (menuRef.current?.contains(t as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = () => placeMenu()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const menu =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="sticky-sort-menu"
            role="listbox"
            aria-label="Sort tasks by"
            style={{ top: pos.top, right: pos.right }}
          >
            <p className="sticky-sort-menu-title">Sort by</p>
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
                      {active ? (
                        <Icons.Check size="0.95em" className="shrink-0 text-[var(--color-primary)]" />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cn(
          'sticky-pill sticky-pill-bubble sticky-pill-sort sticky-pill-icon-mobile',
          open && 'is-open',
          className,
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort by ${current.label}`}
        title={`Sort by ${current.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icons.List size="1.1em" className="shrink-0 opacity-80" />
        <span className="sticky-sort-label sticky-pill-text">
          <span className="max-sm:sr-only">Sort · </span>
          {current.label}
        </span>
        <Icons.ChevronDown
          size="0.85em"
          className={cn(
            'shrink-0 opacity-70 transition-transform max-sm:hidden',
            open && 'rotate-180',
          )}
        />
        {value !== 'rank' ? <span className="sticky-pill-dot" /> : null}
      </button>
      {menu}
    </>
  )
}
