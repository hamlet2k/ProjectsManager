import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
import { Button } from '@/components/ui/Button'
import { cn, formatRelative } from '@/lib/utils'
import {
  useMarkNotificationRead,
  useNotifications,
  useRespondToShareInvite,
} from '@/features/notifications/hooks'
import { useToast } from '@/components/ui/Toast'
import { Icons } from '@/components/icons'
import { FeedbackModal } from '@/features/feedback/FeedbackModal'

export function AppLayout() {
  const { signOut } = useAuth()
  const { theme, setTheme, resolved } = useTheme()
  const { data: notifications = [] } = useNotifications()
  const markRead = useMarkNotificationRead()
  const respond = useRespondToShareInvite()
  const toast = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read_at && !n.resolved_at).length
  const preview = notifications.slice(0, 8)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!notifRef.current?.contains(e.target as Node)) setNotifOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'

  return (
    <div className="notebook-shell">
      <header className="notebook-nav mx-4 flex items-center justify-between gap-2 px-3 py-2 sm:mx-auto sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-full px-2 py-1 font-semibold tracking-tight"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm text-[var(--color-primary-fg)]">
              PM
            </span>
            <span className="hidden sm:inline">Projects Manager</span>
          </Link>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <button
            type="button"
            className={iconBtn}
            title="Refresh"
            onClick={() => window.location.reload()}
          >
            <Icons.Refresh />
          </button>

          <button
            type="button"
            className={iconBtn}
            title="Feedback"
            onClick={() => setFeedbackOpen(true)}
          >
            <Icons.Feedback />
          </button>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              className={cn(iconBtn, 'relative')}
              title="Notifications"
              onClick={() => setNotifOpen((v) => !v)}
            >
              <Icons.Bell />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-bold text-[var(--color-primary-fg)]">
                  {unread}
                </span>
              ) : null}
            </button>
            {notifOpen ? (
              <div className="notif-dropdown">
                <div className="border-b border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
                  Notifications
                </div>
                {preview.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                    No notifications
                  </p>
                ) : (
                  <ul className="max-h-80 overflow-y-auto">
                    {preview.map((n) => (
                      <li
                        key={n.id}
                        className="border-b border-[var(--color-border)] px-3 py-2.5 last:border-0"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium leading-snug">{n.title}</p>
                            <p className="mt-0.5 text-xs text-[var(--color-muted)]">{n.message}</p>
                            <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                              {formatRelative(n.created_at)}
                            </p>
                          </div>
                          {n.requires_action &&
                          n.notification_type === 'scope_share_invite' &&
                          n.share_id &&
                          n.status === 'pending' ? (
                            <div className="flex shrink-0 flex-col gap-1">
                              <button
                                type="button"
                                className="rounded-md bg-green-600 px-2 py-0.5 text-xs font-semibold text-white"
                                onClick={async () => {
                                  try {
                                    await respond.mutateAsync({
                                      shareId: n.share_id!,
                                      status: 'accepted',
                                    })
                                    toast.push('Invitation accepted', 'success')
                                  } catch (e) {
                                    toast.push(
                                      e instanceof Error ? e.message : 'Failed',
                                      'error',
                                    )
                                  }
                                }}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-xs"
                                onClick={async () => {
                                  try {
                                    await respond.mutateAsync({
                                      shareId: n.share_id!,
                                      status: 'rejected',
                                    })
                                  } catch (e) {
                                    toast.push(
                                      e instanceof Error ? e.message : 'Failed',
                                      'error',
                                    )
                                  }
                                }}
                              >
                                Decline
                              </button>
                            </div>
                          ) : n.status === 'accepted' ? (
                            <span className="shrink-0 rounded-md bg-green-600 px-2 py-0.5 text-xs font-semibold text-white">
                              Accepted
                            </span>
                          ) : !n.read_at ? (
                            <button
                              type="button"
                              className="text-xs text-[var(--color-muted)] underline"
                              onClick={() => markRead.mutate(n.id)}
                            >
                              Mark read
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="w-full border-t border-[var(--color-border)] px-3 py-2 text-center text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
                  onClick={() => {
                    setNotifOpen(false)
                    navigate('/notifications')
                  }}
                >
                  View all notifications
                </button>
              </div>
            ) : null}
          </div>

          <NavLink to="/settings" className={iconBtn} title="Profile / Settings">
            <Icons.User />
          </NavLink>
          <NavLink to="/settings" className={cn(iconBtn, 'hidden sm:inline-flex')} title="Settings">
            <Icons.Settings />
          </NavLink>

          <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" />

          <button
            type="button"
            className={iconBtn}
            title={
              theme === 'system'
                ? `Theme: system (currently ${resolved})`
                : `Theme: ${theme}`
            }
            onClick={() => {
              const order = ['light', 'dark', 'system'] as const
              const idx = order.indexOf(theme)
              setTheme(order[(idx + 1) % order.length]!)
            }}
          >
            {theme === 'system' ? (
              <Icons.System />
            ) : theme === 'dark' ? (
              <Icons.Moon />
            ) : (
              <Icons.Sun />
            )}
          </button>

          <button
            type="button"
            className={cn(iconBtn, 'hidden sm:inline-flex')}
            title="Sign out"
            onClick={() => signOut()}
          >
            <Icons.Logout />
          </button>

          <button
            type="button"
            className={cn(iconBtn, 'sm:hidden')}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Menu"
          >
            ☰
          </button>
        </div>
      </header>

      {menuOpen ? (
        <div className="mx-4 mt-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 sm:hidden">
          <nav className="flex flex-col gap-1 text-sm">
            <Link
              className="rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]"
              to="/"
              onClick={() => setMenuOpen(false)}
            >
              Scopes
            </Link>
            <Link
              className="rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]"
              to="/notifications"
              onClick={() => setMenuOpen(false)}
            >
              Notifications {unread > 0 ? `(${unread})` : ''}
            </Link>
            <Link
              className="rounded-lg px-3 py-2 hover:bg-[var(--color-surface-2)]"
              to="/settings"
              onClick={() => setMenuOpen(false)}
            >
              Settings
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFeedbackOpen(true)
                setMenuOpen(false)
              }}
            >
              Feedback
            </Button>
            <Button variant="secondary" size="sm" onClick={() => signOut()}>
              Sign out
            </Button>
          </nav>
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
