import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  fetchScopeGitHubConfigs,
  fetchTaskGitHubConfigsForTasks,
  syncTaskWithGitHub,
} from '@/features/github/api'
import { isScopeGitHubIntegrated } from '@/features/github/visibility'
import { getSupabase } from '@/lib/supabase/client'

export function AppLayout() {
  const { signOut, profile } = useAuth()
  const { theme, setTheme, resolved } = useTheme()
  const { data: notifications = [] } = useNotifications()
  const markRead = useMarkNotificationRead()
  const respond = useRespondToShareInvite()
  const toast = useToast()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const projectMatch = useMatch('/projects/:scopeId')
  const scopeId = projectMatch?.params.scopeId

  const scopeGhQuery = useQuery({
    queryKey: ['scope-github-configs', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchScopeGitHubConfigs(scopeId!),
    staleTime: 30_000,
  })

  const projectLinked = Boolean(
    scopeId && isScopeGitHubIntegrated(scopeGhQuery.data ?? []),
  )

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

  const handleGithubRefresh = async () => {
    if (!scopeId || refreshing) return
    setRefreshing(true)
    try {
      // Reload local task + GitHub link state
      await qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
      await qc.invalidateQueries({ queryKey: ['scope-github-configs', scopeId] })

      // Soft-pull linked issues when user has integration preference (PAT)
      if (profile?.github_integration_enabled) {
        const { data: tasks } = await getSupabase()
          .from('tasks')
          .select('id')
          .eq('scope_id', scopeId)
        const taskIds = (tasks ?? []).map((t) => t.id as string)
        if (taskIds.length > 0) {
          const links = await fetchTaskGitHubConfigsForTasks(taskIds)
          const linked = links.filter((c) => c.github_issue_number)
          let updated = 0
          // Cap concurrent work for free-tier edge
          for (const link of linked.slice(0, 40)) {
            try {
              await syncTaskWithGitHub(link.task_id, 'pull')
              updated += 1
            } catch {
              /* skip individual failures */
            }
          }
          await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
          await qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
          toast.push(
            updated > 0
              ? `Refreshed ${updated} GitHub issue link${updated === 1 ? '' : 's'}`
              : 'Project data reloaded',
            'success',
          )
        } else {
          toast.push('Project data reloaded', 'success')
        }
      } else {
        toast.push('Project data reloaded', 'success')
      }
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Refresh failed', 'error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="notebook-shell">
      <header className="notebook-nav mx-4 flex items-center justify-between gap-2 px-3 py-2 sm:mx-auto sm:px-4">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {scopeId ? (
            <Link to="/" className={iconBtn} title="All projects">
              <Icons.Home />
            </Link>
          ) : null}
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2 rounded-full px-2 py-1 font-semibold tracking-tight"
            title="Projects home"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)] text-sm text-[var(--color-primary-fg)]">
              PM
            </span>
            <span className="hidden truncate sm:inline">Projects Manager</span>
          </Link>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1">
          {projectLinked ? (
            <button
              type="button"
              className={iconBtn}
              title="Refresh GitHub issue links for this project"
              disabled={refreshing}
              onClick={() => void handleGithubRefresh()}
            >
              <Icons.Refresh className={refreshing ? 'animate-spin' : undefined} />
            </button>
          ) : null}

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

          <NavLink to="/settings" className={iconBtn} title="Settings">
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
              Projects
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
            {projectLinked ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={refreshing}
                onClick={() => {
                  void handleGithubRefresh()
                  setMenuOpen(false)
                }}
              >
                Refresh GitHub
              </Button>
            ) : null}
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
