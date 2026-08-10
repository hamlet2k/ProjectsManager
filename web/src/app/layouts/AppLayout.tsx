import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
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

const KOFI_URL = 'https://ko-fi.com/hamlet2k'

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
  const menuRef = useRef<HTMLDivElement>(null)

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
      const t = e.target as Node
      if (!notifRef.current?.contains(t)) setNotifOpen(false)
      if (!menuRef.current?.contains(t)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const iconBtn =
    'inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]'

  /** Shared style for every row in the mobile overflow menu (links + actions). */
  const menuItemClass =
    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--color-text)] transition hover:bg-[var(--color-surface-2)] disabled:cursor-not-allowed disabled:opacity-50'

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const
    const idx = order.indexOf(theme)
    setTheme(order[(idx + 1) % order.length]!)
  }

  const themeLabel =
    theme === 'system'
      ? `Theme: system (${resolved})`
      : theme === 'dark'
        ? 'Theme: dark'
        : 'Theme: light'

  const ThemeIcon =
    theme === 'system' ? Icons.System : theme === 'dark' ? Icons.Moon : Icons.Sun

  const closeMenu = () => setMenuOpen(false)

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
          {/* Desktop / tablet: full icon toolbar */}
          {projectLinked ? (
            <button
              type="button"
              className={cn(iconBtn, 'hidden sm:inline-flex')}
              title="Refresh GitHub issue links for this project"
              disabled={refreshing}
              onClick={() => void handleGithubRefresh()}
            >
              <Icons.Refresh className={refreshing ? 'animate-spin' : undefined} />
            </button>
          ) : null}

          <button
            type="button"
            className={cn(iconBtn, 'hidden sm:inline-flex')}
            title="Feedback"
            onClick={() => setFeedbackOpen(true)}
          >
            <Icons.Feedback />
          </button>

          <a
            href={KOFI_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(iconBtn, 'hidden sm:inline-flex text-[#FF5E5B] hover:text-[#FF5E5B]')}
            title="Support on Ko-fi"
          >
            <Icons.Heart />
          </a>

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              className={cn(iconBtn, 'relative')}
              title="Notifications"
              onClick={() => {
                setNotifOpen((v) => !v)
                setMenuOpen(false)
              }}
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

          <NavLink
            to="/settings"
            className={cn(iconBtn, 'hidden sm:inline-flex')}
            title="Settings"
          >
            <Icons.Settings />
          </NavLink>

          <span className="mx-1 hidden h-5 w-px bg-[var(--color-border)] sm:block" />

          <button
            type="button"
            className={cn(iconBtn, 'hidden sm:inline-flex')}
            title={themeLabel}
            onClick={cycleTheme}
          >
            <ThemeIcon />
          </button>

          <button
            type="button"
            className={cn(iconBtn, 'hidden sm:inline-flex')}
            title="Sign out"
            onClick={() => signOut()}
          >
            <Icons.Logout />
          </button>

          {/* Mobile overflow menu */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              type="button"
              className={iconBtn}
              title={menuOpen ? 'Close menu' : 'Menu'}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setMenuOpen((v) => !v)
                setNotifOpen(false)
              }}
            >
              {menuOpen ? <Icons.X /> : <Icons.Menu />}
            </button>

            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,18rem)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.14)]"
              >
                <nav className="flex flex-col">
                  <Link
                    role="menuitem"
                    className={menuItemClass}
                    to="/"
                    onClick={closeMenu}
                  >
                    <Icons.Home size="1.1em" className="shrink-0 text-[var(--color-muted)]" />
                    Projects
                  </Link>
                  <Link
                    role="menuitem"
                    className={menuItemClass}
                    to="/notifications"
                    onClick={closeMenu}
                  >
                    <span className="relative inline-flex shrink-0">
                      <Icons.Bell size="1.1em" className="text-[var(--color-muted)]" />
                      {unread > 0 ? (
                        <span className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--color-primary)] px-0.5 text-[9px] font-bold text-[var(--color-primary-fg)]">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      ) : null}
                    </span>
                    Notifications
                    {unread > 0 ? (
                      <span className="ml-auto text-xs text-[var(--color-muted)]">
                        {unread} new
                      </span>
                    ) : null}
                  </Link>
                  <Link
                    role="menuitem"
                    className={menuItemClass}
                    to="/settings"
                    onClick={closeMenu}
                  >
                    <Icons.Settings size="1.1em" className="shrink-0 text-[var(--color-muted)]" />
                    Settings
                  </Link>

                  <div
                    className="my-1 border-t border-[var(--color-border)]"
                    role="separator"
                  />

                  {projectLinked ? (
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemClass}
                      disabled={refreshing}
                      onClick={() => {
                        void handleGithubRefresh()
                        closeMenu()
                      }}
                    >
                      <Icons.Refresh
                        size="1.1em"
                        className={cn(
                          'shrink-0 text-[var(--color-muted)]',
                          refreshing && 'animate-spin',
                        )}
                      />
                      {refreshing ? 'Refreshing…' : 'Refresh GitHub'}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => {
                      setFeedbackOpen(true)
                      closeMenu()
                    }}
                  >
                    <Icons.Feedback size="1.1em" className="shrink-0 text-[var(--color-muted)]" />
                    Feedback
                  </button>

                  <a
                    role="menuitem"
                    className={menuItemClass}
                    href={KOFI_URL}
                    target="_blank"
                    rel="noreferrer"
                    onClick={closeMenu}
                  >
                    <Icons.HeartFill size="1.1em" className="shrink-0 text-[#FF5E5B]" />
                    Support on Ko-fi
                  </a>

                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => {
                      cycleTheme()
                      // Keep menu open so user can cycle theme again if needed
                    }}
                  >
                    <ThemeIcon size="1.1em" className="shrink-0 text-[var(--color-muted)]" />
                    {themeLabel}
                  </button>

                  <div
                    className="my-1 border-t border-[var(--color-border)]"
                    role="separator"
                  />

                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemClass}
                    onClick={() => {
                      closeMenu()
                      void signOut()
                    }}
                  >
                    <Icons.Logout size="1.1em" className="shrink-0 text-[var(--color-muted)]" />
                    Sign out
                  </button>
                </nav>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
