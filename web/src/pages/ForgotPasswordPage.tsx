import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { friendlyAuthError } from '@/features/auth/OAuthButtons'

export function ForgotPasswordPage() {
  const { resetPasswordForEmail, user, loading, configured, passwordRecovery } = useAuth()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <PageLoader />
  // Recovery session → finish on reset page
  if (passwordRecovery) return <Navigate to="/reset-password" replace />
  if (user) return <Navigate to="/" replace />

  if (!configured || !isSupabaseConfigured) {
    return (
      <div className="space-y-3 text-sm">
        <h1 className="text-xl font-semibold">Setup required</h1>
        <p className="text-[var(--color-muted)]">Configure Supabase env vars first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Forgot password</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Enter your account email and we’ll send a link to set a new password.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          setInfo(null)
          try {
            await resetPasswordForEmail(email)
            setInfo(
              'If an account exists for that email, a reset link is on its way. Check your inbox (and spam).',
            )
          } catch (err) {
            setError(
              friendlyAuthError(
                err instanceof Error ? err.message : 'Could not send reset email',
              ),
            )
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="Email" htmlFor="reset-email">
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        {info ? <p className="text-sm text-[var(--color-success)]">{info}</p> : null}
        <Button type="submit" className="w-full" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="text-center text-sm text-[var(--color-muted)]">
        <Link className="text-[var(--color-primary)] hover:underline" to="/login">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
