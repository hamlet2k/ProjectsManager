import { useEffect, useState } from 'react'
import { useAuth } from '@/app/providers/AuthProvider'
import { useTheme } from '@/app/providers/ThemeProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import {
  deleteGitHubToken,
  getGitHubTokenStatus,
  saveGitHubToken,
  testGitHubConnection,
} from '@/features/github/api'
import type { ThemePref } from '@/lib/supabase/types'

export function SettingsPage() {
  const { profile, updateProfile } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()

  const [name, setName] = useState(profile?.name ?? '')
  const [username, setUsername] = useState(profile?.username ?? '')
  const [token, setToken] = useState('')
  const [tokenStatus, setTokenStatus] = useState<{
    configured: boolean
    token_hint: string | null
  } | null>(null)
  const [busy, setBusy] = useState(false)

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
        <p className="mt-1 text-sm text-[var(--color-muted)]">Profile, theme, and GitHub access.</p>
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
      </section>

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
        <h2 className="font-semibold">GitHub integration</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(profile?.github_integration_enabled)}
            onChange={async (e) => {
              try {
                await updateProfile({ github_integration_enabled: e.target.checked })
                toast.push(
                  e.target.checked ? 'GitHub integration enabled' : 'GitHub integration disabled',
                  'success',
                )
              } catch (err) {
                toast.push(err instanceof Error ? err.message : 'Update failed', 'error')
              }
            }}
          />
          Enable GitHub integration
        </label>
        <p className="text-xs text-[var(--color-muted)]">
          Status:{' '}
          {tokenStatus?.configured
            ? `Token saved${tokenStatus.token_hint ? ` (…${tokenStatus.token_hint})` : ''}`
            : 'No token configured'}
          . Tokens are stored encrypted and only used by Edge Functions.
        </p>
        <Field label="Personal access token">
          <Input
            type="password"
            placeholder="ghp_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
          />
        </Field>
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
