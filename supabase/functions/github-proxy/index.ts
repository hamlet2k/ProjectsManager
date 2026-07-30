// Supabase Edge Function: GitHub API proxy (repos, milestones, issues, sync)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GITHUB_API = 'https://api.github.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const material = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('projects-manager-github-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function decryptToken(payload: string, secret: string): Promise<string> {
  const key = await deriveKey(secret)
  const raw = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

/** GitHub accepts Bearer for classic (ghp_) and fine-grained (github_pat_) PATs. */
function authHeader(token: string): string {
  const t = token.trim()
  return `Bearer ${t}`
}

async function gh(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: authHeader(token),
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

async function ghJson<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await gh(token, path, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 400)}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

type ScopeConfig = {
  user_id?: string
  github_integration_enabled: boolean
  github_repo_owner: string | null
  github_repo_name: string | null
  github_repo_id: number | null
  github_milestone_number: number | null
  github_milestone_title: string | null
  github_project_id: string | null
  github_project_name: string | null
  github_label_name: string | null
  close_issue_on_complete?: boolean
  updated_at?: string
}

/** Decode PEM body (base64) → DER bytes. */
function pemBodyToDer(pem: string, typeHint: string): Uint8Array {
  const re = new RegExp(
    `-----BEGIN[^-]*${typeHint}[^-]*-----[\\s\\S]*?-----END[^-]*${typeHint}[^-]*-----`,
    'i',
  )
  const block = pem.match(re)?.[0] ?? pem
  const b64 = block
    .replace(/-----BEGIN[^-]+-----/g, '')
    .replace(/-----END[^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function derToPem(der: Uint8Array, label: string): string {
  // Avoid String.fromCharCode(...largeArray) stack limits on 2048-bit keys
  let binary = ''
  for (let i = 0; i < der.length; i++) binary += String.fromCharCode(der[i]!)
  const b64 = btoa(binary)
  const lines = b64.match(/.{1,64}/g) ?? [b64]
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

function encodeDerLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len)
  if (len < 0x100) return Uint8Array.of(0x81, len)
  if (len < 0x10000) return Uint8Array.of(0x82, (len >> 8) & 0xff, len & 0xff)
  if (len < 0x1000000) {
    return Uint8Array.of(0x83, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff)
  }
  return Uint8Array.of(
    0x84,
    (len >> 24) & 0xff,
    (len >> 16) & 0xff,
    (len >> 8) & 0xff,
    len & 0xff,
  )
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function encodeDerSequence(content: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(0x30), encodeDerLength(content.length), content)
}

function encodeDerOctetString(content: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of(0x04), encodeDerLength(content.length), content)
}

/**
 * GitHub downloads App keys as PKCS#1 (`BEGIN RSA PRIVATE KEY`).
 * universal-github-app-jwt / WebCrypto only accept PKCS#8 (`BEGIN PRIVATE KEY`).
 * Wrap PKCS#1 DER in a minimal PKCS#8 PrivateKeyInfo.
 */
function rsaPkcs1PemToPkcs8Pem(pkcs1Pem: string): string {
  const pkcs1Der = pemBodyToDer(pkcs1Pem, 'RSA PRIVATE KEY')
  // AlgorithmIdentifier: rsaEncryption OID 1.2.840.113549.1.1.1 + NULL
  const algorithmIdentifier = Uint8Array.of(
    0x30,
    0x0d,
    0x06,
    0x09,
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01,
    0x05,
    0x00,
  )
  const version = Uint8Array.of(0x02, 0x01, 0x00) // INTEGER 0
  const privateKey = encodeDerOctetString(pkcs1Der)
  const pkcs8Der = encodeDerSequence(concatBytes(version, algorithmIdentifier, privateKey))
  return derToPem(pkcs8Der, 'PRIVATE KEY')
}

/** Normalize PEM from secrets UI / Windows paste; convert PKCS#1 → PKCS#8 if needed. */
function normalizeGitHubAppPrivateKey(raw: string): string {
  let pem = raw.trim()
  // Secrets often store literal \n; Windows paste may use \r\n
  if (pem.includes('\\n')) pem = pem.replace(/\\n/g, '\n')
  pem = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  if (pem.includes('BEGIN PRIVATE KEY')) return pem.endsWith('\n') ? pem : `${pem}\n`
  if (pem.includes('BEGIN RSA PRIVATE KEY')) return rsaPkcs1PemToPkcs8Pem(pem)

  throw new Error(
    'GITHUB_APP_PRIVATE_KEY must be a PEM starting with BEGIN RSA PRIVATE KEY or BEGIN PRIVATE KEY',
  )
}

/**
 * Product feedback uses the "ProjectsManager Feedback Bot" GitHub App (or a
 * dedicated machine token). Callers never need a personal PAT — same model as
 * the classic Flask /api/feedback flow (utils/github_token.py).
 *
 * Secrets (edge function):
 *   GITHUB_FEEDBACK_REPOSITORY  e.g. hamlet2k/ProjectsManager
 *   GITHUB_APP_ID               App ID from the GitHub App settings page
 *   GITHUB_INSTALLATION_ID      Installation id on that account/org
 *   GITHUB_APP_PRIVATE_KEY      Full PEM from GitHub (PKCS#1 or PKCS#8 OK)
 *
 * Optional escape hatch for ops only:
 *   GITHUB_FEEDBACK_TOKEN       fine-grained/classic PAT with Issues write
 */
async function getFeedbackGitHubToken(): Promise<string> {
  const direct = (Deno.env.get('GITHUB_FEEDBACK_TOKEN') || '').trim()
  if (direct) return direct

  const appId = (Deno.env.get('GITHUB_APP_ID') || '').trim()
  const installationId = (Deno.env.get('GITHUB_INSTALLATION_ID') || '').trim()
  const rawKey = (Deno.env.get('GITHUB_APP_PRIVATE_KEY') || '').trim()
  if (!appId || !installationId || !rawKey) {
    throw new Error(
      'Feedback bot is not configured. Set GITHUB_APP_ID, GITHUB_INSTALLATION_ID, and GITHUB_APP_PRIVATE_KEY (ProjectsManager Feedback Bot) on the edge function.',
    )
  }

  let privateKeyPem: string
  try {
    privateKeyPem = normalizeGitHubAppPrivateKey(rawKey)
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : 'Invalid GITHUB_APP_PRIVATE_KEY')
  }

  // Spread large PEMs carefully for btoa in derToPem — use chunked btoa if needed
  const { createAppAuth } = await import('https://esm.sh/@octokit/auth-app@6.1.1')
  const auth = createAppAuth({
    appId,
    privateKey: privateKeyPem,
    installationId: Number(installationId),
  })
  try {
    const result = await auth({ type: 'installation' })
    if (!result?.token) throw new Error('GitHub App auth returned no installation token')
    return result.token
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(
      `Could not mint Feedback Bot installation token. Check App ID, installation id, PEM, and that the app is installed on the feedback repo. (${msg.slice(0, 240)})`,
    )
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeaderIn = req.headers.get('Authorization')
    if (!authHeaderIn) return json({ error: 'Missing Authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeaderIn } },
    })
    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const body = await req.json().catch(() => ({}))
    const action = body.action as string

    // Product feedback → GitHub issue on the Projects Manager repo (GitHub App / feedback token).
    // Does not require the user's personal PAT.
    if (action === 'submit_feedback') {
      const title = String(body.title ?? '').trim()
      const description = String(body.description ?? body.body ?? '').trim()
      const feedbackType = String(body.type ?? 'question').trim().toLowerCase()
      const contact = String(body.contact ?? '').trim()
      if (!title || !description) {
        return json({ error: 'Title and description are required.' }, 400)
      }
      const typeLabel =
        feedbackType === 'bug' || feedbackType === 'enhancement' || feedbackType === 'question'
          ? feedbackType
          : 'question'

      const repoConfig = (Deno.env.get('GITHUB_FEEDBACK_REPOSITORY') || 'hamlet2k/ProjectsManager').trim()
      const [owner, repoName] = repoConfig.split('/')
      if (!owner || !repoName) {
        return json({ error: 'GITHUB_FEEDBACK_REPOSITORY is invalid (expected owner/repo).' }, 500)
      }

      const { data: profile } = await admin
        .from('profiles')
        .select('name, email, username')
        .eq('id', user.id)
        .maybeSingle()

      const issueBody = [
        `### Feedback (${typeLabel})`,
        '',
        description,
        '',
        '---',
        `**From:** ${profile?.name || '—'} <${profile?.email || user.email || '—'}>`,
        `**Username:** ${profile?.username || '—'}`,
        `**User id:** ${user.id}`,
        contact ? `**Contact / reply-to:** ${contact}` : '**Contact / reply-to:** (not provided)',
        `**App URL:** ${String(body.appUrl ?? '').trim() || '—'}`,
        `**Submitted:** ${new Date().toISOString()}`,
      ].join('\n')

      // Always use Feedback Bot (GitHub App) / dedicated token — never the user's PAT.
      // That way every signed-in app user can submit issues without linking GitHub.
      let feedbackToken: string
      try {
        feedbackToken = await getFeedbackGitHubToken()
      } catch (e) {
        return json(
          {
            error:
              e instanceof Error
                ? e.message
                : 'Feedback bot is not configured on the server.',
          },
          500,
        )
      }

      try {
        const create = (labels: string[]) =>
          ghJson<{ number: number; html_url: string }>(
            feedbackToken,
            `/repos/${owner}/${repoName}/issues`,
            {
              method: 'POST',
              body: JSON.stringify({
                title: title.slice(0, 200),
                body: issueBody,
                labels,
              }),
            },
          )
        let issue: { number: number; html_url: string }
        try {
          issue = await create([typeLabel, 'feedback'])
        } catch {
          // Labels may not exist on the repo — still open the issue.
          issue = await create([])
        }
        return json({
          ok: true,
          issue_number: issue.number,
          issue_url: issue.html_url,
          via: 'feedback_bot',
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not create feedback issue'
        return json({ error: msg }, 400)
      }
    }

    const secret = Deno.env.get('GITHUB_TOKEN_SECRET')
    if (!secret || secret.length < 16) {
      return json({ error: 'GITHUB_TOKEN_SECRET is not configured on the Edge Function' }, 500)
    }

    const { data: cred, error: credErr } = await admin
      .from('github_credentials')
      .select('token_encrypted')
      .eq('user_id', user.id)
      .maybeSingle()
    if (credErr) return json({ error: credErr.message }, 400)
    if (!cred?.token_encrypted) {
      return json({ error: 'No GitHub token configured. Save a PAT under Settings first.' }, 400)
    }

    let token: string
    try {
      token = (await decryptToken(cred.token_encrypted, secret)).trim()
    } catch {
      return json(
        {
          error:
            'Could not decrypt stored token. Remove the token in Settings and save a new PAT (GITHUB_TOKEN_SECRET may have changed).',
        },
        400,
      )
    }
    if (!token) return json({ error: 'Stored GitHub token is empty' }, 400)

    if (action === 'test') {
      try {
        const me = await ghJson<{ login: string }>(token, '/user')
        return json({ ok: true, login: me.login })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'test failed'
        return json(
          {
            error: msg.includes('401')
              ? 'GitHub rejected the token (401). Use a classic PAT with repo scope, or a fine-grained PAT with repository access + Issues read/write.'
              : msg,
          },
          400,
        )
      }
    }

    if (action === 'list_repos') {
      try {
        type RepoRaw = {
          id: number
          name: string
          owner: { login: string } | string
          full_name: string
        }
        const repos: RepoRaw[] = []
        let page = 1
        // affiliation covers owner + collab + org for classic and most fine-grained tokens
        while (page <= 5) {
          const batch = await ghJson<RepoRaw[]>(
            token,
            `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
          )
          repos.push(...batch)
          if (batch.length < 100) break
          page += 1
        }
        return json({
          repositories: repos.map((r) => ({
            id: r.id,
            name: r.name,
            owner: typeof r.owner === 'string' ? r.owner : r.owner.login,
            full_name: r.full_name,
          })),
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'list_repos failed'
        return json({ error: msg }, 400)
      }
    }

    if (action === 'list_milestones') {
      const owner = String(body.owner ?? '')
      const repo = String(body.repo ?? '')
      if (!owner || !repo) return json({ error: 'owner and repo required' }, 400)
      try {
        const milestones = await ghJson<
          Array<{ number: number; title: string; due_on: string | null; state: string }>
        >(token, `/repos/${owner}/${repo}/milestones?state=all&per_page=100`)
        return json({
          milestones: milestones.map((m) => ({
            number: m.number,
            title: m.title,
            due_on: m.due_on,
            state: m.state,
          })),
        })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'list_milestones failed' }, 400)
      }
    }

    if (action === 'list_projects') {
      const owner = String(body.owner ?? '')
      if (!owner) return json({ error: 'owner required' }, 400)
      const query = `
        query($login: String!) {
          repositoryOwner(login: $login) {
            ... on User { projectsV2(first: 20) { nodes { id title number url closed } } }
            ... on Organization { projectsV2(first: 20) { nodes { id title number url closed } } }
          }
        }`
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: authHeader(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables: { login: owner } }),
      })
      const payload = await res.json()
      const nodes = payload?.data?.repositoryOwner?.projectsV2?.nodes ?? []
      return json({
        projects: nodes
          .filter((n: { closed?: boolean } | null) => n && !n.closed)
          .map((n: { id: string; title: string; number?: number; url?: string }) => ({
            id: n.id,
            title: n.title,
            number: n.number,
            url: n.url,
          })),
      })
    }

    /** One project → one repo: owner’s active config, else latest active. */
    async function loadCanonicalScopeConfig(scopeId: string): Promise<ScopeConfig | null> {
      const { data: scope } = await admin.from('scopes').select('owner_id').eq('id', scopeId).maybeSingle()
      const { data: configs } = await admin
        .from('scope_github_configs')
        .select('*')
        .eq('scope_id', scopeId)
      const list = (configs ?? []) as ScopeConfig[]
      const active = list.filter(
        (c) => c.github_integration_enabled && c.github_repo_owner && c.github_repo_name,
      )
      if (active.length === 0) {
        // Fallback: current user's row even if partially filled
        const mine = list.find((c) => c.user_id === user!.id)
        return mine ?? null
      }
      if (scope?.owner_id) {
        const ownerCfg = active.find((c) => c.user_id === scope.owner_id)
        if (ownerCfg) return ownerCfg
      }
      return (
        [...active].sort((a, b) =>
          String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')),
        )[0] ?? null
      )
    }

    async function loadTaskLink(taskId: string) {
      const { data: mine } = await admin
        .from('task_github_configs')
        .select('*')
        .eq('task_id', taskId)
        .eq('user_id', user!.id)
        .maybeSingle()
      if (mine?.github_issue_number) return mine

      const { data: anyLink } = await admin
        .from('task_github_configs')
        .select('*')
        .eq('task_id', taskId)
        .not('github_issue_number', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return anyLink ?? mine ?? null
    }

    async function upsertTaskConfig(
      taskId: string,
      patch: Record<string, unknown>,
      rowUserId?: string,
    ) {
      const uid = rowUserId ?? user!.id
      const { data, error } = await admin
        .from('task_github_configs')
        .upsert({ task_id: taskId, user_id: uid, ...patch }, { onConflict: 'task_id,user_id' })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data
    }

    async function logSync(taskId: string, actionName: string, status: string, message?: string) {
      await admin.from('sync_logs').insert({
        task_id: taskId,
        user_id: user!.id,
        action: actionName,
        status,
        message: message ?? null,
      })
    }

    async function ensureLabel(owner: string, repo: string, label: string) {
      const check = await gh(token, `/repos/${owner}/${repo}/labels/${encodeURIComponent(label)}`)
      if (check.ok) return
      if (check.status === 404) {
        const create = await gh(token, `/repos/${owner}/${repo}/labels`, {
          method: 'POST',
          body: JSON.stringify({
            name: label,
            color: '0E8A16',
            description: 'Projects Manager',
          }),
        })
        if (!create.ok && create.status !== 422) {
          const t = await create.text()
          console.warn('ensureLabel failed', create.status, t.slice(0, 200))
        }
      }
    }

    if (action === 'create_issue') {
      const taskId = String(body.taskId ?? '')
      if (!taskId) return json({ error: 'taskId required' }, 400)

      const existing = await loadTaskLink(taskId)
      if (existing?.github_issue_number) {
        return json({
          error: `Task already linked to issue #${existing.github_issue_number}`,
          config: existing,
        }, 400)
      }

      const { data: task, error: taskErr } = await admin.from('tasks').select('*').eq('id', taskId).single()
      if (taskErr || !task) return json({ error: 'Task not found' }, 404)

      const scopeCfg = await loadCanonicalScopeConfig(task.scope_id)
      if (!scopeCfg?.github_repo_owner || !scopeCfg.github_repo_name) {
        return json(
          {
            error:
              'GitHub repo not configured for this project. Open project → GitHub and select a repository.',
          },
          400,
        )
      }

      const owner = scopeCfg.github_repo_owner
      const repo = scopeCfg.github_repo_name

      // App task tags → GitHub labels (skip system "github" tag)
      const { data: taskTagRows } = await admin
        .from('task_tags')
        .select('tag_id, tags(name)')
        .eq('task_id', taskId)
      const tagNames: string[] = []
      for (const row of (taskTagRows ?? []) as { tags: { name: string } | null }[]) {
        const n = row.tags?.name?.trim()
        if (n && n.toLowerCase() !== 'github') tagNames.push(n)
      }

      const labels: string[] = []
      const labelCandidates = [
        ...tagNames,
        ...(scopeCfg.github_label_name ? [scopeCfg.github_label_name] : []),
      ]
      for (const lab of [...new Set(labelCandidates)]) {
        try {
          await ensureLabel(owner, repo, lab)
          labels.push(lab)
        } catch {
          /* skip bad labels */
        }
      }

      const issueBody: Record<string, unknown> = {
        title: String(body.title ?? task.name),
        body: String(body.body ?? task.description ?? ''),
      }
      if (labels.length) issueBody.labels = labels
      if (scopeCfg.github_milestone_number) issueBody.milestone = scopeCfg.github_milestone_number

      try {
        let issue: {
          id: number
          node_id: string
          number: number
          html_url: string
          state: string
        }
        try {
          issue = await ghJson(token, `/repos/${owner}/${repo}/issues`, {
            method: 'POST',
            body: JSON.stringify(issueBody),
          })
        } catch (first) {
          const msg = first instanceof Error ? first.message : ''
          if (msg.includes('422') || msg.includes('Label') || msg.includes('milestone')) {
            issue = await ghJson(token, `/repos/${owner}/${repo}/issues`, {
              method: 'POST',
              body: JSON.stringify({
                title: issueBody.title,
                body: issueBody.body,
              }),
            })
          } else {
            throw first
          }
        }

        // Ensure app-only system tag "github" on the task
        try {
          let { data: ghTag } = await admin
            .from('tags')
            .select('id')
            .eq('scope_id', task.scope_id)
            .ilike('name', 'github')
            .maybeSingle()
          if (!ghTag) {
            const ins = await admin
              .from('tags')
              .insert({ scope_id: task.scope_id, name: 'github' })
              .select('id')
              .single()
            ghTag = ins.data
          }
          if (ghTag?.id) {
            await admin.from('task_tags').upsert(
              { task_id: taskId, tag_id: ghTag.id },
              { onConflict: 'task_id,tag_id' },
            )
          }
        } catch (e) {
          console.warn('ensure github system tag', e)
        }

        const config = await upsertTaskConfig(taskId, {
          github_issue_id: issue.id,
          github_issue_node_id: issue.node_id,
          github_issue_number: issue.number,
          github_issue_url: issue.html_url,
          github_issue_state: issue.state,
          github_repo_id: scopeCfg.github_repo_id,
          github_repo_name: repo,
          github_repo_owner: owner,
          github_project_id: scopeCfg.github_project_id,
          github_project_name: scopeCfg.github_project_name,
          github_milestone_number: scopeCfg.github_milestone_number,
          github_milestone_title: scopeCfg.github_milestone_title,
        })
        await logSync(taskId, 'create_issue', 'success', `Issue #${issue.number}`)
        return json({ config })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'create failed'
        await logSync(taskId, 'create_issue', 'error', msg)
        return json({ error: msg }, 400)
      }
    }

    if (action === 'sync_task' || action === 'close_issue') {
      const taskId = String(body.taskId ?? '')
      if (!taskId) return json({ error: 'taskId required' }, 400)

      const cfg = await loadTaskLink(taskId)
      if (!cfg?.github_issue_number || !cfg.github_repo_owner || !cfg.github_repo_name) {
        return json({ config: null, error: 'No linked issue for this task' }, 400)
      }

      const owner = cfg.github_repo_owner as string
      const repo = cfg.github_repo_name as string
      const number = cfg.github_issue_number as number
      const rowUser = (cfg.user_id as string) || user.id
      // Legacy clients may send pull/push; we use last-write-wins (LWW) unless forced.
      const forceMode = body.mode === 'pull' || body.mode === 'push' ? String(body.mode) : null

      try {
        if (action === 'close_issue') {
          // Require an active project-level GitHub binding (soft-disable must stop closes)
          const { data: taskRow } = await admin
            .from('tasks')
            .select('scope_id')
            .eq('id', taskId)
            .maybeSingle()
          if (taskRow?.scope_id) {
            const active = await loadCanonicalScopeConfig(taskRow.scope_id as string)
            if (!active?.github_repo_owner || !active.github_integration_enabled) {
              return json(
                {
                  error:
                    'GitHub is disabled for this project. Completing a task will not close the issue until you link a repository again.',
                },
                400,
              )
            }
          }

          const issue = await ghJson<{
            id: number
            node_id: string
            number: number
            html_url: string
            state: string
          }>(token, `/repos/${owner}/${repo}/issues/${number}`, {
            method: 'PATCH',
            body: JSON.stringify({ state: 'closed' }),
          })
          const config = await upsertTaskConfig(
            taskId,
            {
              github_issue_state: issue.state,
              github_issue_url: issue.html_url,
            },
            rowUser,
          )
          await logSync(taskId, 'close_issue', 'success')
          return json({ config })
        }

        const { data: task } = await admin.from('tasks').select('*').eq('id', taskId).single()
        if (!task) return json({ error: 'Task not found' }, 404)

        const scopeCfg = await loadCanonicalScopeConfig(task.scope_id)

        type IssueFull = {
          id: number
          node_id: string
          number: number
          html_url: string
          state: string
          title: string
          body: string | null
          updated_at?: string
          labels?: Array<{ name: string } | string>
        }

        // Always fetch GH first to compare timestamps
        const remote = await ghJson<IssueFull>(token, `/repos/${owner}/${repo}/issues/${number}`)
        const ghMs = remote.updated_at ? new Date(remote.updated_at).getTime() : 0
        const appMs = task.updated_at ? new Date(task.updated_at as string).getTime() : 0
        // GitHub wins on tie (remote edits often need to surface after soft expand)
        const mode: 'pull' | 'push' =
          forceMode === 'push' || forceMode === 'pull'
            ? (forceMode as 'pull' | 'push')
            : ghMs >= appMs
              ? 'pull'
              : 'push'

        let issue: IssueFull = remote

        async function applyGithubLabelsToTask(issueIn: IssueFull) {
          const ghLabelNames = (issueIn.labels ?? [])
            .map((l) => (typeof l === 'string' ? l : l.name))
            .filter(Boolean)
            .filter((n) => n.toLowerCase() !== 'github')
            .filter((n) => n !== (scopeCfg?.github_label_name ?? ''))

          const scopeId = task.scope_id as string
          const tagIds: string[] = []
          for (const name of ghLabelNames) {
            let { data: existing } = await admin
              .from('tags')
              .select('id')
              .eq('scope_id', scopeId)
              .eq('name', name)
              .maybeSingle()
            if (!existing) {
              const ins = await admin
                .from('tags')
                .insert({ scope_id: scopeId, name })
                .select('id')
                .single()
              existing = ins.data
            }
            if (existing?.id) tagIds.push(existing.id)
          }
          let { data: ghTag } = await admin
            .from('tags')
            .select('id')
            .eq('scope_id', scopeId)
            .ilike('name', 'github')
            .maybeSingle()
          if (!ghTag) {
            const ins = await admin
              .from('tags')
              .insert({ scope_id: scopeId, name: 'github' })
              .select('id')
              .single()
            ghTag = ins.data
          }
          if (ghTag?.id) tagIds.push(ghTag.id)

          await admin.from('task_tags').delete().eq('task_id', taskId)
          if (tagIds.length) {
            await admin.from('task_tags').insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })))
          }
        }

        if (mode === 'push') {
          // App is newer → write to GitHub
          const { data: taskTagRows } = await admin
            .from('task_tags')
            .select('tag_id, tags(name)')
            .eq('task_id', taskId)
          const tagNames: string[] = []
          for (const row of (taskTagRows ?? []) as { tags: { name: string } | null }[]) {
            const n = row.tags?.name?.trim()
            if (n && n.toLowerCase() !== 'github') tagNames.push(n)
          }
          const labels: string[] = []
          const candidates = [
            ...tagNames,
            ...(scopeCfg?.github_label_name ? [scopeCfg.github_label_name] : []),
          ]
          for (const lab of [...new Set(candidates)]) {
            try {
              await ensureLabel(owner, repo, lab)
              labels.push(lab)
            } catch {
              /* skip */
            }
          }
          issue = await ghJson<IssueFull>(token, `/repos/${owner}/${repo}/issues/${number}`, {
            method: 'PATCH',
            body: JSON.stringify({
              title: task.name,
              body: task.description ?? '',
              labels,
              state: task.completed ? 'closed' : 'open',
            }),
          })
        } else {
          // GitHub is newer → write to app
          await admin
            .from('tasks')
            .update({
              name: issue.title?.slice(0, 500) || task.name,
              description: issue.body ?? null,
            })
            .eq('id', taskId)
          await applyGithubLabelsToTask(issue)
        }

        const config = await upsertTaskConfig(
          taskId,
          {
            github_issue_id: issue.id,
            github_issue_node_id: issue.node_id,
            github_issue_number: issue.number,
            github_issue_url: issue.html_url,
            github_issue_state: issue.state,
          },
          rowUser,
        )

        if (issue.state === 'closed') {
          await admin
            .from('tasks')
            .update({ completed: true, completed_date: new Date().toISOString() })
            .eq('id', taskId)
            .eq('completed', false)
        } else if (mode === 'pull' && issue.state === 'open') {
          await admin
            .from('tasks')
            .update({ completed: false, completed_date: null })
            .eq('id', taskId)
            .eq('completed', true)
        }

        await logSync(taskId, `sync_task_${mode}`, 'success', `LWW ${mode} gh=${ghMs} app=${appMs}`)
        return json({ config, mode, githubUpdatedAt: remote.updated_at, taskUpdatedAt: task.updated_at })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'sync failed'
        await logSync(taskId, action, 'error', msg)
        return json({ error: msg }, 400)
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unexpected error' }, 500)
  }
})
