import { getSupabase } from '@/lib/supabase/client'
import type { Scope, ScopeInvite, ScopeShare, ShareRole, Task } from '@/lib/supabase/types'

export async function fetchAccessibleScopes(userId: string): Promise<
  Array<Scope & { role: ShareRole | 'owner'; share_status?: string }>
> {
  const supabase = getSupabase()

  const [{ data: owned, error: ownedErr }, { data: shares, error: shareErr }] = await Promise.all([
    supabase.from('scopes').select('*').eq('owner_id', userId).order('rank'),
    supabase.from('scope_shares').select('*').eq('user_id', userId).eq('status', 'accepted'),
  ])

  if (ownedErr) throw ownedErr
  if (shareErr) throw shareErr

  const ownedList = ((owned ?? []) as Scope[]).map((s) => ({
    ...s,
    role: 'owner' as const,
  }))

  const shareRows = (shares ?? []) as ScopeShare[]
  const sharedScopeIds = shareRows.map((s) => s.scope_id)
  let sharedScopes: Scope[] = []
  if (sharedScopeIds.length > 0) {
    const { data: sharedData, error: sharedScopesErr } = await supabase
      .from('scopes')
      .select('*')
      .in('id', sharedScopeIds)
    if (sharedScopesErr) throw sharedScopesErr
    sharedScopes = (sharedData ?? []) as Scope[]
  }
  const scopeById = new Map(sharedScopes.map((s) => [s.id, s]))

  const sharedList = shareRows
    .map((r) => {
      const scope = scopeById.get(r.scope_id)
      if (!scope) return null
      return {
        ...scope,
        role: r.role as ShareRole,
        share_status: r.status,
      }
    })
    .filter(Boolean) as Array<Scope & { role: ShareRole; share_status?: string }>

  const byId = new Map<string, Scope & { role: ShareRole | 'owner'; share_status?: string }>()
  for (const s of [...ownedList, ...sharedList]) {
    byId.set(s.id, s)
  }

  return Array.from(byId.values()).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
}

export async function createScope(input: {
  name: string
  description?: string
  ownerId: string
}) {
  const supabase = getSupabase()

  // Server-side RPC: sets owner_id = auth.uid() and inserts as SECURITY DEFINER
  // (avoids client INSERT RLS edge cases while remaining ownership-safe).
  const { data, error } = await supabase.rpc('create_scope', {
    p_name: input.name,
    p_description: input.description ?? null,
  })

  if (error) {
    const msg = error.message || 'Failed to create project'
    if (msg.toLowerCase().includes('could not find the function') || error.code === 'PGRST202') {
      throw new Error(
        'create_scope is missing in Supabase. Run supabase/migrations/20260727000003_create_scope_rpc.sql in the SQL Editor, then retry.',
      )
    }
    if (msg.toLowerCase().includes('not authenticated')) {
      throw new Error('Not signed in. Sign out and sign back in with your email.')
    }
    if (msg.toLowerCase().includes('profile missing')) {
      throw new Error(
        'Profile missing. Run the profiles SQL fix, then sign out and sign back in.',
      )
    }
    throw new Error(msg)
  }

  // rpc may return a single object or (rarely) an array depending on PostgREST typing
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new Error('Project was not returned from the server')
  return row as Scope
}

export async function updateScope(
  id: string,
  patch: Partial<Pick<Scope, 'name' | 'description' | 'rank'>>,
) {
  const { data, error } = await getSupabase()
    .from('scopes')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Scope
}

export async function deleteScope(id: string) {
  const { error } = await getSupabase().from('scopes').delete().eq('id', id)
  if (error) throw error
}

export async function fetchScope(id: string) {
  const { data, error } = await getSupabase().from('scopes').select('*').eq('id', id).single()
  if (error) throw error
  return data as Scope
}

export async function fetchScopeShares(scopeId: string) {
  const { data, error } = await getSupabase()
    .from('scope_shares')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ScopeShare[]
}

export async function inviteToScope(input: {
  scopeId: string
  userId: string
  inviterId: string
  role: ShareRole
}) {
  const { data, error } = await getSupabase()
    .from('scope_shares')
    .upsert(
      {
        scope_id: input.scopeId,
        user_id: input.userId,
        inviter_id: input.inviterId,
        role: input.role,
        status: 'pending',
      },
      { onConflict: 'scope_id,user_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as ScopeShare
}

export async function updateShare(
  shareId: string,
  patch: Partial<Pick<ScopeShare, 'role' | 'status'>>,
) {
  const { data, error } = await getSupabase()
    .from('scope_shares')
    .update(patch)
    .eq('id', shareId)
    .select('*')
    .single()
  if (error) throw error
  return data as ScopeShare
}

export async function createInviteLink(input: {
  scopeId: string
  createdBy: string
  role: ShareRole
  maxUses?: number | null
  expiresAt?: string | null
}) {
  const { data, error } = await getSupabase()
    .from('scope_invites')
    .insert({
      scope_id: input.scopeId,
      created_by: input.createdBy,
      role: input.role,
      max_uses: input.maxUses ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as ScopeInvite
}

export async function listInviteLinks(scopeId: string) {
  const { data, error } = await getSupabase()
    .from('scope_invites')
    .select('*')
    .eq('scope_id', scopeId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ScopeInvite[]
}

export async function revokeInviteLink(id: string) {
  const { error } = await getSupabase()
    .from('scope_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function acceptInviteToken(token: string) {
  const { data, error } = await getSupabase().rpc('accept_scope_invite', { p_token: token })
  if (error) throw error
  return data as ScopeShare
}

export async function searchProfiles(query: string) {
  const { data, error } = await getSupabase().rpc('search_profiles', { p_query: query })
  if (error) throw error
  return (data ?? []) as Array<{ id: string; username: string; name: string; email: string }>
}

export async function reorderScopes(orderedIds: string[]) {
  const supabase = getSupabase()
  const updates = orderedIds.map((id, index) =>
    supabase.from('scopes').update({ rank: index + 1 }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export async function exportScopeTasksText(scopeId: string): Promise<string> {
  const { data: tasks, error } = await getSupabase()
    .from('tasks')
    .select('*')
    .eq('scope_id', scopeId)
    .order('rank')
  if (error) throw error
  const list = (tasks ?? []) as Task[]
  return list
    .map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.name}`)
    .join('\n')
}
