/**
 * Remote MCP endpoint (Streamable HTTP / JSON-RPC) for Grok web connectors,
 * xAI Remote MCP, and other HTTPS MCP clients.
 *
 * Auth: Authorization: Bearer pmcli_… (same CLI tokens as Settings → CLI access)
 * Optional: apikey header (Supabase anon) — some gateways require it.
 *
 * Forwards tools to the existing cli-api Edge Function (no duplicated business logic).
 *
 * Protocol subset: initialize, notifications/initialized, tools/list, tools/call, ping.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, mcp-session-id, mcp-protocol-version',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'mcp-session-id',
}

const SERVER_NAME = 'projects-manager'
const SERVER_VERSION = '1.3.0'
const PROTOCOL_VERSION = '2024-11-05'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: Record<string, unknown>
}

/** MCP tool annotations — ChatGPT uses these for risk labels (read/write/destructive/open-world). */
type ToolAnnotations = {
  title?: string
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint?: boolean
  openWorldHint: boolean
}

type ToolDef = {
  name: string
  title?: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  annotations: ToolAnnotations
}

// --- Shared JSON Schema fragments for outputSchema (matches cli-api responses) ---
const projectSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Project (scope) UUID' },
    name: { type: 'string' },
    description: {
      type: ['string', 'null'],
      description: 'Human project description (purpose, context)',
    },
    assistant_prompt: {
      type: ['string', 'null'],
      description:
        'Project AI instructions set in the app (terminology, workflow, how agents should handle this board)',
    },
    rank: { type: 'number' },
    owner_id: { type: 'string' },
    access: { type: 'string', enum: ['owner', 'editor', 'viewer'] },
  },
  required: ['id', 'name', 'access'],
  additionalProperties: true,
} as const

const taskSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    scope_id: { type: 'string' },
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    completed: { type: 'boolean' },
    completed_date: { type: ['string', 'null'] },
    end_date: { type: ['string', 'null'], description: 'Due date YYYY-MM-DD' },
    rank: { type: 'number' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Tag names on the task (list_tasks only)',
    },
  },
  required: ['id', 'scope_id', 'name'],
  additionalProperties: true,
} as const

const tagSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    scope_id: { type: 'string' },
  },
  required: ['id', 'name', 'scope_id'],
  additionalProperties: true,
} as const

const githubCloseSchema = {
  type: 'object',
  description: 'Present when completing a task closed a linked GitHub issue',
  properties: {
    closed: { type: 'boolean' },
    skipped: { type: 'boolean' },
    reason: { type: 'string' },
    issue_url: { type: 'string' },
    issue_number: { type: 'number' },
  },
  additionalProperties: true,
} as const

const taskMutationOutput = {
  type: 'object',
  properties: {
    task: taskSchema,
    github: githubCloseSchema,
  },
  required: ['task'],
  additionalProperties: true,
} as const

const readOnlyOpen = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const

const writeOpen = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const

const destructiveOpen = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const

