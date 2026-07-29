import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? (
        <p className="mt-2 text-sm text-[var(--color-muted)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}
