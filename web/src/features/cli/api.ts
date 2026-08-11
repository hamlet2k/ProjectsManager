import { getSupabase } from '@/lib/supabase/client'

export type CliAccessTokenRow = {
  id: string
  name: string
  token_prefix: string
  scope_ids: string[] | null
  can_write: boolean
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export type CreatedCliToken = {
  id: string
  token: string
  token_prefix: string
  name: string
  scope_ids: string[] | null
  can_write: boolean
  created_at: string
}

export async function listCliAccessTokens(): Promise<CliAccessTokenRow[]> {
  const { data, error } = await getSupabase()
    .from('cli_access_tokens')
    .select('id, name, token_prefix, scope_ids, can_write, last_used_at, revoked_at, created_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CliAccessTokenRow[]
}

function rpcErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; details?: string; hint?: string }
    const parts = [e.message, e.details, e.hint].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function createCliAccessToken(input: {
  name: string
  scopeIds: string[] | null
  canWrite: boolean
}): Promise<CreatedCliToken> {
  const { data, error } = await getSupabase().rpc('create_cli_access_token', {
    p_name: input.name,
    p_scope_ids: input.scopeIds,
    p_can_write: input.canWrite,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Create failed'))
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.token) throw new Error('Token create returned empty')
  return row as CreatedCliToken
}

export async function revokeCliAccessToken(id: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('revoke_cli_access_token', { p_id: id })
  if (error) throw new Error(rpcErrorMessage(error, 'Revoke failed'))
  return Boolean(data)
}

/** Public Supabase URL for CLI docs (from Vite env). */
export function getSupabaseProjectUrl(): string {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') || ''
}

export function getSupabaseAnonKey(): string {
  return (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || ''
}

/** Remote MCP Streamable HTTP endpoint (Grok web connectors, etc.). */
export function getRemoteMcpUrl(): string {
  const base = getSupabaseProjectUrl()
  return base ? `${base}/functions/v1/mcp` : ''
}
