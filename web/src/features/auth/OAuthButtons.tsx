import { useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'

type Props = {
  className?: string
  /** Shown under the buttons on error */
  onError?: (message: string) => void
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('rate limit') || m.includes('email rate')) {
    return 'Email rate limit exceeded. Wait a while, use Google/GitHub sign-in, or configure custom SMTP in Supabase.'
  }
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return 'This login provider is not enabled yet in Supabase Auth. See docs/auth-oauth-smtp.md.'
  }
  return message
}

export function OAuthButtons({ className, onError }: Props) {
  const { signInWithOAuth } = useAuth()
  const [busy, setBusy] = useState<'google' | 'github' | null>(null)

  const start = async (provider: 'google' | 'github') => {
    setBusy(provider)
    try {
      await signInWithOAuth(provider)
      // Browser redirects to provider; no further UI work
    } catch (e) {
      const msg = friendlyAuthError(e instanceof Error ? e.message : 'OAuth sign-in failed')
      onError?.(msg)
      setBusy(null)
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy != null}
        onClick={() => start('google')}
      >
        <GoogleMark />
        {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy != null}
        onClick={() => start('github')}
      >
        <Icons.Github size={18} />
        {busy === 'github' ? 'Redirecting…' : 'Continue with GitHub'}
      </Button>
    </div>
  )
}

export function AuthDivider({ label = 'or continue with email' }: { label?: string }) {
  return (
    <div className="relative my-1">
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div className="w-full border-t border-[var(--color-border)]" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-[var(--color-surface)] px-2 text-[var(--color-muted)]">{label}</span>
      </div>
    </div>
  )
}

/** Simple multicolor G mark (no extra dependency) */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.3C29.3 35 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.6 7.1l.1.1 6.3 5.3C36.8 41.4 44 36 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  )
}

export { friendlyAuthError }
