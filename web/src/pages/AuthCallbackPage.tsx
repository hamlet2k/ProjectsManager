import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { PageLoader } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { getSupabase, tryGetSupabase } from '@/lib/supabase/client'

/**
 * Landing page after Google / GitHub OAuth (and magic-link email).
 * Supabase client exchanges the code / hash via detectSessionInUrl.
 */
export function AuthCallbackPage() {
  const { user, loading, passwordRecovery } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [waited, setWaited] = useState(false)

  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 4000)
    return () => window.clearTimeout(t)
  }, [])

  // PKCE: exchange ?code= if present (some flows land with code query)
  useEffect(() => {
    const supabase = tryGetSupabase()
    if (!supabase) return
    const code = params.get('code')
    if (!code) return
    let cancelled = false
    ;(async () => {
      try {
        const { error: exErr } = await getSupabase().auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (exErr) setError(exErr.message)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not complete sign-in')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [params])

  useEffect(() => {
    if (loading) return
    if (passwordRecovery) {
      navigate('/reset-password', { replace: true })
      return
    }
    if (user) {
      navigate('/', { replace: true })
    }
  }, [loading, user, passwordRecovery, navigate])

  useEffect(() => {
    const err = params.get('error_description') || params.get('error')
    if (err) setError(decodeURIComponent(err.replace(/\+/g, ' ')))
  }, [params])

  if (error) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">Sign-in problem</h1>
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
        <Link to="/login">
          <Button variant="secondary">Back to sign in</Button>
        </Link>
      </div>
    )
  }

  if (!loading && waited && !user) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-xl font-semibold">Still signing you in…</h1>
        <p className="text-sm text-[var(--color-muted)]">
          If nothing happens, the OAuth provider may not be enabled in Supabase, or the redirect URL
          is missing. See docs/auth-oauth-smtp.md.
        </p>
        <Link to="/login">
          <Button variant="secondary">Back to sign in</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-center">
      <PageLoader />
      <p className="text-sm text-[var(--color-muted)]">Finishing sign-in…</p>
    </div>
  )
}