const TOOLS: ToolDef[] = [
  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'List boards this token can access. Each project includes id, name, description, and assistant_prompt (project AI instructions). Call this first and follow description + assistant_prompt when creating or organizing tasks on that board.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: {
      type: 'object',
      properties: {
        projects: { type: 'array', items: projectSchema },
        token: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            can_write: { type: 'boolean' },
            scope_ids: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description: 'If set, token is limited to these project IDs',
            },
          },
          additionalProperties: true,
        },
      },
      required: ['projects'],
      additionalProperties: true,
    },
    annotations: { title: 'List projects', ...readOnlyOpen },
  },
  {
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'List tasks on a project board. Prefer list_projects first so you can apply that project’s description and assistant_prompt when interpreting the list.',
    inputSchema: {
      type: 'object',
      properties: {
        scope_id: { type: 'string', description: 'Project (scope) UUID from list_projects' },
        include_completed: {
          type: 'boolean',
          description: 'Include completed tasks (default true)',
        },
        limit: { type: 'number', description: 'Max tasks (default 200, max 500)' },
      },
      required: ['scope_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        tasks: { type: 'array', items: taskSchema },
      },
      required: ['tasks'],
      additionalProperties: true,
    },
    annotations: { title: 'List tasks', ...readOnlyOpen },
  },
  {
    name: 'list_tags',
    title: 'List tags',
    description: 'List tags available on a project board.',
    inputSchema: {
      type: 'object',
      properties: { scope_id: { type: 'string', description: 'Project UUID' } },
      required: ['scope_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        tags: { type: 'array', items: tagSchema },
      },
      required: ['tags'],
      additionalProperties: true,
    },
    annotations: { title: 'List tags', ...readOnlyOpen },
  },
  {
    name: 'create_task',
    title: 'Create task',
    description:
      'Create a task on a project board. Optional description, due date, tags. Follow that project’s description and assistant_prompt from list_projects (naming, tags, workflow).',
    inputSchema: {
      type: 'object',
      properties: {
        scope_id: { type: 'string' },
        name: { type: 'string', description: 'Task title' },
        description: { type: 'string' },
        end_date: { type: 'string', description: 'Due date YYYY-MM-DD' },
        tag_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag names (created if missing)',
        },
      },
      required: ['scope_id', 'name'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { task: taskSchema },
      required: ['task'],
      additionalProperties: true,
    },
    annotations: { title: 'Create task', ...writeOpen },
  },
  {
    name: 'update_task',
    title: 'Update task',
    description: 'Update task fields and/or replace tags by name.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        end_date: { type: ['string', 'null'] },
        completed: { type: 'boolean' },
        tag_names: { type: 'array', items: { type: 'string' } },
      },
      required: ['task_id'],
      additionalProperties: false,
    },
    outputSchema: taskMutationOutput,
    annotations: { title: 'Update task', ...writeOpen },
  },
  {
    name: 'complete_task',
    title: 'Complete task',
    description:
      'Mark a task completed. May also close a linked GitHub issue (same rules as the web UI).',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    outputSchema: taskMutationOutput,
    annotations: {
      title: 'Complete task',
      readOnlyHint: false,
      destructiveHint: false,
      // Completing twice is a no-op on the task; GitHub close is also safe to retry.
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'uncomplete_task',
    title: 'Reopen task',
    description: 'Reopen a completed task.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { task: taskSchema },
      required: ['task'],
      additionalProperties: true,
    },
    annotations: {
      title: 'Reopen task',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'delete_task',
    title: 'Delete task',
    description: 'Permanently delete a task (use carefully).',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        deleted_id: { type: 'string' },
      },
      required: ['ok', 'deleted_id'],
      additionalProperties: true,
    },
    annotations: { title: 'Delete task', ...destructiveOpen },
  },
]

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function rpcResult(id: JsonRpcId | undefined, result: unknown, sessionId?: string) {
  const headers: Record<string, string> = {}
  if (sessionId) headers['mcp-session-id'] = sessionId
  return json({ jsonrpc: '2.0', id: id ?? null, result }, 200, headers)
}

