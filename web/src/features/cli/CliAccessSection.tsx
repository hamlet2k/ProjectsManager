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
  getRemoteMcpUrl,
  getSupabaseAnonKey,
  getSupabaseProjectUrl,
  listCliAccessTokens,
  revokeCliAccessToken,
} from './api'
import { HelpSlugs, HelpTitle, useHelp } from '@/features/help'
import { Icons } from '@/components/icons'

/** One-line command — safest to paste in any shell (PowerShell, bash, cmd). */
function buildGrokCliSetupCommand(opts: {
  projectUrl: string
  token: string
  anonKey: string
}): string {
  const url = opts.projectUrl || 'https://YOUR.supabase.co'
  const tok = opts.token
  const key = opts.anonKey || 'your-anon-key'
  return [
    'grok mcp add projects-manager',
    `-e "PROJECTS_MANAGER_URL=${url}"`,
    `-e "PROJECTS_MANAGER_TOKEN=${tok}"`,
    `-e "PROJECTS_MANAGER_ANON_KEY=${key}"`,
    '-- npx -y projects-manager-mcp@latest',
  ].join(' ')
}

const CHATGPT_DEV_MODE =
  'https://chatgpt.com/plugins#settings/Security?section=developer-mode'
const CHATGPT_NEW_PLUGIN =
  'https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins'
const GROK_CONNECTORS = 'https://grok.com/connectors'

/**
 * OAuth-first connector guides (ChatGPT plugin / Grok connector).
 * Tokens are created automatically when the user clicks Allow — no manual key for normal setup.
 * Manual tokens only under Advanced (CLI / rare fallbacks).
 */
