import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from './Button'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'

export type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive action styling (delete, etc.) */
  danger?: boolean
}

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

type Pending = ConfirmOptions & {
  resolve: (value: boolean) => void
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts: ConfirmOptions =
      typeof options === 'string' ? { message: options } : options
    return new Promise<boolean>((resolve) => {
      setPending({
        title: opts.title ?? 'Please confirm',
        message: opts.message,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        danger: opts.danger ?? false,
        resolve,
      })
    })
  }, [])

  const close = useCallback((value: boolean) => {
    setPending((p) => {
      p?.resolve(value)
      return null
    })
  }, [])

  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        // Don't steal Enter from inputs (none here), allow confirm
        e.preventDefault()
        close(true)
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    // Focus primary action for keyboard users
    queueMicrotask(() => confirmBtnRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [pending, close])

  const value = useMemo(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Dismiss"
            className="absolute inset-0 bg-black/45"
            onClick={() => close(false)}
          />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className={cn(
              'relative z-10 w-full max-w-md overflow-hidden',
              'border border-[var(--color-border-strong)] bg-[var(--color-surface)]',
              'rounded-[var(--radius-sketch)]',
              'shadow-[0_10px_28px_rgba(15,23,42,0.18),var(--shadow-sketch)]',
              'mx-0 sm:mx-0',
              'rounded-t-[var(--radius-sketch)] sm:rounded-[var(--radius-sketch)]',
            )}
          >
            <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3">
              <span
                className={cn(
                  'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center',
                  'rounded-[var(--radius-sketch-sm)] border border-[var(--color-border)]',
                  'bg-[var(--color-surface-2)] text-[var(--color-text)]',
                )}
                aria-hidden
              >
                {pending.danger ? <Icons.Trash /> : <Icons.Settings />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="confirm-title" className="font-[family-name:var(--font-display)] text-lg font-bold">
                  {pending.title}
                </h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => close(false)}
                aria-label="Close"
              >
                <Icons.X />
              </Button>
            </div>
            <div className="px-4 py-4">
              <p id="confirm-message" className="text-[0.98rem] leading-relaxed text-[var(--color-text)]">
                {pending.message}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => close(false)}>
                {pending.cancelLabel}
              </Button>
              <Button
                ref={confirmBtnRef}
                variant={pending.danger ? 'danger' : 'primary'}
                onClick={() => close(true)}
              >
                {pending.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx.confirm
}
