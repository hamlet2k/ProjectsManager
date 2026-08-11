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

const CHATGPT_DEV_MODE =
  'https://chatgpt.com/plugins#settings/Security?section=developer-mode'
const CHATGPT_NEW_PLUGIN =
  'https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins'
const GROK_CONNECTORS = 'https://grok.com/connectors'

/**
 * Guided setup for ChatGPT plugins / Grok connectors.
 * Same token system underneath; separate buttons keep instructions easy to follow.
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
  /** ChatGPT: token path vs OAuth path (both supported). */
  const [chatgptAuth, setChatgptAuth] = useState<'token' | 'oauth'>('token')

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

  const oauthFieldsText = [
    `MCP / Server URL: ${remoteMcpUrl}`,
    `Client ID: projects-manager-mcp`,
    `Client Secret: (leave empty)`,
    `Authorization Endpoint: ${authorizeUrl}`,
    `Token Endpoint: ${tokenEndpoint}`,
    `Scopes: mcp`,
    `Token Auth Method: none (PKCE only)`,
  ].join('\n')

  const createTokenFor = async (kind: 'chatgpt' | 'grok') => {
    setBusy(kind)
    setRevealedToken(null)
    try {
      const created = await createCliAccessToken({
        name: kind === 'chatgpt' ? 'ChatGPT plugin' : 'Grok connector',
        scopeIds: null,
        canWrite: true,
      })
      setRevealedToken(created.token)
      setGuide(kind)
      setShowTokenList(true)
      await qc.invalidateQueries({ queryKey: ['cli-tokens', user?.id] })
      toast.push(
        kind === 'chatgpt'
          ? 'ChatGPT key created — copy it below'
          : 'Grok key created — follow the steps below',
        'success',
      )
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Create failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const startGrokOauthOnly = () => {
    setGuide('grok')
    setRevealedToken(null)
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
          <HelpTitle slug={HelpSlugs.cliMcp} hintLabel="Full guide: ChatGPT plugin & Grok connector">
            Connect ChatGPT or Grok
          </HelpTitle>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Link this app so ChatGPT (<strong>plugins</strong>) or Grok (<strong>connectors</strong>)
            can manage your boards. Same system underneath — two simple buttons so you only follow
            one checklist.
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4">
          <p className="text-base font-semibold">ChatGPT plugin</p>
          <p className="mt-1 flex-1 text-xs text-[var(--color-muted)]">
            Recommended: create a key, then paste it as a <strong>Bearer token</strong>. You can also
            use the same <strong>OAuth</strong> flow as Grok (browser “Allow”) so both apps feel
            alike.
          </p>
          <Button
            className="mt-3 w-full"
            disabled={busy != null}
            onClick={() => void createTokenFor('chatgpt')}
          >
            {busy === 'chatgpt' ? 'Creating…' : 'Start: Create key for ChatGPT'}
          </Button>
        </div>
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4">
          <p className="text-base font-semibold">Grok connector</p>
          <p className="mt-1 flex-1 text-xs text-[var(--color-muted)]">
            Uses <strong>OAuth</strong> (you sign in and click Allow). No need to paste a long secret
            into Grok if OAuth works.
          </p>
          <Button
            className="mt-3 w-full"
            variant="primary"
            disabled={busy != null}
            onClick={() => startGrokOauthOnly()}
          >
            Start: Connect Grok (OAuth steps)
          </Button>
          <Button
            className="mt-2 w-full"
            size="sm"
            variant="secondary"
            disabled={busy != null}
            onClick={() => void createTokenFor('grok')}
          >
            {busy === 'grok' ? 'Creating…' : 'Also create a backup Grok key'}
          </Button>
        </div>
      </div>

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

      {/* —— ChatGPT —— */}
      {guide === 'chatgpt' && remoteMcpUrl ? (
        <div className="space-y-4 rounded-xl border border-[var(--color-border)] p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                chatgptAuth === 'token'
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
              )}
              onClick={() => setChatgptAuth('token')}
            >
              Token (easiest)
            </button>
            <button
              type="button"
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                chatgptAuth === 'oauth'
                  ? 'bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-muted)]',
              )}
              onClick={() => setChatgptAuth('oauth')}
            >
              OAuth (same idea as Grok)
            </button>
          </div>

          {chatgptAuth === 'token' ? (
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>
                <span className="font-medium">Copy the token</span> in the yellow box above.
              </li>
              <li>
                Open this link and turn <strong>Developer mode</strong> ON:
                <a
                  className="mt-1 block break-all font-medium text-[var(--color-primary)] underline"
                  href={CHATGPT_DEV_MODE}
                  target="_blank"
                  rel="noreferrer"
                >
                  Enable Developer mode in ChatGPT
                </a>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Needs ChatGPT Plus/Pro. Official help:{' '}
                  <a
                    className="underline"
                    href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Developer mode &amp; MCP apps
                  </a>
                  .
                </p>
              </li>
              <li>
                Open this link to add a <strong>new custom plugin</strong>:
                <a
                  className="mt-1 block break-all font-medium text-[var(--color-primary)] underline"
                  href={CHATGPT_NEW_PLUGIN}
                  target="_blank"
                  rel="noreferrer"
                >
                  Create custom plugin / connector
                </a>
              </li>
              <li>
                On the form ChatGPT shows:
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs text-[var(--color-muted)]">
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
                    <strong>Server URL</strong> (click to copy):{' '}
                    <button
                      type="button"
                      className="break-all font-mono text-[var(--color-text)] underline"
                      onClick={() => void copy('Server URL', remoteMcpUrl)}
                    >
                      {remoteMcpUrl}
                    </button>
                  </li>
                  <li>
                    <strong>Authentication:</strong> Access token / API key →{' '}
                    <strong>Bearer</strong>
                  </li>
                </ul>
              </li>
              <li>
                Check the risk box → <strong>Create</strong>.
              </li>
              <li>
                When ChatGPT asks for the token, paste your <code className="text-[11px]">pmcli_…</code>{' '}
                secret. Done.
              </li>
              <li>
                In a chat try: <em>“List my Projects Manager projects.”</em>
              </li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>
                This path matches <strong>Grok</strong>: you sign in and click{' '}
                <strong>Allow</strong> (no long token paste if ChatGPT completes OAuth).
              </li>
              <li>
                <a
                  className="font-medium text-[var(--color-primary)] underline"
                  href={CHATGPT_DEV_MODE}
                  target="_blank"
                  rel="noreferrer"
                >
                  Enable Developer mode
                </a>
                , then{' '}
                <a
                  className="font-medium text-[var(--color-primary)] underline"
                  href={CHATGPT_NEW_PLUGIN}
                  target="_blank"
                  rel="noreferrer"
                >
                  create a new plugin
                </a>
                .
              </li>
              <li>
                <strong>Server URL</strong> (click to copy):{' '}
                <button
                  type="button"
                  className="break-all font-mono text-xs underline"
                  onClick={() => void copy('Server URL', remoteMcpUrl)}
                >
                  {remoteMcpUrl}
                </button>
              </li>
              <li>
                <strong>Authentication:</strong> choose <strong>OAuth</strong>.
              </li>
              <li>
                If ChatGPT fills Advanced OAuth automatically, continue. If not, use the same fields
                as Grok:
                <Button
                  className="mt-2"
                  size="sm"
                  variant="secondary"
                  onClick={() => void copy('OAuth fields', oauthFieldsText)}
                >
                  Copy OAuth fields (same as Grok)
                </Button>
              </li>
              <li>
                Create → when the browser opens Projects Manager, sign in → <strong>Allow</strong>.
              </li>
            </ol>
          )}
        </div>
      ) : null}

      {/* —— Grok —— */}
      {guide === 'grok' && remoteMcpUrl ? (
        <ol className="list-decimal space-y-3 rounded-xl border border-[var(--color-border)] p-4 pl-8 text-sm">
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
            Click <strong>New Connector</strong> → <strong>Custom</strong>.
          </li>
          <li>
            Paste the MCP server URL (click to copy):
            <button
              type="button"
              className="mt-1 block w-full break-all rounded-md bg-[var(--color-surface-2)] px-2 py-1.5 text-left font-mono text-xs"
              onClick={() => void copy('MCP URL', remoteMcpUrl)}
            >
              {remoteMcpUrl}
            </button>
          </li>
          <li>
            When Grok asks for <strong>OAuth</strong> credentials, fill them (or copy all):
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
              onClick={() => void copy('Grok OAuth fields', oauthFieldsText)}
            >
              Copy all OAuth fields
            </Button>
          </li>
          <li>
            <strong>Save &amp; Connect</strong> → browser opens Projects Manager → sign in if needed
            → <strong>Allow</strong>.
          </li>
          <li>
            Back in Grok: <em>“List my Projects Manager projects.”</em>
          </li>
          {revealedToken ? (
            <li className="text-xs text-[var(--color-muted)]">
              You also created a backup key above. OAuth usually creates its own key named “Grok
              connector …”. You can revoke either under Your keys.
            </li>
          ) : null}
        </ol>
      ) : null}

      {!guide ? (
        <p className="text-xs text-[var(--color-muted)]">
          Tip: <strong>ChatGPT</strong> = plugin + token (or OAuth). <strong>Grok</strong> =
          connector + OAuth. Press a button above to show steps.
        </p>
      ) : null}

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
              <p className="text-xs text-[var(--color-muted)]">No keys yet.</p>
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

      <div className="border-t border-[var(--color-border)] pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left text-sm font-semibold"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          Advanced (Grok CLI on a computer)
          <span className="text-xs font-normal text-[var(--color-muted)]">
            {showAdvanced ? 'Hide' : 'Show'}
          </span>
        </button>
        {showAdvanced ? (
          <div className="mt-3 space-y-2 text-xs text-[var(--color-muted)]">
            <p>
              For developers using Grok CLI on a laptop. Create any key above, then:
            </p>
            <pre className="overflow-x-auto rounded-md bg-[var(--color-surface-2)] p-2 font-mono text-[10px] text-[var(--color-text)]">
              {`grok mcp add projects-manager \\
  -e "PROJECTS_MANAGER_URL=${projectUrl || 'https://YOUR.supabase.co'}" \\
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \\
  -e "PROJECTS_MANAGER_ANON_KEY=${anonKey || 'your-anon-key'}" \\
  -- npx -y projects-manager-mcp@latest`}
            </pre>
          </div>
        ) : null}
      </div>
    </section>
  )
}
