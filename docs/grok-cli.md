# Connect ChatGPT, Grok (web), or Grok CLI (MCP)

**End-user guide:** in the app open **Help → Connect ChatGPT or Grok**, or **Settings → Connect ChatGPT or Grok**.

This file is the maintainer / power-user reference.

## Keep web chat and CLI distinct

| Path | Audience | Auth | Notes |
|------|----------|------|--------|
| **ChatGPT web** | Day-to-day chat | **OAuth** (preferred); Bearer fallback | Browser plugin — remote HTTPS MCP |
| **Grok web** | Day-to-day chat | **OAuth PKCE** | Browser connector — same remote MCP |
| **Grok CLI** | **Local dev & backlog sync only** | Manual `pmcli_…` + `npx projects-manager-mcp` | stdio on your PC — does **not** configure web plugins/connectors |

Most users never need the CLI section.

### ChatGPT (summary)

1. Prefer **OAuth** on a custom plugin (see in-app Help).  
2. [chatgpt.com](https://chatgpt.com) → enable **Developer mode** if shown ([OpenAI help](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt); availability varies by account)  
3. Server URL = `https://PROJECT.supabase.co/functions/v1/mcp`  
4. Bearer fallback only if needed: create a manual key in Advanced (rare).

### Grok web (summary)

1. [grok.com/connectors](https://grok.com/connectors) → New → Custom → MCP URL  
2. OAuth: Client ID `projects-manager-mcp`, empty secret, authorize = site `/oauth/mcp/authorize`, token = `…/mcp-oauth/token`, scope `mcp`, PKCE only  
3. Allow in browser  

### Grok CLI (summary — local only)

1. Settings → **Advanced (Grok CLI — local only)** → pick projects → create key → **Copy full setup command**  
2. Paste once in a terminal; restart Grok CLI  
3. **Not** for chatgpt.com / grok.com — only local agent / backlog tooling  

CLI tokens can be limited to selected projects. **End users do not need this monorepo** if the npm package is published (`projects-manager-mcp@latest`).

## What you get

| MCP tool | Purpose |
|----------|---------|
| `list_projects` | Boards this token can see (`description`, `assistant_prompt` AI instructions) |
| `list_tasks` | Tasks on a board (+ tags) |
| `list_tags` | Project tags |
| `create_task` | Create task (optional description, due, tags) |
| `update_task` | Name / description / due / completed / tags |
| `complete_task` / `uncomplete_task` | Toggle done |
| `delete_task` | Hard delete |

Writes require a **read/write** token and **editor** (or owner) access on that board.

### GitHub close on complete (CLI / MCP)

When you **complete** a task that is linked to a GitHub issue, `cli-api` uses the **same rules as the web UI** to try closing that issue:

1. CLI token owner has **GitHub integration** enabled and a saved PAT  
2. Project has an **active** GitHub repo binding  
3. Project **close issue on complete** is not disabled  
4. Task has a linked open issue  

The board task is always updated even if GitHub fails. Response may include `github: { closed: true, issue_number }` or `{ skipped: "…" }` / `{ error: "…" }`.  
**Uncomplete** does not reopen GitHub issues (same as the web app).

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

## 3. Remote MCP (Grok web / HTTPS connectors)

After creating a token:

**MCP URL**

```text
https://YOUR_PROJECT.supabase.co/functions/v1/mcp
```

**Auth headers**

```http
Authorization: Bearer pmcli_…
apikey: YOUR_SUPABASE_ANON_KEY
```

(Supabase Edge often expects `apikey`; some clients only send `Authorization` — the function accepts both when the gateway allows.)

### Grok.com

1. Open [grok.com/connectors](https://grok.com/connectors) (or Connectors in the Grok app).  
2. **New Connector** → **Custom**.  
3. Paste the MCP URL.  
4. Complete auth if prompted (Bearer token / custom headers as the UI allows).  
5. Start a chat and ask to list your Projects Manager boards.

### xAI API (Remote MCP tools)

Pass `server_url` = the MCP URL and include the Authorization header per [xAI remote MCP docs](https://docs.x.ai/docs).

### Health check

```bash
curl -s "https://YOUR_PROJECT.supabase.co/functions/v1/mcp"
```

Should return JSON with `"ok": true` and tool names (no token required for GET health).

## 4. Architecture

```text
Grok CLI / Grok Build
  → npx projects-manager-mcp  (stdio MCP)
    → POST /functions/v1/cli-api
      Authorization: Bearer pmcli_…

Grok web / remote MCP clients
  → HTTPS  /functions/v1/mcp  (Streamable HTTP / JSON-RPC)
      Authorization: Bearer pmcli_…
    → POST /functions/v1/cli-api  (same business logic)
      → tasks / tags / scopes (+ optional GitHub close on complete)
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
