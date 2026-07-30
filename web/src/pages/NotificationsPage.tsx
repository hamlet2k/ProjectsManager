import {
  useMarkNotificationRead,
  useNotifications,
  useRespondToShareInvite,
} from '@/features/notifications/hooks'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { formatRelative } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { Link } from 'react-router-dom'

export function NotificationsPage() {
  const { data: notifications = [], isLoading } = useNotifications()
  const markRead = useMarkNotificationRead()
  const respond = useRespondToShareInvite()
  const toast = useToast()

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Share invites and collaboration updates.
        </p>
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="All caught up" description="No notifications yet." />
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li
              key={n.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{n.title}</h2>
                    <Badge
                      tone={
                        n.status === 'pending' && n.requires_action
                          ? 'warning'
                          : n.read_at
                            ? 'default'
                            : 'primary'
                      }
                    >
                      {n.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{n.message}</p>
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    {formatRelative(n.created_at)}
                    {n.scope_id ? (
                      <>
                        {' · '}
                        <Link
                          className="text-[var(--color-primary)] hover:underline"
                          to={`/projects/${n.scope_id}`}
                        >
                          Open project
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {n.requires_action &&
                  n.notification_type === 'scope_share_invite' &&
                  n.share_id &&
                  n.status === 'pending' ? (
                    <>
                      <Button
                        size="sm"
                        onClick={async () => {
                          try {
                            await respond.mutateAsync({
                              shareId: n.share_id!,
                              status: 'accepted',
                            })
                            toast.push('Invitation accepted', 'success')
                          } catch (e) {
                            toast.push(e instanceof Error ? e.message : 'Failed', 'error')
                          }
                        }}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await respond.mutateAsync({
                              shareId: n.share_id!,
                              status: 'rejected',
                            })
                            toast.push('Invitation declined', 'info')
                          } catch (e) {
                            toast.push(e instanceof Error ? e.message : 'Failed', 'error')
                          }
                        }}
                      >
                        Decline
                      </Button>
                    </>
                  ) : !n.read_at ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markRead.mutate(n.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