function rpcError(
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  status = 200,
  sessionId?: string,
) {
  const headers: Record<string, string> = {}
  if (sessionId) headers['mcp-session-id'] = sessionId
  return json(
    { jsonrpc: '2.0', id: id ?? null, error: { code, message } },
    status,
    headers,
  )
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Validate pmcli_ token exists (not revoked). */
async function validateCliToken(
  authHeader: string | null,
): Promise<{ ok: true; token: string } | { ok: false; status: number; error: string }> {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Missing Authorization: Bearer pmcli_…' }
  }
  const raw = authHeader.slice(7).trim()
  if (!raw.startsWith('pmcli_')) {
    return {
      ok: false,
      status: 401,
      error: 'Expected a Projects Manager CLI token (pmcli_… from Settings)',
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)
  const hash = await sha256Hex(raw)
  const { data, error } = await admin
    .from('cli_access_tokens')
    .select('id, revoked_at')
    .eq('token_hash', hash)
    .maybeSingle()

  if (error) return { ok: false, status: 500, error: error.message }
  if (!data) return { ok: false, status: 401, error: 'Invalid or unknown CLI token' }
  if ((data as { revoked_at: string | null }).revoked_at) {
    return { ok: false, status: 401, error: 'CLI token has been revoked' }
  }

  void admin
    .from('cli_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', (data as { id: string }).id)

  return { ok: true, token: raw }
}

async function callCliApi(
  token: string,
  action: string,
  params: Record<string, unknown>,
  apikeyHeader: string | null,
): Promise<unknown> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '')
  const anon =
    apikeyHeader?.trim() ||
    Deno.env.get('SUPABASE_ANON_KEY') ||
    Deno.env.get('SB_PUBLISHABLE_KEY') ||
    token

  const res = await fetch(`${supabaseUrl}/functions/v1/cli-api`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...params }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `cli-api HTTP ${res.status}`)
  }
  return data
}

function toolArgsToCliParams(name: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (name) {
    case 'list_projects':
      return {}
    case 'list_tasks':
      return {
        scope_id: args.scope_id,
        include_completed: args.include_completed,
        limit: args.limit,
      }
    case 'list_tags':
      return { scope_id: args.scope_id }
    case 'create_task':
      return {
        scope_id: args.scope_id,
        name: args.name,
        description: args.description,
        end_date: args.end_date,
        tag_names: args.tag_names,
      }
    case 'update_task':
      return {
        task_id: args.task_id,
        name: args.name,
        description: args.description,
        end_date: args.end_date,
        completed: args.completed,
        tag_names: args.tag_names,
      }
    case 'complete_task':
    case 'uncomplete_task':
    case 'delete_task':
      return { task_id: args.task_id }
    default:
      return args
  }
}

async function handleRpc(
  msg: JsonRpcRequest,
  token: string,
  apikey: string | null,
  sessionId: string,
): Promise<Response | null> {
  const method = msg.method
  const id = msg.id

  // Notifications (no id) — acknowledge with 202 empty
  if (id === undefined && method?.startsWith('notifications/')) {
    return new Response(null, { status: 202, headers: { ...corsHeaders, 'mcp-session-id': sessionId } })
  }

  if (!method) {
    return rpcError(id, -32600, 'Invalid Request: missing method', 200, sessionId)
  }

  if (method === 'initialize') {
    return rpcResult(
      id,
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          'Projects Manager remote MCP. Authenticate with a CLI token (pmcli_…) from Settings → CLI & chat connectors. Always call list_projects first: each board includes description and assistant_prompt — follow those when listing, creating, or organizing tasks.',
      },
      sessionId,
    )
  }

  if (method === 'ping') {
    return rpcResult(id, {}, sessionId)
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS }, sessionId)
  }

  if (method === 'tools/call') {
    const params = msg.params ?? {}
    const name = String(params.name || '')
    const args = (params.arguments ?? {}) as Record<string, unknown>
    if (!name) {
      return rpcError(id, -32602, 'tools/call requires params.name', 200, sessionId)
    }
    try {
      const result = await callCliApi(token, name, toolArgsToCliParams(name, args), apikey)
      return rpcResult(
        id,
        {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        },
        sessionId,
      )
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      return rpcResult(
        id,
        {
          content: [{ type: 'text', text: JSON.stringify({ error: errMsg }) }],
          isError: true,
        },
        sessionId,
      )
    }
  }

  // Optional resources/prompts empty
  if (method === 'resources/list') {
    return rpcResult(id, { resources: [] }, sessionId)
  }
  if (method === 'prompts/list') {
    return rpcResult(id, { prompts: [] }, sessionId)
  }

  return rpcError(id, -32601, `Method not found: ${method}`, 200, sessionId)
}

