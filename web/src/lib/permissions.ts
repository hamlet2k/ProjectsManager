import type { ShareRole, Scope, ScopeShare } from '@/lib/supabase/types'

export type ScopeAccess = {
  isOwner: boolean
  role: ShareRole | 'owner' | null
  canView: boolean
  canEdit: boolean
  canManageShares: boolean
  canDeleteScope: boolean
}

export function computeScopeAccess(
  scope: Pick<Scope, 'owner_id'> | null | undefined,
  userId: string | null | undefined,
  share: Pick<ScopeShare, 'role' | 'status'> | null | undefined,
): ScopeAccess {
  if (!scope || !userId) {
    return {
      isOwner: false,
      role: null,
      canView: false,
      canEdit: false,
      canManageShares: false,
      canDeleteScope: false,
    }
  }

  if (scope.owner_id === userId) {
    return {
      isOwner: true,
      role: 'owner',
      canView: true,
      canEdit: true,
      canManageShares: true,
      canDeleteScope: true,
    }
  }

  if (share?.status === 'accepted') {
    const canEdit = share.role === 'editor'
    return {
      isOwner: false,
      role: share.role,
      canView: true,
      canEdit,
      canManageShares: false,
      canDeleteScope: false,
    }
  }

  return {
    isOwner: false,
    role: null,
    canView: false,
    canEdit: false,
    canManageShares: false,
    canDeleteScope: false,
  }
}
