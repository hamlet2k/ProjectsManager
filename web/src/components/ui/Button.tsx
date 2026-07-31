import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--color-primary)] text-[var(--color-primary-fg)] hover:opacity-95 disabled:opacity-50',
  secondary:
    'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-surface-2)]',
  ghost: 'bg-transparent text-[var(--color-text)] shadow-none hover:bg-[var(--color-surface-2)]',
  danger:
    'bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-primary)] hover:text-[var(--color-primary-fg)]',
}

const sizes: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-sm',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-4 py-2.5 text-base',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  children: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-strong)] disabled:cursor-not-allowed',
        'border border-[var(--color-border)]',
        'rounded-[125px_10px_115px_10px/10px_115px_10px_125px]',
        variant !== 'ghost' && 'shadow-[1px_1px_0_rgba(75,85,99,0.18)]',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
