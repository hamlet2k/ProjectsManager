#!/usr/bin/env node
/**
 * Grok CLI MCP server for Projects Manager.
 *
 * Env (or mcp/projects-manager/.env):
 *   PROJECTS_MANAGER_URL   — Supabase project URL (https://xxx.supabase.co)
 *   PROJECTS_MANAGER_TOKEN — CLI token from Settings (pmcli_…)
 * Optional:
 *   PROJECTS_MANAGER_ANON_KEY — Supabase anon/publishable key (Edge apikey header)
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// Load sibling .env without requiring dotenv package
const __dirname = dirname(fileURLToPath(import.meta.url))
const envFile = join(__dirname, '..', '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

const baseUrl = (process.env.PROJECTS_MANAGER_URL || '').replace(/\/$/, '')
const token = process.env.PROJECTS_MANAGER_TOKEN || ''
const anonKey = process.env.PROJECTS_MANAGER_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

if (!baseUrl || !token || token.includes('REPLACE')) {
  console.error(
    'projects-manager-mcp: set PROJECTS_MANAGER_URL and PROJECTS_MANAGER_TOKEN (Settings → Grok CLI access). Optional: mcp/projects-manager/.env',
  )
  process.exit(1)
}

const functionUrl = `${baseUrl}/functions/v1/cli-api`

async function api(action, params = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  // Supabase Edge requires apikey; use token if anon not set (gateway may accept)
  if (anonKey) headers.apikey = anonKey
  else headers.apikey = token

  const res = await fetch(functionUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...params }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

const tools = [
  {
    name: 'list_projects',
    description:
      'List Projects Manager boards/projects this CLI token can access (id, name, access role).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_tasks',
    description: 'List tasks on a project board. Optionally hide completed tasks.',
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
  },
  {
    name: 'list_tags',
    description: 'List tags available on a project board.',
    inputSchema: {
      type: 'object',
      properties: {
        scope_id: { type: 'string', description: 'Project UUID' },
      },
      required: ['scope_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: 'Create a task on a project board. Optional description, due date, tags.',
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
  },
  {
    name: 'update_task',
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
  },
  {
    name: 'complete_task',
    description:
      'Mark a task completed. If the task has a linked GitHub issue and the project has close-on-complete enabled (and the CLI token owner has GitHub integration + PAT), also closes the issue (same rules as the web UI).',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'uncomplete_task',
    description: 'Reopen a completed task.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_task',
    description: 'Permanently delete a task (use carefully).',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
]

const server = new Server(
  { name: 'projects-manager', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name
  const args = request.params.arguments ?? {}
  try {
    let result
    switch (name) {
      case 'list_projects':
        result = await api('list_projects')
        break
      case 'list_tasks':
        result = await api('list_tasks', {
          scope_id: args.scope_id,
          include_completed: args.include_completed,
          limit: args.limit,
        })
        break
      case 'list_tags':
        result = await api('list_tags', { scope_id: args.scope_id })
        break
      case 'create_task':
        result = await api('create_task', {
          scope_id: args.scope_id,
          name: args.name,
          description: args.description,
          end_date: args.end_date,
          tag_names: args.tag_names,
        })
        break
      case 'update_task':
        result = await api('update_task', {
          task_id: args.task_id,
          name: args.name,
          description: args.description,
          end_date: args.end_date,
          completed: args.completed,
          tag_names: args.tag_names,
        })
        break
      case 'complete_task':
        result = await api('complete_task', { task_id: args.task_id })
        break
      case 'uncomplete_task':
        result = await api('uncomplete_task', { task_id: args.task_id })
        break
      case 'delete_task':
        result = await api('delete_task', { task_id: args.task_id })
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: msg }) }],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
