import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/providers/AuthProvider'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
import { cn } from '@/lib/utils'

type GuideKind = 'chatgpt' | 'grok' | null

/**
 * Guided setup for ChatGPT / Grok / CLI connectors.
 * Tokens are the same under the hood; separate “create” buttons keep steps simple.
 */
export function CliAccessSection() {
  const { user } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const { openHelp } = useHelp()

  const tokensQuery = useQuery({
    queryKey: ['cli-tokens', user?.id],
    enabled: Boolean(user?.id),
    queryFn: listCliAccessTokens,
  })

  const [busy, setBusy] = useState<GuideKind>(null)
  const [guide, setGuide] = useState<GuideKind>(null)
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showTokenList, setShowTokenList] = useState(false)

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

  const createTokenFor = async (kind: 'chatgpt' | 'grok') => {
    setBusy(kind)
    setRevealedToken(null)
    try {
      const created = await createCliAccessToken({
        name: kind === 'chatgpt' ? 'ChatGPT connector' : 'Grok connector',
        scopeIds: null,
        canWrite: true,
      })
      setRevealedToken(created.token)
      setGuide(kind)
      setShowTokenList(true)
      await qc.invalidateQueries({ queryKey: ['cli-tokens', user?.id] })
      toast.push(
        kind === 'chatgpt'
          ? 'ChatGPT token created — copy it in the steps below'
          : 'Grok token created — follow the steps below',
        'success',
      )
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Create failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.push(`${label} copied`, 'success')
    } catch {
      toast.push('Copy failed — select the text manually', 'error')
    }
  }

  return (
    <section className="space-y-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <HelpTitle slug={HelpSlugs.cliMcp} hintLabel="Connect ChatGPT or Grok — full guide">
            Connect ChatGPT or Grok
          </HelpTitle>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Let ChatGPT or Grok list and manage your project boards. You create a secret key
            (token) here, then paste it (or finish sign-in) in that chat app.
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

      {/* —— Simple path cards —— */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4">
          <p className="text-base font-semibold">ChatGPT</p>
          <p className="mt-1 flex-1 text-xs text-[var(--color-muted)]">
            Uses a <strong>token</strong> (easiest). Needs ChatGPT Plus/Pro and Developer Mode.
          </p>
          <Button
            className="mt-3 w-full"
            disabled={busy != null}
            onClick={() => void createTokenFor('chatgpt')}
          >
            {busy === 'chatgpt' ? 'Creating…' : '1. Create token for ChatGPT'}
          </Button>
        </div>
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4">
          <p className="text-base font-semibold">Grok (web)</p>
          <p className="mt-1 flex-1 text-xs text-[var(--color-muted)]">
            Uses <strong>OAuth</strong> (sign-in in the browser). You still create a token here first
            so you have one if needed — then follow OAuth in Grok.
          </p>
          <Button
            className="mt-3 w-full"
            disabled={busy != null}
            onClick={() => void createTokenFor('grok')}
          >
            {busy === 'grok' ? 'Creating…' : '1. Create token for Grok'}
          </Button>
        </div>
      </div>

      {/* —— One-time secret —— */}
      {revealedToken ? (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-[var(--color-text)]">
            Copy this secret now — it will not be shown again
          </p>
          <code className="block break-all rounded-lg bg-[var(--color-surface)] px-3 py-2 text-xs">
            {revealedToken}
          </code>
          <Button size="sm" onClick={() => void copy('Token', revealedToken)}>
            Copy token
          </Button>
        </div>
      ) : null}

      {/* —— ChatGPT steps —— */}
      {guide === 'chatgpt' && remoteMcpUrl ? (
        <ol className="list-decimal space-y-3 rounded-xl border border-[var(--color-border)] p-4 pl-8 text-sm">
          <li>
            <span className="font-medium">Copy the token above</span> (yellow box). Keep that tab
            open.
          </li>
          <li>
            Open{' '}
            <a
              className="font-medium text-[var(--color-primary)] underline"
              href="https://chatgpt.com"
              target="_blank"
              rel="noreferrer"
            >
              chatgpt.com
            </a>{' '}
            and sign in. You need a <strong>Plus or Pro</strong> plan for custom plugins.
          </li>
          <li>
            Click your profile → <strong>Settings</strong> → look for{' '}
            <strong>Apps</strong> / <strong>Connectors</strong> → <strong>Advanced</strong> (or
            similar) → turn on <strong>Developer mode</strong>.
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              OpenAI moves this toggle sometimes. Search Settings for “Developer” if you don’t see
              it. Helpful links:{' '}
              <a
                className="underline"
                href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt"
                target="_blank"
                rel="noreferrer"
              >
                OpenAI: Developer mode &amp; MCP
              </a>
              .
            </p>
          </li>
          <li>
            Add a <strong>new plugin / connector</strong> (often “New plugin” or “Create”).
          </li>
          <li>
            Fill the form roughly like this:
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
                <strong>Server URL:</strong>{' '}
                <button
                  type="button"
                  className="break-all font-mono text-[var(--color-text)] underline"
                  onClick={() => void copy('Server URL', remoteMcpUrl)}
                >
                  {remoteMcpUrl}
                </button>{' '}
                (click to copy)
              </li>
              <li>
                <strong>Authentication:</strong> Access token / API key →{' '}
                <strong>Bearer</strong> (not OAuth unless you prefer)
              </li>
            </ul>
          </li>
          <li>
            Check the box that you understand custom servers can be risky → <strong>Create</strong>.
          </li>
          <li>
            When ChatGPT asks for the token, paste the <strong>pmcli_…</strong> secret you copied.
            If it asks for an extra header named <code className="text-[11px]">apikey</code>, use
            your project anon key from the app host (optional; only if Create fails).
          </li>
          <li>
            Start a chat and try: <em>“List my Projects Manager projects.”</em>
          </li>
        </ol>
      ) : null}

      {/* —— Grok steps —— */}
      {guide === 'grok' && remoteMcpUrl ? (
        <ol className="list-decimal space-y-3 rounded-xl border border-[var(--color-border)] p-4 pl-8 text-sm">
          <li>
            You created a Grok token (saved in case you need it). For <strong>Grok web</strong>,
            OAuth is usually easier — you sign in with Projects Manager in the browser.
          </li>
          <li>
            Open{' '}
            <a
              className="font-medium text-[var(--color-primary)] underline"
              href="https://grok.com/connectors"
              target="_blank"
              rel="noreferrer"
            >
              grok.com/connectors
            </a>
            .
          </li>
          <li>
            Click <strong>New Connector</strong> → <strong>Custom</strong>.
          </li>
          <li>
            Paste this as the MCP server URL (click to copy):
            <button
              type="button"
              className="mt-1 block w-full break-all rounded-md bg-[var(--color-surface-2)] px-2 py-1.5 text-left font-mono text-xs"
              onClick={() => void copy('MCP URL', remoteMcpUrl)}
            >
              {remoteMcpUrl}
            </button>
          </li>
          <li>
            When Grok asks for <strong>OAuth credentials</strong>, use these (or click Copy all):
            <div className="mt-2 space-y-1 rounded-md bg-[var(--color-surface-2)] p-2 font-mono text-[11px]">
              <p>Client ID: projects-manager-mcp</p>
              <p>Client Secret: (leave empty)</p>
              <p className="break-all">Authorization: {authorizeUrl}</p>
              <p className="break-all">Token: {tokenEndpoint}</p>
              <p>Scopes: mcp</p>
              <p>Token Auth Method: none (PKCE only)</p>
            </div>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              onClick={() =>
                void copy(
                  'Grok OAuth fields',
                  [
                    `MCP server URL: ${remoteMcpUrl}`,
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
              Copy all Grok OAuth fields
            </Button>
          </li>
          <li>
            Click <strong>Save &amp; Connect</strong>. A Projects Manager page opens — sign in if
            needed → click <strong>Allow</strong>.
          </li>
          <li>
            Back in Grok, try: <em>“List my Projects Manager projects.”</em>
          </li>
        </ol>
      ) : null}

      {!guide ? (
        <p className="text-xs text-[var(--color-muted)]">
          Press a yellow-highlighted button above to start. You only need one of ChatGPT or Grok —
          or both.
        </p>
      ) : null}

      {/* —— Token list —— */}
      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-semibold"
          onClick={() => setShowTokenList((v) => !v)}
        >
          Your keys (tokens)
          <span className="text-xs font-normal text-[var(--color-muted)]">
            {showTokenList ? 'Hide' : 'Show'} · {(tokensQuery.data ?? []).length} active
          </span>
        </button>
        {showTokenList ? (
          <div className="mt-2">
            {tokensQuery.isLoading ? (
              <p className="text-xs text-[var(--color-muted)]">Loading…</p>
            ) : (tokensQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-[var(--color-muted)]">
                No tokens yet. Use a create button above.
              </p>
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
                        pmcli_{t.token_prefix}_… · {t.can_write ? 'can edit tasks' : 'read-only'}
                        {t.last_used_at
                          ? ` · last used ${new Date(t.last_used_at).toLocaleString()}`
                          : ' · not used yet'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Turn off this key?',
                          message: `“${t.name}” will stop working in ChatGPT, Grok, and CLI immediately.`,
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
        ) : null}
      </div>

      {/* —— Advanced (collapsed) —— */}
      <div className="border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between text-left text-sm font-semibold',
          )}
          onClick={() => setShowAdvanced((v) => !v)}
        >
          Advanced (Grok CLI on your computer, technical fields)
          <span className="text-xs font-normal text-[var(--color-muted)]">
            {showAdvanced ? 'Hide' : 'Show'}
          </span>
        </button>
        {showAdvanced ? (
          <div className="mt-3 space-y-3 text-xs text-[var(--color-muted)]">
            <p>
              <strong className="text-[var(--color-text)]">MCP server URL</strong> (same for all
              remote clients):
            </p>
            {remoteMcpUrl ? (
              <button
                type="button"
                className="block w-full break-all rounded-md bg-[var(--color-surface-2)] px-2 py-1.5 text-left font-mono text-[11px] text-[var(--color-text)]"
                onClick={() => void copy('MCP URL', remoteMcpUrl)}
              >
                {remoteMcpUrl}
              </button>
            ) : null}
            <p>
              <strong className="text-[var(--color-text)]">Grok CLI</strong> (Node.js 18+ on your
              PC). Create a token above first, then run:
            </p>
            <pre className="overflow-x-auto rounded-md bg-[var(--color-surface-2)] p-2 font-mono text-[10px] text-[var(--color-text)]">
              {`grok mcp add projects-manager \\
  -e "PROJECTS_MANAGER_URL=${projectUrl || 'https://YOUR.supabase.co'}" \\
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \\
  -e "PROJECTS_MANAGER_ANON_KEY=${anonKey || 'your-anon-key'}" \\
  -- npx -y projects-manager-mcp@latest`}
            </pre>
            <p>
              Full written guide:{' '}
              <button
                type="button"
                className="underline"
                onClick={() => openHelp(HelpSlugs.cliMcp)}
              >
                open Help → Connect ChatGPT or Grok
              </button>
              .
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