function httpsOrigin(req: Request): string {
  const u = new URL(req.url)
  return u.origin.replace(/^http:\/\//i, 'https://')
}

function resourceUrl(req: Request): string {
  return `${httpsOrigin(req)}/functions/v1/mcp`
}

function authServerUrl(req: Request): string {
  return `${httpsOrigin(req)}/functions/v1/mcp-oauth`
}

function siteUrl(): string {
  return (
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('SITE_URL') ||
    'https://projects-manager-navy.vercel.app'
  ).replace(/\/$/, '')
}

/** RFC 9728 Protected Resource Metadata — ChatGPT discovers OAuth from this. */
function protectedResourceMetadata(req: Request) {
  const resource = resourceUrl(req)
  const as = authServerUrl(req)
  return {
    resource,
    authorization_servers: [as],
    scopes_supported: ['mcp', 'mcp:read', 'mcp:write'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${siteUrl()}/settings`,
  }
}

function unauthorized(req: Request, message: string, status = 401) {
  const metaUrl = `${resourceUrl(req)}/.well-known/oauth-protected-resource`
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      // RFC 9728 / MCP: clients follow resource_metadata to OAuth AS
      'WWW-Authenticate': `Bearer realm="projects-manager-mcp", resource_metadata="${metaUrl}"`,
    },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname

    // OAuth Protected Resource Metadata (RFC 9728) — required for ChatGPT / MCP clients
    if (
      req.method === 'GET' &&
      (path.includes('/.well-known/oauth-protected-resource') ||
        url.searchParams.get('metadata') === 'oauth-protected-resource')
    ) {
      return json(protectedResourceMetadata(req))
    }

    // Health + human-readable connector hint (no auth)
    if (req.method === 'GET') {
      if (
        path.endsWith('/mcp') ||
        path.endsWith('/mcp/') ||
        path.endsWith('/sse') ||
        url.searchParams.has('health')
      ) {
        const meta = protectedResourceMetadata(req)
        return json({
          ok: true,
          name: SERVER_NAME,
          version: SERVER_VERSION,
          protocol: PROTOCOL_VERSION,
          transport: 'streamable-http',
          oauth: {
            client_id: 'projects-manager-mcp',
            authorization_endpoint: `${siteUrl()}/oauth/mcp/authorize`,
            token_endpoint: `${authServerUrl(req)}/token`,
            protected_resource_metadata: `${resourceUrl(req)}/.well-known/oauth-protected-resource`,
            authorization_servers: meta.authorization_servers,
          },
          auth: 'OAuth 2.1 PKCE (Grok/ChatGPT) or Authorization: Bearer pmcli_…',
          tools: TOOLS.map((t) => t.name),
        })
      }
    }

    if (req.method === 'DELETE') {
      // Session end — nothing durable to clear
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Use POST for MCP JSON-RPC (or GET for health / OAuth metadata)' }, 405)
    }

    const auth = req.headers.get('Authorization')
    const validated = await validateCliToken(auth)
    if (!validated.ok) {
      return unauthorized(req, validated.error, validated.status)
    }

    const sessionId =
      req.headers.get('mcp-session-id') ||
      req.headers.get('Mcp-Session-Id') ||
      crypto.randomUUID()

    const apikey = req.headers.get('apikey')
    const body = await req.json().catch(() => null)

    // Batch support
    if (Array.isArray(body)) {
      const results: unknown[] = []
      for (const item of body) {
        const res = await handleRpc(item as JsonRpcRequest, validated.token, apikey, sessionId)
        if (res) {
          const parsed = await res.json()
          results.push(parsed)
        }
      }
      return json(results, 200, { 'mcp-session-id': sessionId })
    }

    if (!body || typeof body !== 'object') {
      return rpcError(null, -32700, 'Parse error', 400, sessionId)
    }

    const res = await handleRpc(body as JsonRpcRequest, validated.token, apikey, sessionId)
    return res ?? new Response(null, { status: 202, headers: { ...corsHeaders, 'mcp-session-id': sessionId } })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500)
  }
})
