# Grok CLI task access (MCP)

Manage **Projects Manager** boards from **Grok CLI / Grok Build** using the Model Context Protocol (MCP). You choose which projects a token may touch.

**End users do not need this monorepo** if the MCP package is on npm (`projects-manager-mcp`).

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

## 2. Register with Grok CLI (no repo clone)

```bash
grok mcp add projects-manager \
  -e "PROJECTS_MANAGER_URL=https://YOUR_PROJECT.supabase.co" \
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \
  -e "PROJECTS_MANAGER_ANON_KEY=your-anon-key" \
  -- npx -y projects-manager-mcp@latest
```

Check:

```bash
grok mcp list
```

Restart the Grok session after adding the server.

### Where is the MCP server published?

| Channel | What |
|---------|------|
| **npm** | Package name **`projects-manager-mcp`** → https://www.npmjs.com/package/projects-manager-mcp |
| **Source** | This monorepo: `mcp/projects-manager/` |
| **Backend API** | Supabase Edge Function `cli-api` on your app’s project |

`npx -y projects-manager-mcp@latest` downloads from **npm** (not from your laptop path).

Until the first `npm publish`, the package will 404 on npm — maintainers: see **Publishing updates** below. Local dev can still use `node path/to/mcp/projects-manager/src/index.js`.

## 3. Architecture

```text
Grok CLI / Grok Build
  → npx projects-manager-mcp  (stdio MCP)
    → POST /functions/v1/cli-api
      Authorization: Bearer pmcli_…
      → validate token, project allow-list, write flag
      → tasks / tags / scopes
```

No LLM key is required for these tools — only the PAT.

## Security notes

- Tokens are hashed (SHA-256); only a short prefix is stored for display.  
- Prefer **project allow-lists** over “all projects” for long-lived tokens.  
- Prefer **read-only** tokens for assistant-style Q&A.  
- Revoke immediately if a token leaks.  

## Publishing updates (maintainers)

Yes — you can update the MCP server anytime. Users on `@latest` get new code when npx fetches a new version.

### One-time setup

1. Create an account on [npmjs.com](https://www.npmjs.com) (or use an org).  
2. Claim the name `projects-manager-mcp` (first publish).  
3. On the GitHub repo, add secret **`NPM_TOKEN`** (npm → Access Tokens → Automation).  
4. Optionally: `npm login` on a maintainer machine for manual publishes.

### Publish a new version

**Option A — tag (CI)**

```bash
# bump version in mcp/projects-manager/package.json first, or let the workflow set it from the tag
git tag mcp-v1.0.1
git push origin mcp-v1.0.1
```

GitHub Action `.github/workflows/publish-mcp.yml` runs `npm publish`.

**Option B — manual**

```bash
cd mcp/projects-manager
npm version patch   # 1.0.0 → 1.0.1
npm publish --access public
git push --follow-tags
```

### What users do after you publish

- Nothing special if they use `@latest` — next Grok/MCP start may download the new version.  
- To force refresh: `npm cache clean --force` or re-run with `npx -y projects-manager-mcp@1.0.1`.  
- App backend changes (`cli-api`, DB) deploy separately (`supabase functions deploy`); keep MCP and API compatible or bump major version.

### Local path install (developers only)

```bash
cd mcp/projects-manager && npm install
grok mcp add projects-manager \
  -e PROJECTS_MANAGER_URL=... \
  -e PROJECTS_MANAGER_TOKEN=... \
  -e PROJECTS_MANAGER_ANON_KEY=... \
  -- node /absolute/path/to/mcp/projects-manager/src/index.js
```

## Deploy backend (app maintainers)

```bash
supabase db push   # cli_access_tokens migrations
supabase functions deploy cli-api --no-verify-jwt
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `npx` 404 for package | Package not published yet — run maintainer publish |
| Invalid or revoked CLI token | New token in Settings |
| Token is not allowed on this project | Token allow-list |
| Token is read-only | Create a write-enabled token |
| HTTP 401 from Edge | Deploy `cli-api` with `--no-verify-jwt`; set anon key |

## Future: remote MCP (no npx)

A fully hosted HTTP MCP URL (only token + URL in Grok config, no Node on the laptop) is a possible next step. Today the published **npm** package is the zero-repo path for end users.
