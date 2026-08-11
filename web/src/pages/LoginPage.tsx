import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { AuthDivider, OAuthButtons, friendlyAuthError } from '@/features/auth/OAuthButtons'

export function LoginPage() {
  const { signInWithPassword, signInWithMagicLink, user, loading, configured } = useAuth()
  const location = useLocation()
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <PageLoader />
  if (user) return <Navigate to={from} replace />

  if (!configured || !isSupabaseConfigured) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-xl font-semibold">Setup required</h1>
        <p className="text-[var(--color-muted)]">
          Add <code className="text-xs">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-xs">VITE_SUPABASE_ANON_KEY</code> to <code>web/.env</code>, then
          restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Google, GitHub, password, or magic link.
        </p>
      </div>

      <OAuthButtons onError={setError} />

      <AuthDivider />

      <div className="flex gap-2 rounded-lg bg-[var(--color-surface-2)] p-1">
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'password' ? 'bg-[var(--color-surface)] shadow-sm' : ''}`}
          onClick={() => setMode('password')}
        >
          Password
        </button>
        <button
          type="button"
          className={`flex-1 rounded-md px-3 py-1.5 text-sm ${mode === 'magic' ? 'bg-[var(--color-surface)] shadow-sm' : ''}`}
          onClick={() => setMode('magic')}
        >
          Magic link
        </button>
      </div>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          setInfo(null)
          try {
            if (mode === 'magic') {
              await signInWithMagicLink(email)
              setInfo('Check your email for a sign-in link.')
            } else {
              await signInWithPassword(email, password)
            }
          } catch (err) {
            setError(
              friendlyAuthError(err instanceof Error ? err.message : 'Sign in failed'),
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {mode === 'password' ? (
          <div className="space-y-1">
            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
          </div>
        ) : null}
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        {info ? <p className="text-sm text-[var(--color-success)]">{info}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-muted)]">
        No account?{' '}
        <Link className="text-[var(--color-primary)] hover:underline" to="/signup">
          Create one
        </Link>
      </p>
    </div>
  )
}
