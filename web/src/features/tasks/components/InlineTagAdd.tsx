import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Icons } from '@/components/icons'

type Props = {
  /** Create tag by name (without #). Returns created tag or void. */
  onCreate: (name: string) => Promise<void>
  disabled?: boolean
  /** Compact chip style (default) vs pill-badge style for task drawer */
  variant?: 'chip' | 'pill'
  className?: string
  placeholder?: string
}

/**
 * Minimal on-demand new-tag control: a small “+ tag” chip expands to an inline
 * input. Enter creates, Esc cancels. No full-width form row.
 */
export function InlineTagAdd({
  onCreate,
  disabled,
  variant = 'chip',
  className,
  placeholder = 'tag name',
}: Props) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  const close = () => {
    setOpen(false)
    setValue('')
    setBusy(false)
  }

  const submit = async () => {
    const name = value.trim().replace(/^#/, '')
    if (!name || busy || disabled) return
    setBusy(true)
    try {
      await onCreate(name)
      close()
    } catch {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={cn(
          variant === 'pill' ? 'pill-badge is-toggle tag-add-trigger' : 'tag-chip tag-add-trigger',
          className,
        )}
        disabled={disabled}
        title="Add new tag"
        onClick={() => setOpen(true)}
      >
        <Icons.Plus size="0.85em" />
        <span>tag</span>
      </button>
    )
  }

  return (
    <span
      className={cn(
        'tag-add-inline',
        variant === 'pill' && 'tag-add-inline-pill',
        className,
      )}
    >
      <span className="tag-add-hash" aria-hidden>
        #
      </span>
      <input
        ref={inputRef}
        className="tag-add-input"
        value={value}
        disabled={busy || disabled}
        placeholder={placeholder}
        size={Math.max(6, Math.min(18, value.length + 2))}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            void submit()
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        onBlur={() => {
          // Delay so a quick click on confirm still works if we add one later
          window.setTimeout(() => {
            if (document.activeElement !== inputRef.current) {
              if (!value.trim()) close()
            }
          }, 120)
        }}
      />
      {value.trim() ? (
        <button
          type="button"
          className="tag-add-confirm"
          title="Create tag (Enter)"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void submit()}
        >
          <Icons.Check size="0.8em" />
        </button>
      ) : (
        <button
          type="button"
          className="tag-add-confirm"
          title="Cancel (Esc)"
          disabled={busy}
          onMouseDown={(e) => e.preventDefault()}
          onClick={close}
        >
          <Icons.X size="0.75em" />
        </button>
      )}
    </span>
  )
}
