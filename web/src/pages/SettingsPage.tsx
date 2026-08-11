import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  deleteGitHubToken,
  disableMyGitHubScopeConfigs,
  getGitHubTokenStatus,
  saveGitHubToken,
  testGitHubConnection,
} from '@/features/github/api'
import type { ThemePref } from '@/lib/supabase/types'
import {
  SHORTCUT_CATALOG,
  chordFromEvent,
  formatBinding,
  resetAllBindings,
  resetBinding,
  setBinding,
  type ShortcutId,
} from '@/lib/keyboardPrefs'
import { CliAccessSection } from '@/features/cli/CliAccessSection'
import { HelpSlugs, HelpTitle } from '@/features/help'
import { getSupabase } from '@/lib/supabase/client'

function KeyboardShortcutsSection() {
  const toast = useToast()
  const [listeningId, setListeningId] = useState<ShortcutId | null>(null)
  const [, bump] = useState(0)

  useEffect(() => {
    const fn = () => bump((n) => n + 1)
    window.addEventListener('pm-keyboard-prefs-changed', fn)
    return () => window.removeEventListener('pm-keyboard-prefs-changed', fn)
  }, [])

  useEffect(() => {
    if (!listeningId) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setListeningId(null)
        return
      }
      const chord = chordFromEvent(e)
      if (!chord) return
      setBinding(listeningId, chord.keys, chord.mod)
      setListeningId(null)
      toast.push('Shortcut updated', 'success')
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [listeningId, toast])

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <HelpTitle slug={HelpSlugs.keyboard} hintLabel="Keyboard shortcuts help">
            Keyboard shortcuts
          </HelpTitle>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Click a row, then press the new key combo. Esc cancels capture. Stored on this device.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            resetAllBindings()
            toast.push('Shortcuts reset to defaults', 'success')
          }}
        >
          Reset all
        </Button>
      </div>
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
        {SHORTCUT_CATALOG.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">{item.description}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {listeningId === item.id ? (
                  <span className="text-[var(--color-primary)]">Press a key combo…</span>
                ) : (
                  <kbd className="kbd">{formatBinding(item.id)}</kbd>
                )}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setListeningId(item.id)}
              >
                {listeningId === item.id ? 'Listening…' : 'Change'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  resetBinding(item.id)
                  toast.push('Reset shortcut', 'success')
                }}
              >
                Default
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SettingsPage() {
  const {
    profile,
    user,
    updateProfile,
    updatePassword,
    linkOAuthProvider,
    unlinkOAuthIdentity,
  } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const confirm = useConfirm()

  const [name, setName] = useState(profile?.name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [token, setToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<{
    configured: boolean
    token_hint: string | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<'google' | 'github' | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)

  const identities = user?.identities ?? []
  const hasGoogle = identities.some((i) => i.provider === 'google')
  const hasGithub = identities.some((i) => i.provider === 'github')
  const hasEmail = identities.some((i) => i.provider === 'email')
  // Can unlink OAuth only if another method remains (email or second OAuth)
  const canUnlinkOAuth = identities.length > 1

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setUsername(profile.username)
    }
  }, [profile])

  useEffect(() => {
    getGitHubTokenStatus()
      .then(setTokenStatus)
      .catch(() => setTokenStatus({ configured: false, token_hint: null }))
  }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Profile, keyboard shortcuts, Grok CLI access, theme, and GitHub.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="font-semibold">Profile</h2>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input value={profile?.email ?? ''} disabled />
        </Field>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await updateProfile({ name: name.trim(), username: username.trim() })
              toast.push('Profile saved', 'success')
            } catch (e) {
              toast.push(e instanceof Error ? e.message : 'Save failed', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          Save profile
        </Button>

        <div className="border-t border-[var(--color-border)] pt-4">
          <HelpTitle
            as="h3"
            className="text-sm"
            slug={HelpSlugs.account}
            hintLabel="Account sign-in help"
          >
            Linked sign-in
          </HelpTitle>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Google and GitHub for <strong>account login</strong> (not the GitHub tasks integration).
            Supabase will not let you remove your <em>last</em> sign-in method — that would lock you
            out of the account. Link a second method first, then you can unlink one.
          </p>
          <ul className="mt-3 space-y-2">
            {(
              [
                { id: 'google' as const, label: 'Google', linked: hasGoogle },
                { id: 'github' as const, label: 'GitHub', linked: hasGithub },
              ] as const
            ).map((p) => {
              const identity = identities.find((i) => i.provider === p.id)
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{p.label}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {p.linked
                        ? identity?.identity_data?.email
                          ? String(identity.identity_data.email)
                          : 'Connected'
                        : 'Not linked'}
                    </p>
                  </div>
                  {p.linked ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={oauthBusy != null || !canUnlinkOAuth || !identity}
                      title={
                        !canUnlinkOAuth
                          ? 'Link another sign-in method first (email or the other OAuth provider)'
                          : `Unlink ${p.label}`
                      }
                      onClick={async () => {
                        if (!identity) return
                        if (!canUnlinkOAuth) {
                          toast.push(
                            'Link another sign-in method first — you cannot remove your only way to log in.',
                            'error',
                          )
                          return
                        }
                        const ok = await confirm({
                          title: `Unlink ${p.label}?`,
                          message: `You will no longer sign in with ${p.label} until you link it again.`,
                          confirmLabel: 'Unlink',
                          danger: true,
                        })
                        if (!ok) return
                        setOauthBusy(p.id)
                        try {
                          await unlinkOAuthIdentity(identity)
                          // Confirm after session refresh (JWT can lag)
                          const { data: u } = await getSupabase().auth.getUser()
                          const still = (u.user?.identities ?? []).some(
                            (i) => i.provider === p.id,
                          )
                          if (still) {
                            toast.push(
                              `${p.label} is still linked on the server. Try sign out → sign in, then unlink again. Supabase blocks removing the last identity.`,
                              'error',
                            )
                          } else {
                            toast.push(`${p.label} unlinked — sign out to verify you cannot use it`, 'success')
                          }
                        } catch (e) {
                          const raw = e instanceof Error ? e.message : String(e)
                          const msg = /last|single|identity|cannot/i.test(raw)
                            ? 'Cannot unlink your only sign-in method. Link email or another provider first.'
                            : raw || `Could not unlink ${p.label}`
                          toast.push(msg, 'error')
                        } finally {
                          setOauthBusy(null)
                        }
                      }}
                    >
                      {oauthBusy === p.id ? '…' : 'Unlink'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={oauthBusy != null}
                      onClick={async () => {
                        setOauthBusy(p.id)
                        try {
                          await linkOAuthProvider(p.id)
                          // Redirects to provider when manual linking is enabled
                        } catch (e) {
                          const raw = e instanceof Error ? e.message : String(e)
                          const msg = /manual link/i.test(raw)
                            ? 'Manual account linking is off in Supabase Auth. Enable “Allow manual linking” (Authentication → Providers / settings), then try again.'
                            : raw || `Could not link ${p.label}`
                          toast.push(msg, 'error')
                          setOauthBusy(null)
                        }
                      }}
                    >
                      {oauthBusy === p.id ? 'Redirecting…' : 'Link'}
                    </Button>
                  )}
                </li>
              )
            })}
            {hasEmail ? (
              <li className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm">
                <p className="font-medium">Email &amp; password</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {user?.email ?? profile?.email ?? 'Configured'} · manage password below
                </p>
              </li>
            ) : (
              <li className="rounded-lg border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">
                No email/password on this account yet. Set a password below after recovery, or keep
                at least one OAuth provider linked.
              </li>
            )}
          </ul>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="font-semibold">Password</h2>
        <p className="text-xs text-[var(--color-muted)]">
          Change the password you use to sign in. Leave current password blank only if you signed
          in with a magic link and never set a password (you can still set one here).
        </p>
        <Field label="Current password">
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Required if you already have a password"
          />
        </Field>
        <Field label="New password">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <Button
          disabled={
            passwordBusy || !newPassword || newPassword.length < 8 || newPassword !== confirmPassword
          }
          onClick={async () => {
            if (newPassword !== confirmPassword) {
              toast.push('New passwords do not match', 'error')
              return
            }
            setPasswordBusy(true)
            try {
              await updatePassword({
                newPassword,
                currentPassword: currentPassword || undefined,
              })
              setCurrentPassword('')
              setNewPassword('')
              setConfirmPassword('')
              toast.push('Password updated', 'success')
            } catch (e) {
              toast.push(e instanceof Error ? e.message : 'Password update failed', 'error')
            } finally {
              setPasswordBusy(false)
            }
          }}
        >
          {passwordBusy ? 'Updating…' : 'Update password'}
        </Button>
      </section>

      <KeyboardShortcutsSection />

      <CliAccessSection />

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="font-semibold">Theme</h2>
        <div className="flex flex-wrap gap-2">
          {(['light', 'dark', 'system'] as ThemePref[]).map((t) => (
            <Button
              key={t}
              size="sm"
              variant={theme === t ? 'primary' : 'secondary'}
              onClick={() => setTheme(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <p className="text-xs text-[var(--color-muted)]">
          Saved on this device. Each device can use its own theme; your account also stores the last
          choice as a default for new browsers.
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <HelpTitle slug={HelpSlugs.githubToken} hintLabel="GitHub token and permissions help">
          GitHub integration
        </HelpTitle>
        <p className="text-xs text-[var(--color-muted)]">
          Optional: link projects to a repository and create/sync issues. Separate from{' '}
          <strong>Sign in with GitHub</strong> (account login).
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(profile?.github_integration_enabled)}
            onChange={async (e) => {
              const next = e.target.checked
              if (!next) {
                const ok = await confirm({
                  title: 'Disable GitHub integration?',
                  message:
                    'This turns off GitHub actions for you on all projects. Linked issue numbers and repos stay visible as read-only where a project is still integrated. Your token and project settings are kept. Projects you had linked will need to be linked again after you re-enable.',
                  confirmLabel: 'Disable',
                  cancelLabel: 'Cancel',
                  danger: true,
                })
                if (!ok) return
              }
              try {
                await updateProfile({ github_integration_enabled: next })
                if (!next) {
                  const n = await disableMyGitHubScopeConfigs()
                  toast.push(
                    n > 0
                      ? `GitHub disabled (soft-disabled ${n} project link${n === 1 ? '' : 's'})`
                      : 'GitHub integration disabled',
                    'success',
                  )
                } else {
                  toast.push(
                    'GitHub integration enabled. Link a repository on each project to use create/sync.',
                    'success',
                  )
                }
              } catch (err) {
                toast.push(err instanceof Error ? err.message : 'Update failed', 'error')
              }
            }}
          />
          Enable GitHub integration
        </label>
        <p className="text-xs text-[var(--color-muted)]">
          User-level switch: actions need this ON + a PAT. Project-level link is separate (Project →
          GitHub). Use the help icon for step-by-step token permissions.
        </p>
        <p className="text-xs text-[var(--color-muted)]">
          Status:{' '}
          {tokenStatus?.configured
            ? `Token saved${tokenStatus.token_hint ? ` (…${tokenStatus.token_hint})` : ''}`
            : 'No token configured'}
          . Tokens are stored encrypted and only used by Edge Functions (not deleted when you disable
          the toggle).
        </p>
        <Field label="Personal access token (classic or fine-grained)">
          <Input
            type="password"
            placeholder="ghp_… or github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </Field>
        <ul className="list-inside list-disc space-y-1 text-xs text-[var(--color-muted)]">
          <li>
            <a
              className="underline"
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noreferrer"
            >
              Create a token on GitHub
            </a>{' '}
            (classic: <code className="text-[0.7rem]">repo</code> scope is typical for private
            repos).
          </li>
          <li>
            Fine-grained tokens need access to the repos you will link from a project.
          </li>
          <li>
            After saving, open a project → <strong>GitHub</strong> to pick one repository.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy || !token.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                const res = await saveGitHubToken(token.trim())
                setToken('')
                setTokenStatus({ configured: true, token_hint: res.token_hint })
                toast.push('Token saved', 'success')
              } catch (e) {
                toast.push(
                  e instanceof Error
                    ? e.message
                    : 'Save failed — deploy github-credentials Edge Function',
                  'error',
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            Save token
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                const res = await testGitHubConnection()
                toast.push(
                  res.ok ? `Connected as ${res.login ?? 'user'}` : 'Connection failed',
                  res.ok ? 'success' : 'error',
                )
              } catch (e) {
                toast.push(
                  e instanceof Error
                    ? e.message
                    : 'Test failed — deploy github-proxy Edge Function',
                  'error',
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            Test connection
          </Button>
          <Button
            variant="danger"
            disabled={busy || !tokenStatus?.configured}
            onClick={async () => {
              setBusy(true)
              try {
                await deleteGitHubToken()
                setTokenStatus({ configured: false, token_hint: null })
                toast.push('Token removed', 'success')
              } catch (e) {
                toast.push(e instanceof Error ? e.message : 'Remove failed', 'error')
              } finally {
                setBusy(false)
              }
            }}
          >
            Remove token
          </Button>
        </div>
      </section>
    </div>
  )
}