export function CliAccessSection() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { openHelp } = useHelp()
  const { data: scopes = [] } = useScopes()

  const tokensQuery = useQuery({
    queryKey: ['cli-tokens', user?.id],
    enabled: Boolean(user?.id),
    queryFn: listCliAccessTokens,
  })

  const [openGuide, setOpenGuide] = useState<'chatgpt' | 'grok' | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showTokenList, setShowTokenList] = useState(false)
  const [manualBusy, setManualBusy] = useState(false)
  const [manualName, setManualName] = useState('Grok CLI')
  const [canWrite, setCanWrite] = useState(true)
  const [allProjects, setAllProjects] = useState(true)
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set())
  const [revealedToken, setRevealedToken] = useState<string | null>(null)

  const projectUrl = getSupabaseProjectUrl()
  const anonKey = getSupabaseAnonKey()
  const remoteMcpUrl = getRemoteMcpUrl()
  const authorizeUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/oauth/mcp/authorize`
      : 'https://projects-manager-navy.vercel.app/oauth/mcp/authorize'
  const tokenEndpoint = projectUrl
    ? `${projectUrl}/functions/v1/mcp-oauth/token`
    : ''

  const grokCliSetupCommand = useMemo(() => {
    if (!revealedToken) return ''
    return buildGrokCliSetupCommand({
      projectUrl,
      token: revealedToken,
      anonKey,
    })
  }, [revealedToken, projectUrl, anonKey])

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.push(`${label} copied`, 'success')
    } catch {
      toast.push('Copy failed — select the text manually', 'error')
    }
  }

  const toggleScope = (id: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const createManualToken = async () => {
    if (!allProjects && selectedScopes.size === 0) {
      toast.push('Select at least one project, or choose all projects', 'error')
      return
    }
    setManualBusy(true)
    setRevealedToken(null)
    try {
      const created = await createCliAccessToken({
        name: manualName.trim() || 'Grok CLI',
        scopeIds: allProjects ? null : [...selectedScopes],
        canWrite,
      })
      setRevealedToken(created.token)
      setShowTokenList(true)
      await qc.invalidateQueries({ queryKey: ['cli-tokens', user?.id] })
      toast.push('Key created — copy the setup command now', 'success')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Create failed', 'error')
    } finally {
      setManualBusy(false)
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <HelpTitle slug={HelpSlugs.cliMcp} hintLabel="Full guide: ChatGPT plugin & Grok connector">
            Connect ChatGPT or Grok
          </HelpTitle>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Open the steps for the app you use. You sign in and click <strong>Allow</strong> — no
            need to create or paste a secret for normal setup. (ChatGPT calls these{' '}
            <strong>plugins</strong>; Grok calls them <strong>connectors</strong>.)
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => openHelp(HelpSlugs.cliMcp)}
        >
          <Icons.Help size="0.95em" /> Open full guide
        </Button>
      </div>

      {remoteMcpUrl ? (
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--color-muted)]">MCP server URL (same for both)</p>
          <button
            type="button"
            className="block w-full break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50 px-3 py-2 text-left font-mono text-xs"
            onClick={() => void copy('Server URL', remoteMcpUrl)}
          >
            {remoteMcpUrl}
          </button>
          <p className="text-[11px] text-[var(--color-muted)]">Click to copy</p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border)] p-4">
          <p className="font-semibold">ChatGPT plugin</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Developer mode → new plugin → Server URL → <strong>OAuth</strong> → Allow in browser
          </p>
          <Button
            className="mt-3 w-full"
            variant={openGuide === 'chatgpt' ? 'primary' : 'secondary'}
            onClick={() => setOpenGuide((g) => (g === 'chatgpt' ? null : 'chatgpt'))}
          >
            {openGuide === 'chatgpt' ? 'Hide steps' : 'Show ChatGPT steps'}
          </Button>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] p-4">
          <p className="font-semibold">Grok connector</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Connectors → Custom → Server URL → OAuth fields if asked → Allow in browser
          </p>
          <Button
            className="mt-3 w-full"
            variant={openGuide === 'grok' ? 'primary' : 'secondary'}
            onClick={() => setOpenGuide((g) => (g === 'grok' ? null : 'grok'))}
          >
            {openGuide === 'grok' ? 'Hide steps' : 'Show Grok steps'}
          </Button>
        </div>
      </div>

      {/* —— ChatGPT OAuth-first —— */}
      {openGuide === 'chatgpt' && remoteMcpUrl ? (
        <ol className="list-decimal space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-4 pl-8 text-sm">
          <li>
            Open{' '}
            <a
              className="font-medium text-[var(--color-primary)] underline"
              href={CHATGPT_DEV_MODE}
              target="_blank"
              rel="noreferrer"
            >
              Developer mode in ChatGPT
            </a>{' '}
            and turn it <strong>ON</strong> if the option is available on your account.{' '}
            <a
              className="text-xs underline"
              href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt"
              target="_blank"
              rel="noreferrer"
            >
              OpenAI help
            </a>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Availability depends on your ChatGPT plan and account settings — check whether you see
              Developer mode and “create plugin / custom connector” there.
            </p>
          </li>
          <li>
            Open{' '}
            <a
              className="font-medium text-[var(--color-primary)] underline"
              href={CHATGPT_NEW_PLUGIN}
              target="_blank"
              rel="noreferrer"
            >
              Create a new custom plugin
            </a>
            .
          </li>
          <li>
            Fill the form:
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--color-muted)]">
              <li>
                <strong>Name:</strong> Projects Manager
              </li>
              <li>
                <strong>Description:</strong> Manage my project boards
              </li>
              <li>
                <strong>Connection:</strong> Server URL (not Tunnel)
              </li>
              <li>
                <strong>Server URL:</strong> paste the URL above (click it to copy)
              </li>
              <li>
                <strong>Authentication:</strong> <strong>OAuth</strong>
              </li>
            </ul>
          </li>
          <li>
            Open <strong>Advanced OAuth settings</strong>. ChatGPT often fills the URLs for you. If
            it asks for a <strong>Client ID</strong>, enter:{' '}
            <button
              type="button"
              className="font-mono text-[var(--color-text)] underline"
              onClick={() => void copy('Client ID', 'projects-manager-mcp')}
            >
              projects-manager-mcp
            </button>{' '}
            (click to copy). Leave Client Secret empty.
          </li>
          <li>
            Accept the risk warning → <strong>Create</strong> / connect.
          </li>
          <li>
            A Projects Manager page opens → sign in if needed → press <strong>Allow</strong>. A key
            is created for you automatically (no copy-paste).
          </li>
          <li>
            In ChatGPT try: <em>“List my Projects Manager projects.”</em>
          </li>
        </ol>
      ) : null}

      {/* —— Grok OAuth —— */}
      {openGuide === 'grok' && remoteMcpUrl ? (
        <ol className="list-decimal space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-4 pl-8 text-sm">
          <li>
            Open{' '}
            <a
              className="font-medium text-[var(--color-primary)] underline"
              href={GROK_CONNECTORS}
              target="_blank"
              rel="noreferrer"
            >
              grok.com/connectors
            </a>
            .
          </li>
          <li>
            <strong>New Connector</strong> → <strong>Custom</strong>.
          </li>
          <li>
            Paste the <strong>MCP server URL</strong> (click the URL box above to copy).
          </li>
          <li>
            When Grok asks for OAuth credentials:
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--color-muted)]">
              <li>
                <strong>Client ID:</strong>{' '}
                <button
                  type="button"
                  className="font-mono underline"
                  onClick={() => void copy('Client ID', 'projects-manager-mcp')}
                >
                  projects-manager-mcp
                </button>
              </li>
              <li>
                <strong>Client Secret:</strong> leave empty
              </li>
              <li>
                <strong>Authorization Endpoint:</strong>{' '}
                <button
                  type="button"
                  className="break-all font-mono underline"
                  onClick={() => void copy('Authorization URL', authorizeUrl)}
                >
                  {authorizeUrl}
                </button>
              </li>
              <li>
                <strong>Token Endpoint:</strong>{' '}
                <button
                  type="button"
                  className="break-all font-mono underline"
                  onClick={() => void copy('Token URL', tokenEndpoint)}
                >
                  {tokenEndpoint || '…/mcp-oauth/token'}
                </button>
              </li>
              <li>
                <strong>Scopes:</strong> mcp
              </li>
              <li>
                <strong>Token Auth Method:</strong> none (PKCE only)
              </li>
            </ul>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              onClick={() =>
                void copy(
                  'OAuth fields',
                  [
                    `Client ID: projects-manager-mcp`,
                    `Client Secret: (empty)`,
                    `Authorization Endpoint: ${authorizeUrl}`,
                    `Token Endpoint: ${tokenEndpoint}`,
                    `Scopes: mcp`,
                    `Token Auth Method: none (PKCE only)`,
                  ].join('\n'),
                )
              }
            >
              Copy OAuth fields
            </Button>
          </li>
          <li>
            <strong>Save &amp; Connect</strong> → sign in if needed → <strong>Allow</strong>. A key
            is created automatically.
          </li>
          <li>
            In Grok try: <em>“List my Projects Manager projects.”</em>
          </li>
        </ol>
      ) : null}

      {/* Keys created by OAuth or advanced manual create */}
      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-semibold"
          onClick={() => setShowTokenList((v) => !v)}
        >
          Connected keys
          <span className="text-xs font-normal text-[var(--color-muted)]">
            {showTokenList ? 'Hide' : 'Show'} · {(tokensQuery.data ?? []).length} active
          </span>
        </button>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          After you click Allow, a key appears here (e.g. “ChatGPT connector …” or “Grok connector …”). Revoke to disconnect
          that app.
        </p>
        {showTokenList ? (
          <div className="mt-2">
            {(tokensQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">None yet — connect ChatGPT or Grok first.</p>
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
                        pmcli_{t.token_prefix}_… · {t.can_write ? 'can edit' : 'read-only'} ·{' '}
                        {t.scope_ids?.length
                          ? `${t.scope_ids.length} project(s)`
                          : 'all accessible projects'}
                        {t.last_used_at
                          ? ` · last used ${new Date(t.last_used_at).toLocaleString()}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Disconnect this key?',
                          message: `“${t.name}” will stop working in ChatGPT, Grok, or CLI immediately.`,
                          confirmLabel: 'Revoke',
                          danger: true,
                        })
                        if (!ok) return
                        try {
                          await revokeCliAccessToken(t.id)
                          await qc.invalidateQueries({ queryKey: ['cli-tokens', user?.id] })
                          toast.push('Key revoked', 'success')
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
        ) : null}
      </div>

      <div className="border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-semibold"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          Advanced (manual key / Grok CLI)
          <span className="text-xs font-normal text-[var(--color-muted)]">
            {showAdvanced ? 'Hide' : 'Show'}
          </span>
        </button>
        {showAdvanced ? (
          <div className="mt-3 space-y-3 text-sm text-[var(--color-muted)]">
            <p className="text-xs">
              For <strong>Grok CLI</strong> on your computer (or a tool that needs a pasted secret).
              Normal ChatGPT / Grok <em>web</em> setup uses OAuth above — no manual key.
            </p>

            <Field label="Key name">
              <Input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Laptop Grok CLI"
                maxLength={80}
              />
            </Field>

            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={canWrite}
                onChange={(e) => setCanWrite(e.target.checked)}
              />
              Allow create / update / complete / delete (uncheck for read-only)
            </label>

            <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={allProjects}
                onChange={(e) => {
                  setAllProjects(e.target.checked)
                  if (e.target.checked) setSelectedScopes(new Set())
                }}
              />
              All projects I can access
            </label>

            {!allProjects ? (
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2">
                {scopes.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)]">No projects yet.</p>
                ) : (
                  scopes.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 text-sm text-[var(--color-text)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedScopes.has(s.id)}
                        onChange={() => toggleScope(s.id)}
                      />
                      <span className="truncate">{s.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}

            <Button
              size="sm"
              disabled={
                manualBusy ||
                !manualName.trim() ||
                (!allProjects && selectedScopes.size === 0)
              }
              onClick={() => void createManualToken()}
            >
              {manualBusy ? 'Creating…' : 'Create Grok CLI key'}
            </Button>

            {revealedToken ? (
              <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Copy now — token is not shown again
                </p>
                <div>
                  <p className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">Token</p>
                  <code className="block break-all rounded-md bg-[var(--color-surface)] px-2 py-1.5 font-mono text-[11px] text-[var(--color-text)]">
                    {revealedToken}
                  </code>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="secondary"
                    onClick={() => void copy('Token', revealedToken)}
                  >
                    <Icons.Copy size="0.9em" /> Copy token
                  </Button>
                </div>

                {grokCliSetupCommand ? (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-[var(--color-muted)]">
                      Grok CLI setup (includes your new token — one line, paste into terminal)
                    </p>
                    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[var(--color-surface)] p-2 font-mono text-[10px] leading-relaxed text-[var(--color-text)]">
                      {grokCliSetupCommand}
                    </pre>
                    <Button
                      className="mt-2"
                      size="sm"
                      onClick={() => void copy('Grok CLI setup', grokCliSetupCommand)}
                    >
                      <Icons.Copy size="0.9em" /> Copy full setup command
                    </Button>
                    <p className="mt-2 text-[11px] text-[var(--color-muted)]">
                      After pasting, restart Grok CLI (or start a new session). Check with{' '}
                      <code className="text-[10px]">grok mcp list</code>.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                Create a key first — the setup command will include the real token and a{' '}
                <strong>Copy full setup command</strong> button.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  )
}
