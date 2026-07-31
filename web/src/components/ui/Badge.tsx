import { cn } from '@/lib/utils'

export function Badge({
  children,
  tone = 'default',
  className,
}: {
  children: React.ReactNode
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const tones = {
    default: 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
    primary: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
    success: 'bg-green-500/15 text-green-700 dark:text-green-300',
    warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    danger: 'bg-red-500/15 text-red-700 dark:text-red-300',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
