---
title: Grok CLI and MCP
description: Project-scoped tokens, local MCP, and remote chat connectors
order: 60
---

# Grok CLI and MCP

Manage boards from **Grok CLI**, **Grok web chat connectors**, or other MCP clients without opening the web UI for every edit.

## Create a token

1. **Settings → CLI & chat connectors**.  
2. Name the token.  
3. Choose **read-only** or allow create/update/complete/delete.  
4. Allow **all projects** or a **subset**.  
5. **Create token** and copy `pmcli_…` **once**.  
6. Optionally copy **Grok CLI setup** or **remote connector setup**.

Revoke tokens anytime from the same list.

## Two ways to connect

### A. Grok CLI / local MCP (stdio)

Requires **Node.js 18+** and Grok CLI:

```bash
grok mcp add projects-manager \
  -e "PROJECTS_MANAGER_URL=https://YOUR_PROJECT.supabase.co" \
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \
  -e "PROJECTS_MANAGER_ANON_KEY=your-anon-key" \
  -- npx -y projects-manager-mcp@latest
```

Restart Grok and run `grok mcp list`.

### B. Remote MCP (Grok web & HTTPS clients)

Use the **Remote MCP URL** shown in Settings (also in Help):

```text
https://YOUR_PROJECT.supabase.co/functions/v1/mcp
```

Headers:

```http
Authorization: Bearer pmcli_…
apikey: YOUR_SUPABASE_ANON_KEY
```

**Grok.com:** Connectors → New → Custom → paste the URL → authorize with your token when asked.

**ChatGPT:** many custom connectors require OAuth 2.1. Bearer-only Phase 1 may not work there yet; use Grok CLI or Grok web in the meantime.

## What the tools can do

- List projects this token may access  
- List / create / update / complete / delete tasks  
- List tags  

Writes need a **write** token and **editor** (or owner) access on that board.  
**Complete** may also **close a linked GitHub issue** when project settings allow (same as the web UI).

## Security

- Tokens are stored as hashes; only a short prefix is shown later.  
- Prefer project allow-lists and read-only tokens when possible.  
- Revoke immediately if a token leaks.  
- Never put the Supabase **service role** key into a chat connector.

## npm package (local stdio only)

Public package: **`projects-manager-mcp`**. Remote chat uses the hosted Edge URL, not `npx`.
