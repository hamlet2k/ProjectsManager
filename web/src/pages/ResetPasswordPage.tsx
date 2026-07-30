import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'

function urlLooksLikeRecovery(): boolean {
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('type') === 'recovery') return true
    const hash = window.location.hash.replace(/^#/, '')
    if (hash) {
      const h = new URLSearchParams(hash)
      if (h.get('type') === 'recovery') return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/**
 * Landed here from the Supabase recovery email (redirectTo).
 * Session is established via detectSessionInUrl + PASSWORD_RECOVERY.
 */
export function ResetPasswordPage() {
  const { user, loading, passwordRecovery, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  // Give auth client a moment to parse the recovery hash from the URL
  const [ready, setReady] = useState(false)
  const [fromRecoveryLink] = useState(() => urlLooksLikeRecovery())

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 500)
    return () => window.clearTimeout(t)
  }, [])

  const inRecovery = passwordRecovery || fromRecoveryLink

  if (loading || !ready) return <PageLoader />

  // Signed in normally (not recovery) — password change belongs in Settings
  if (user && !inRecovery && !done) {
    return <Navigate to="/settings" replace />
  }

  if (!user && !inRecovery && !done) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Link invalid or expired</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Request a new password reset link. Links expire after a short time for security.
          </p>
        </div>
        <Link
          to="/forgot-password"
          className="inline-block text-sm text-[var(--color-primary)] hover:underline"
        >
          Request a new link
        </Link>
        <p className="text-center text-sm text-[var(--color-muted)]">
          <Link className="hover:underline" to="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Password updated</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            You can sign in with your new password.
          </p>
        </div>
        <Button
          className="w-full"
          onClick={async () => {
            try {
              await signOut()
            } catch {
              /* ignore */
            }
            navigate('/login', { replace: true })
          }}
        >
          Go to sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Enter a new password for {user?.email ?? 'your account'}.
        </p>
      </div>

      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          setError(null)
          if (password !== confirm) {
            setError('Passwords do not match')
            return
          }
          if (password.length < 8) {
            setError('Password must be at least 8 characters')
            return
          }
          setBusy(true)
          try {
            await updatePassword({ newPassword: password })
            setDone(true)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update password')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="New password" htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Update password'}
        </Button>
      </form>
    </div>
  )
}
