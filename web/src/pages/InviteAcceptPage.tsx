import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { useAcceptInvite } from '@/features/scopes/hooks'
import { Button } from '@/components/ui/Button'
import { PageLoader } from '@/components/ui/Spinner'

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const { user, loading } = useAuth()
  const accept = useAcceptInvite()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (loading || !user || !token || done) return
    let cancelled = false
    accept
      .mutateAsync(token)
      .then((share) => {
        if (cancelled) return
        setDone(true)
        navigate(`/scopes/${share.scope_id}`, { replace: true })
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not accept invite')
      })
    return () => {
      cancelled = true
    }
    // Run once when auth is ready for this token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id, token])

  if (loading) return <PageLoader />

  if (!user) {
    const redirect = encodeURIComponent(`/invite/${token}`)
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <h1 className="text-xl font-semibold">You&apos;re invited</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Sign in or create an account to join this shared scope.
        </p>
        <div className="flex justify-center gap-2">
          <Link to={`/login?next=${redirect}`}>
            <Button>Sign in</Button>
          </Link>
          <Link to={`/signup?next=${redirect}`}>
            <Button variant="secondary">Sign up</Button>
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <h1 className="text-xl font-semibold">Invite problem</h1>
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <Link to="/">
          <Button variant="secondary">Go home</Button>
        </Link>
      </div>
    )
  }

  return <PageLoader />
}
