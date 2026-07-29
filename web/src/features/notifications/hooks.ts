import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase/client'
import type { Notification, ShareStatus } from '@/lib/supabase/types'
import { useAuth } from '@/app/providers/AuthProvider'

export function useNotifications() {
  const { user } = useAuth()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as Notification[]
    },
  })

  useEffect(() => {
    if (!user?.id) return
    const supabase = getSupabase()
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['notifications', user.id] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id, qc])

  return query
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabase()
        .from('notifications')
        .update({
          read_at: new Date().toISOString(),
          status: 'read',
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}

export function useRespondToShareInvite() {
  const qc = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: async (input: { shareId: string; status: Extract<ShareStatus, 'accepted' | 'rejected'> }) => {
      const { error } = await getSupabase()
        .from('scope_shares')
        .update({ status: input.status })
        .eq('id', input.shareId)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications', user?.id] })
      qc.invalidateQueries({ queryKey: ['scopes'] })
    },
  })
}
