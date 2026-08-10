# Grok CLI task access (MCP)

Manage **Projects Manager** boards from **Grok CLI** using the Model Context Protocol (MCP). You choose which projects a token may touch; the CLI never gets broader access than that.

## What you get

| MCP tool | Purpose |
|----------|---------|
| `list_projects` | Boards this token can see |
| `list_tasks` | Tasks on a board (+ tags) |
| `list_tags` | Project tags |
| `create_task` | Create task (optional description, due, tags) |
| `update_task` | Name / description / due / completed / tags |
| `complete_task` / `uncomplete_task` | Toggle done |
| `delete_task` | Hard delete |

Writes require a **read/write** token and **editor** (or owner) access on that board.

## 1. Create a token (web app)

1. Sign in → **Settings** → **Grok CLI access**.  
2. Name the token, pick **all projects** or a subset, choose read-only or write.  
3. **Create token** → copy `pmcli_…` **once**.  
4. Optionally **Copy Grok CLI setup**.

Revoke anytime from the same Settings list.

## 2. Install the MCP package

From this monorepo:

```bash
cd mcp/projects-manager
npm install
```

## 3. Register with Grok CLI

```bash
grok mcp add projects-manager \
  -e PROJECTS_MANAGER_URL="https://YOUR_PROJECT.supabase.co" \
  -e PROJECTS_MANAGER_TOKEN="pmcli_…" \
  -e PROJECTS_MANAGER_ANON_KEY="your-anon-key" \
  -- node /absolute/path/to/mcp/projects-manager/src/index.js
```

Windows (PowerShell) — use full paths for `node` and `index.js` if needed:

```powershell
grok mcp add projects-manager `
  -e PROJECTS_MANAGER_URL="https://YOUR_PROJECT.supabase.co" `
  -e PROJECTS_MANAGER_TOKEN="pmcli_…" `
  -e PROJECTS_MANAGER_ANON_KEY="your-anon-key" `
  -- node C:\path\to\projects-manager-app\mcp\projects-manager\src\index.js
```

Check:

```bash
grok mcp list
```

## 4. Deploy backend (maintainers)

```bash
# Migration
supabase db push
# or apply 20260810000000_cli_access_tokens.sql

supabase functions deploy cli-api --no-verify-jwt
```

`--no-verify-jwt` is required so the Edge Function accepts **CLI PATs** instead of Supabase user JWTs (auth is the PAT itself).

## Architecture

```text
Grok CLI
  → MCP stdio (mcp/projects-manager)
    → POST /functions/v1/cli-api  Authorization: Bearer pmcli_…
      → validate token hash, project allow-list, write flag
      → service role + explicit membership checks
      → tasks / tags / scopes
```

No LLM key is required for CLI task tools — only your PAT.

## Security notes

- Tokens are hashed (SHA-256); only a short prefix is stored for display.  
- Prefer **project allow-lists** over “all projects” for long-lived tokens.  
- Prefer **read-only** tokens for assistant-style Q&A.  
- Revoke immediately if a token leaks.  
- Tokens act as **you** (owner/share membership still enforced).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Invalid or revoked CLI token | New token in Settings; check env `PROJECTS_MANAGER_TOKEN` |
| Token is not allowed on this project | Token allow-list doesn’t include that board |
| Token is read-only | Create a write-enabled token |
| No access to this project | Share/accept invite or use an owner account |
| HTTP 401 from Edge | Deploy `cli-api` with `--no-verify-jwt`; set `PROJECTS_MANAGER_ANON_KEY` |
