import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import {
  acceptInviteToken,
  createInviteLink,
  createScope,
  deleteScope,
  fetchAccessibleScopes,
  fetchScope,
  fetchScopeShares,
  inviteToScope,
  listInviteLinks,
  revokeInviteLink,
  searchProfiles,
  updateScope,
  updateShare,
} from './api'
import type { ShareRole } from '@/lib/supabase/types'
import { getSupabase } from '@/lib/supabase/client'

export function useScopes() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['scopes', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchAccessibleScopes(user!.id),
  })

  useEffect(() => {
    if (!user?.id) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(`scopes-list:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scopes' }, () => {
        qc.invalidateQueries({ queryKey: ['scopes', user.id] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scope_shares' }, () => {
        qc.invalidateQueries({ queryKey: ['scopes', user.id] })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, qc])

  return query
}

export function useScope(scopeId: string | undefined) {
  return useQuery({
    queryKey: ['scope', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchScope(scopeId!),
  })
}

export function useCreateScope() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      createScope({ ...input, ownerId: user!.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scopes', user?.id] }),
  })
}

export function useUpdateScope() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; name?: string; description?: string | null; rank?: number }) => {
      const { id, ...patch } = input
      return updateScope(id, patch)
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['scopes', user?.id] })
      qc.invalidateQueries({ queryKey: ['scope', data.id] })
    },
  })
}

export function useDeleteScope() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteScope(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scopes', user?.id] }),
  })
}

export function useScopeShares(scopeId: string | undefined) {
  return useQuery({
    queryKey: ['scope-shares', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchScopeShares(scopeId!),
  })
}

export function useInviteToScope(scopeId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { userId: string; role: ShareRole }) =>
      inviteToScope({
        scopeId,
        userId: input.userId,
        inviterId: user!.id,
        role: input.role,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scope-shares', scopeId] }),
  })
}

export function useUpdateShare(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { shareId: string; role?: ShareRole; status?: 'revoked' | 'accepted' | 'rejected' }) =>
      updateShare(input.shareId, { role: input.role, status: input.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scope-shares', scopeId] }),
  })
}

export function useInviteLinks(scopeId: string | undefined) {
  return useQuery({
    queryKey: ['scope-invites', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => listInviteLinks(scopeId!),
  })
}

export function useCreateInviteLink(scopeId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { role: ShareRole; maxUses?: number | null }) =>
      createInviteLink({
        scopeId,
        createdBy: user!.id,
        role: input.role,
        maxUses: input.maxUses,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scope-invites', scopeId] }),
  })
}

export function useRevokeInviteLink(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeInviteLink(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scope-invites', scopeId] }),
  })
}

export function useAcceptInvite() {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (token: string) => acceptInviteToken(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scopes', user?.id] }),
  })
}

export function useProfileSearch(query: string) {
  return useQuery({
    queryKey: ['profile-search', query],
    enabled: query.trim().length >= 2,
    queryFn: () => searchProfiles(query.trim()),
  })
}
