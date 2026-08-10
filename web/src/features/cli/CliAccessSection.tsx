import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useScopes } from '@/features/scopes/hooks'
import {
  createCliAccessToken,
  getSupabaseAnonKey,
  getSupabaseProjectUrl,
  listCliAccessTokens,
  revokeCliAccessToken,
} from './api'

export function CliAccessSection() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { data: scopes = [] } = useScopes()

  const tokensQuery = useQuery({
    queryKey: ['cli-tokens', user?.id],
    enabled: Boolean(user?.id),
    queryFn: listCliAccessTokens,
  })

  const [name, setName] = useState('Grok CLI')
  const [canWrite, setCanWrite] = useState(true)
  const [allProjects, setAllProjects] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  const projectUrl = getSupabaseProjectUrl()
  const anonKey = getSupabaseAnonKey()

  const setupSnippet = useMemo(() => {
    if (!revealedToken || !projectUrl) return ''
    const url = projectUrl
    const tok = revealedToken
    const key = anonKey || '<your-anon-key>'
    return `# No repo clone needed — uses npm package projects-manager-mcp
# (requires Node.js 18+ and Grok CLI)

grok mcp add projects-manager \\
  -e "PROJECTS_MANAGER_URL=${url}" \\
  -e "PROJECTS_MANAGER_TOKEN=${tok}" \\
  -e "PROJECTS_MANAGER_ANON_KEY=${key}" \\
  -- npx -y projects-manager-mcp@latest

# Then restart Grok. Check: grok mcp list`
  }, [revealedToken, projectUrl, anonKey])

  const toggleScope = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div>
        <h2 className="font-semibold">Grok CLI access</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Create a personal token so Grok CLI (via MCP) can list and manage tasks only on the
          projects you allow. Tokens are shown once — store them like passwords. End users install
          the MCP with{' '}
          <code className="text-[11px]">npx -y projects-manager-mcp@latest</code> (no app repo
          needed once the package is on npm).
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3">
        <Field label="Token name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Laptop Grok CLI"
            maxLength={80}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={canWrite}
            onChange={(e) => setCanWrite(e.target.checked)}
          />
          Allow create / update / complete / delete (uncheck for read-only)
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allProjects}
            onChange={(e) => {
              setAllProjects(e.target.checked)
              if (e.target.checked) setSelected(new Set())
            }}
          />
          All projects I can access
        </label>

        {!allProjects ? (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] p-2">
            {scopes.length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">No projects yet.</p>
            ) : (
              scopes.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggleScope(s.id)}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))
            )}
          </div>
        ) : null}

        <Button
          disabled={busy || !name.trim() || (!allProjects && selected.size === 0)}
          onClick={async () => {
            setBusy(true)
            setRevealedToken(null)
            try {
              const created = await createCliAccessToken({
                name: name.trim(),
                scopeIds: allProjects ? null : [...selected],
                canWrite,
              })
              setRevealedToken(created.token)
              await qc.invalidateQueries({ queryKey: ['cli-tokens', user?.id] })
              toast.push('Token created — copy it now', 'success')
            } catch (e) {
              toast.push(e instanceof Error ? e.message : 'Create failed', 'error')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Creating…' : 'Create token'}
        </Button>
      </div>

      {revealedToken ? (
        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-sm font-medium">Copy this token now — it won’t be shown again</p>
          <code className="block break-all rounded-md bg-[var(--color-surface)] px-2 py-1.5 text-xs">
            {revealedToken}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(revealedToken)
                  toast.push('Token copied', 'success')
                } catch {
                  toast.push('Copy failed — select the token manually', 'error')
                }
              }}
            >
              Copy token
            </Button>
            {setupSnippet ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(setupSnippet)
                    toast.push('Setup snippet copied', 'success')
                  } catch {
                    toast.push('Copy failed', 'error')
                  }
                }}
              >
                Copy Grok CLI setup
              </Button>
            ) : null}
          </div>
          {setupSnippet ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-surface)] p-2 text-[10px] leading-relaxed text-[var(--color-muted)]">
              {setupSnippet}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">Active tokens</h3>
        {tokensQuery.isLoading ? (
          <p className="text-xs text-[var(--color-muted)]">Loading…</p>
        ) : (tokensQuery.data ?? []).length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">No active CLI tokens.</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
            {(tokensQuery.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    pmcli_{t.token_prefix}_… · {t.can_write ? 'read/write' : 'read-only'} ·{' '}
                    {t.scope_ids?.length
                      ? `${t.scope_ids.length} project(s)`
                      : 'all accessible projects'}
                    {t.last_used_at
                      ? ` · last used ${new Date(t.last_used_at).toLocaleString()}`
                      : ' · never used'}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Revoke CLI token?',
                      message: `“${t.name}” will stop working in Grok CLI immediately.`,
                      confirmLabel: 'Revoke',
                      danger: true,
                    })
                    if (!ok) return
                    try {
                      await revokeCliAccessToken(t.id)
                      await qc.invalidateQueries({ queryKey: ['cli-tokens', user?.id] })
                      toast.push('Token revoked', 'success')
                    } catch (e) {
                      toast.push(e instanceof Error ? e.message : 'Revoke failed', 'error')
                    }
                  }}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Docs: <code className="text-[11px]">docs/grok-cli.md</code> in the repo. Tools: list
        projects/tasks/tags, create/update/complete/delete tasks.
      </p>
    </section>
  )
}
