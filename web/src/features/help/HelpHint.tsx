import type { ReactNode } from 'react'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import { useHelp } from './HelpContext'

type Props = {
  /** Article slug (filename without .md) */
  slug: string
  /** Accessible label / tooltip */
  label?: string
  className?: string
  /** Slightly larger hit target for headers */
  size?: 'sm' | 'md'
}

/**
 * Small “?” control that opens Help Center on a specific article.
 * Use for complex / instruction-heavy UI only.
 */
export function HelpHint({
  slug,
  label = 'Read more in Help',
  className,
  size = 'sm',
}: Props) {
  const { openHelp } = useHelp()
  const dim = size === 'md' ? 'h-7 w-7' : 'h-6 w-6'
  const icon = size === 'md' ? '0.95em' : '0.85em'

  return (
    <button
      type="button"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'text-[var(--color-muted)] transition',
        'hover:bg-[var(--color-surface-2)] hover:text-[var(--color-primary)]',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-primary)]',
        dim,
        className,
      )}
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openHelp(slug)
      }}
    >
      <Icons.Help size={icon} />
    </button>
  )
}

/** Title row: heading + optional help hint aligned. */
export function HelpTitle({
  children,
  slug,
  as: Tag = 'h2',
  className,
  hintLabel,
}: {
  children: ReactNode
  slug?: string
  as?: 'h1' | 'h2' | 'h3'
  className?: string
  hintLabel?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Tag className={cn('font-semibold', className)}>{children}</Tag>
      {slug ? <HelpHint slug={slug} label={hintLabel} /> : null}
    </div>
  )
}
