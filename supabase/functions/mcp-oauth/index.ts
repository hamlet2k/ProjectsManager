/**
 * OAuth 2.1 (PKCE) endpoints for remote MCP connectors (Grok Custom Connector form).
 *
 * Paths (same function URL + path suffix):
 *   GET  /functions/v1/mcp-oauth/.well-known/oauth-authorization-server
 *   POST /functions/v1/mcp-oauth/token
 *   GET  /functions/v1/mcp-oauth  → metadata / help
 *
 * Authorization UI lives on the SPA: /oauth/mcp/authorize
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const CLIENT_ID = 'projects-manager-mcp'
const SITE_URL = (
  Deno.env.get('PUBLIC_SITE_URL') ||
  Deno.env.get('SITE_URL') ||
  'https://projects-manager-navy.vercel.app'
).replace(/\/$/, '')

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  })
}

function formError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status)
}

function pathOf(req: Request): string {
  const u = new URL(req.url)
  // /functions/v1/mcp-oauth/... → remainder
  const marker = '/mcp-oauth'
  const i = u.pathname.indexOf(marker)
  if (i === -1) return '/'
  const rest = u.pathname.slice(i + marker.length) || '/'
  return rest.startsWith('/') ? rest : `/${rest}`
}

function authorizationServerMetadata(req: Request) {
  const u = new URL(req.url)
  // Edge gateway may present http; connectors require https
  const origin = u.origin.replace(/^http:\/\//i, 'https://')
  const base = `${origin}/functions/v1/mcp-oauth`
  return {
    issuer: base,
    authorization_endpoint: `${SITE_URL}/oauth/mcp/authorize`,
    token_endpoint: `${base}/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp', 'mcp:read', 'mcp:write'],
    client_id_metadata_document_supported: false,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const path = pathOf(req)

    // OAuth AS metadata (RFC 8414) — some clients probe this
    if (
      req.method === 'GET' &&
      (path === '/.well-known/oauth-authorization-server' ||
        path === '/.well-known/openid-configuration' ||
        path === '/')
    ) {
      return json(authorizationServerMetadata(req))
    }

    if (req.method === 'POST' && (path === '/token' || path === '/')) {
      const contentType = req.headers.get('content-type') || ''
      let params: URLSearchParams
      if (contentType.includes('application/json')) {
        const body = (await req.json().catch(() => ({}))) as Record<string, string>
        params = new URLSearchParams()
        for (const [k, v] of Object.entries(body)) {
          if (v != null) params.set(k, String(v))
        }
      } else {
        const text = await req.text()
        params = new URLSearchParams(text)
      }

      const grantType = params.get('grant_type') || ''
      if (grantType !== 'authorization_code') {
        return formError('unsupported_grant_type', 'Only authorization_code is supported')
      }

      const code = params.get('code') || ''
      const redirectUri = params.get('redirect_uri') || ''
      const clientId = params.get('client_id') || CLIENT_ID
      const codeVerifier = params.get('code_verifier') || ''

      if (!code || !redirectUri || !codeVerifier) {
        return formError(
          'invalid_request',
          'code, redirect_uri, and code_verifier are required',
        )
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const admin = createClient(supabaseUrl, serviceKey)

      const { data, error } = await admin.rpc('exchange_mcp_oauth_code', {
        p_code: code,
        p_client_id: clientId,
        p_redirect_uri: redirectUri,
        p_code_verifier: codeVerifier,
      })

      if (error) {
        console.error('exchange_mcp_oauth_code', error.message)
        return formError('invalid_grant', error.message, 400)
      }

      const row = Array.isArray(data) ? data[0] : data
      if (!row?.access_token) {
        return formError('invalid_grant', 'Token exchange failed', 400)
      }

      return json({
        access_token: row.access_token,
        token_type: row.token_type || 'Bearer',
        expires_in: row.expires_in ?? 31536000,
        scope: row.scope || 'mcp',
      })
    }

    return json(
      {
        error: 'not_found',
        hint: 'POST /token for OAuth token exchange; GET / for AS metadata',
        authorization_endpoint: `${SITE_URL}/oauth/mcp/authorize`,
        client_id: CLIENT_ID,
      },
      404,
    )
  } catch (e) {
    console.error(e)
    return formError('server_error', e instanceof Error ? e.message : 'Internal error', 500)
  }
})
