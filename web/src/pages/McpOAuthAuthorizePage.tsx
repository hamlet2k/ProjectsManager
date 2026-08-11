import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { PageLoader } from '@/components/ui/Spinner'
import { getSupabase } from '@/lib/supabase/client'
import { Icons } from '@/components/icons'

const ALLOWED_CLIENTS = new Set(['projects-manager-mcp', 'projects-manager'])

/**
 * OAuth 2.1 authorization endpoint (PKCE) for Grok Custom Connector and similar.
 * Query: response_type=code&client_id&redirect_uri&state&code_challenge&code_challenge_method&scope
 */
export function McpOAuthAuthorizePage() {
  const { user, loading, configured } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canWrite, setCanWrite] = useState(true)

  const oauth = useMemo(() => {
    const clientId = params.get('client_id') || 'projects-manager-mcp'
    const redirectUri = params.get('redirect_uri') || ''
    const state = params.get('state') || ''
    const codeChallenge = params.get('code_challenge') || ''
    const codeChallengeMethod = params.get('code_challenge_method') || 'S256'
    const scope = params.get('scope') || 'mcp'
    const responseType = params.get('response_type') || 'code'
    return {
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      scope,
      responseType,
    }
  }, [params])

  const validationError = useMemo(() => {
    if (oauth.responseType !== 'code') return 'Only response_type=code is supported.'
    if (!ALLOWED_CLIENTS.has(oauth.clientId)) return `Unknown client_id: ${oauth.clientId}`
    if (!oauth.redirectUri.startsWith('https://')) return 'redirect_uri must be https://'
    if (!oauth.codeChallenge || oauth.codeChallenge.length < 16) {
      return 'code_challenge (PKCE) is required.'
    }
    return null
  }, [oauth])

  if (!configured) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-[var(--color-muted)]">
        Supabase is not configured.
      </div>
    )
  }

  if (loading) return <PageLoader />

  if (!user) {
    const returnTo = `/oauth/mcp/authorize?${params.toString()}`
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16">
        <h1 className="text-xl font-bold">Connect Projects Manager</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Sign in to authorize Grok (or another app) to access your boards via MCP.
        </p>
        <Button
          onClick={() =>
            navigate('/login', { state: { from: { pathname: returnTo } } })
          }
        >
          Sign in to continue
        </Button>
        <p className="text-xs text-[var(--color-muted)]">
          <Link to="/" className="underline">
            Cancel and go home
          </Link>
        </p>
      </div>
    )
  }

  if (validationError) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16">
        <h1 className="text-xl font-bold text-[var(--color-danger)]">Invalid request</h1>
        <p className="text-sm">{validationError}</p>
        <Link to="/">
          <Button variant="secondary">Home</Button>
        </Link>
      </div>
    )
  }

  let redirectHost = oauth.redirectUri
  try {
    redirectHost = new URL(oauth.redirectUri).host
  } catch {
    /* keep raw */
  }

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data: code, error: rpcErr } = await getSupabase().rpc(
        // Generated Database types may lag new migrations
        'create_mcp_oauth_code' as 'create_cli_access_token',
        {
          p_client_id: oauth.clientId,
          p_redirect_uri: oauth.redirectUri,
          p_code_challenge: oauth.codeChallenge,
          p_code_challenge_method: oauth.codeChallengeMethod,
          p_scope: oauth.scope,
          p_can_write: canWrite,
        } as never,
      )
      if (rpcErr) throw new Error(rpcErr.message)
      if (!code || typeof code !== 'string') throw new Error('No authorization code returned')

      const target = new URL(oauth.redirectUri)
      target.searchParams.set('code', code)
      if (oauth.state) target.searchParams.set('state', oauth.state)
      window.location.assign(target.toString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authorization failed')
      setBusy(false)
    }
  }

  const deny = () => {
    try {
      const target = new URL(oauth.redirectUri)
      target.searchParams.set('error', 'access_denied')
      target.searchParams.set('error_description', 'User denied access')
      if (oauth.state) target.searchParams.set('state', oauth.state)
      window.location.assign(target.toString())
    } catch {
      navigate('/')
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-12">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm font-bold text-[var(--color-primary-fg)]">
          PM
        </span>
        <div>
          <h1 className="text-xl font-bold">Authorize access</h1>
          <p className="text-xs text-[var(--color-muted)]">Projects Manager MCP</p>
        </div>
      </div>

      <p className="text-sm text-[var(--color-text)]">
        <strong className="font-semibold">{redirectHost}</strong> wants to connect to your Projects
        Manager boards using MCP (list and manage tasks you allow).
      </p>

      <ul className="list-inside list-disc space-y-1 text-sm text-[var(--color-muted)]">
        <li>Signed in as {user.email || user.id}</li>
        <li>Scope: {oauth.scope || 'mcp'}</li>
        <li>A personal access token will be created (you can revoke it in Settings)</li>
      </ul>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={canWrite}
          onChange={(e) => setCanWrite(e.target.checked)}
        />
        Allow create / update / complete / delete (uncheck for read-only)
      </label>

      {error ? (
        <p className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => void approve()}>
          {busy ? 'Authorizing…' : 'Allow'}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={deny}>
          Deny
        </Button>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        <Icons.Help className="mr-1 inline" size="0.9em" />
        After connecting, manage tokens under Settings → CLI &amp; chat connectors.
      </p>
    </div>
  )
}
