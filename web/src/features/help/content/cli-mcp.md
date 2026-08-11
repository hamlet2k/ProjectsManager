---
title: Grok CLI and MCP
description: Project-scoped tokens and projects-manager-mcp setup
order: 60
---

# Grok CLI and MCP

Manage boards from **Grok CLI / Grok Build** (or any MCP client) without opening the web UI for every edit.

## Create a token

1. **Settings → Grok CLI access**.
2. Name the token.
3. Choose **read-only** or allow create/update/complete/delete.
4. Allow **all projects** or a **subset**.
5. **Create token** and copy `pmcli_…` **once** (it is not shown again).
6. Optionally **Copy Grok CLI setup**.

Revoke tokens anytime from the same list.

## Install MCP (no app repo needed)

Requires **Node.js 18+** and Grok CLI:

```bash
grok mcp add projects-manager \
  -e "PROJECTS_MANAGER_URL=https://YOUR_PROJECT.supabase.co" \
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \
  -e "PROJECTS_MANAGER_ANON_KEY=your-anon-key" \
  -- npx -y projects-manager-mcp@latest
```

Then restart Grok and run `grok mcp list`.

Use the **Copy Grok CLI setup** button after creating a token so the URL, token, and anon key are filled in. Keep quotes around env values.

## What the tools can do

- List projects this token may access  
- List / create / update / complete / delete tasks  
- List tags  

Writes need a **write** token and **editor** (or owner) access on that board.

## Security

- Tokens are stored as hashes; only a short prefix is shown later.
- Prefer project allow-lists and read-only tokens when possible.
- Revoke immediately if a token leaks.

## npm package

Public package: **`projects-manager-mcp`** (`npx -y projects-manager-mcp@latest`).
