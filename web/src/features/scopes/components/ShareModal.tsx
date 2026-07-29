import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import {
  useCreateInviteLink,
  useInviteLinks,
  useInviteToScope,
  useProfileSearch,
  useRevokeInviteLink,
  useScopeShares,
  useUpdateShare,
} from '@/features/scopes/hooks'
import { useAuth } from '@/app/providers/AuthProvider'
import { copyToClipboard, inviteUrl } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { ShareRole } from '@/lib/supabase/types'
import { getSupabase } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'

type Props = {
  open: boolean
  onClose: () => void
  scopeId: string
}

export function ShareModal({ open, onClose, scopeId }: Props) {
  const { user } = useAuth()
  const toast = useToast()
  const { data: shares = [] } = useScopeShares(open ? scopeId : undefined)
  const { data: invites = [] } = useInviteLinks(open ? scopeId : undefined)
  const inviteMut = useInviteToScope(scopeId)
  const updateShare = useUpdateShare(scopeId)
  const createLink = useCreateInviteLink(scopeId)
  const revokeLink = useRevokeInviteLink(scopeId)

  const [query, setQuery] = useState('')
  const [role, setRole] = useState<ShareRole>('editor')
  const { data: results = [] } = useProfileSearch(query)

  const userIds = useMemo(
    () => Array.from(new Set(shares.map((s) => s.user_id).filter(Boolean))),
    [shares],
  )

  const profilesQuery = useQuery({
    queryKey: ['share-profiles', userIds],
    enabled: open && userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('profiles')
        .select('id, username, name, email')
        .in('id', userIds)
      if (error) throw error
      return data as Array<{ id: string; username: string; name: string; email: string }>
    },
  })

  const profileMap = useMemo(() => {
    const m = new Map<string, { username: string; name: string; email: string }>()
    for (const p of profilesQuery.data ?? []) m.set(p.id, p)
    return m
  }, [profilesQuery.data])

  return (
    <Modal open={open} onClose={onClose} title="Share scope" size="lg">
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Invite by username or email</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search users…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1"
            />
            <select
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole)}
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          {results.length > 0 ? (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-[var(--color-border)]">
              {results.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {p.name} <span className="text-[var(--color-muted)]">@{p.username}</span>
                    </div>
                    <div className="truncate text-xs text-[var(--color-muted)]">{p.email}</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={inviteMut.isPending || p.id === user?.id}
                    onClick={async () => {
                      try {
                        await inviteMut.mutateAsync({ userId: p.id, role })
                        toast.push('Invitation sent', 'success')
                        setQuery('')
                      } catch (e) {
                        toast.push(e instanceof Error ? e.message : 'Invite failed', 'error')
                      }
                    }}
                  >
                    Invite
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Invite link</h3>
            <Button
              size="sm"
              variant="secondary"
              disabled={createLink.isPending}
              onClick={async () => {
                try {
                  const inv = await createLink.mutateAsync({ role: 'editor' })
                  const url = inviteUrl(inv.token)
                  const ok = await copyToClipboard(url)
                  toast.push(ok ? 'Invite link copied' : url, 'success')
                } catch (e) {
                  toast.push(e instanceof Error ? e.message : 'Could not create link', 'error')
                }
              }}
            >
              Create & copy link
            </Button>
          </div>
          {invites.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">No active invite links.</p>
          ) : (
            <ul className="space-y-2">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <code className="break-all text-xs">{inviteUrl(inv.token)}</code>
                    <div className="mt-1 flex gap-2 text-xs text-[var(--color-muted)]">
                      <Badge>{inv.role}</Badge>
                      <span>uses: {inv.use_count}{inv.max_uses != null ? `/${inv.max_uses}` : ''}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const ok = await copyToClipboard(inviteUrl(inv.token))
                        toast.push(ok ? 'Copied' : 'Copy failed', ok ? 'success' : 'error')
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => revokeLink.mutate(inv.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">People with access</h3>
          {shares.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">Not shared with anyone yet.</p>
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => {
                const p = profileMap.get(s.user_id)
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {p?.name ?? s.user_id.slice(0, 8)}
                        {p ? (
                          <span className="text-[var(--color-muted)]"> @{p.username}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex gap-2">
                        <Badge
                          tone={
                            s.status === 'accepted'
                              ? 'success'
                              : s.status === 'pending'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {s.status}
                        </Badge>
                        <Badge>{s.role}</Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {s.status === 'accepted' || s.status === 'pending' ? (
                        <>
                          <select
                            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                            value={s.role}
                            onChange={(e) =>
                              updateShare.mutate({
                                shareId: s.id,
                                role: e.target.value as ShareRole,
                              })
                            }
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => updateShare.mutate({ shareId: s.id, status: 'revoked' })}
                          >
                            Revoke
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <Field label="Role for new invites">
          <p className="text-xs text-[var(--color-muted)]">
            Editors can create and complete tasks. Viewers can only read. Only you can rename or
            delete this scope.
          </p>
        </Field>
      </div>
    </Modal>
  )
}
