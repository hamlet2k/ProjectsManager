# projects-manager-mcp

MCP server so **Grok CLI / Grok Build** can manage **Projects Manager** tasks on boards you authorize (**stdio** via `npx`).

Users do **not** need the full app monorepo — only this package (via npm) plus a token from the web app.

### Remote MCP (Grok web / HTTPS)

For **Grok.com connectors** and other remote MCP clients, use the hosted Edge URL instead of this package:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/mcp
Authorization: Bearer pmcli_…
```

See the app **Settings → CLI & chat connectors** and repo `docs/grok-cli.md`.

## Install for Grok CLI (end users)

1. In the Projects Manager web app: **Settings → CLI & chat connectors** → create a token (pick projects).
2. Copy the one-time `pmcli_…` secret.
3. Register the MCP server (uses latest published package):

```bash
grok mcp add projects-manager \
  -e "PROJECTS_MANAGER_URL=https://YOUR_PROJECT.supabase.co" \
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \
  -e "PROJECTS_MANAGER_ANON_KEY=your-anon-key" \
  -- npx -y projects-manager-mcp@latest
```

Windows PowerShell:

```powershell
grok mcp add projects-manager `
  -e "PROJECTS_MANAGER_URL=https://YOUR_PROJECT.supabase.co" `
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" `
  -e "PROJECTS_MANAGER_ANON_KEY=your-anon-key" `
  -- npx -y projects-manager-mcp@latest
```

4. Restart Grok CLI / start a new session. Run `grok mcp list` to confirm.

`npx -y projects-manager-mcp@latest` always pulls the **latest** version when the server starts (or after cache expires). To pin: `projects-manager-mcp@1.0.0`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROJECTS_MANAGER_URL` | yes | Supabase project URL |
| `PROJECTS_MANAGER_TOKEN` | yes | Token from Settings (`pmcli_…`) |
| `PROJECTS_MANAGER_ANON_KEY` | recommended | Supabase anon/publishable key (Edge `apikey` header) |

Optional local file for development: `.env` next to this package (not used by typical `npx` installs).

## Tools

- `list_projects`, `list_tasks`, `list_tags`
- `create_task`, `update_task`, `complete_task`, `uncomplete_task`, `delete_task`
- **`complete_task` / completing via `update_task`:** may also **close the linked GitHub issue** when the project has close-on-complete enabled, the CLI token owner has GitHub integration + PAT, and the task is linked — same gates as the web UI. Response may include a `github` field (`closed`, `skipped`, or `error`). Uncomplete does **not** reopen issues.

## Maintainers: publish updates

From this directory (must be logged into npm as a user who can publish the package name):

```bash
cd mcp/projects-manager
npm login          # once per machine
npm version patch  # or minor / major
npm publish
```

Or push a git tag `mcp-v1.0.1` to run the GitHub Action (requires `NPM_TOKEN` secret on the repo).

After publish, users on `@latest` pick up the new version on the next MCP start / npx fetch.

## Local development (repo clone)

```bash
cd mcp/projects-manager
npm install
export PROJECTS_MANAGER_URL=...
export PROJECTS_MANAGER_TOKEN=...
export PROJECTS_MANAGER_ANON_KEY=...
node src/index.js
```

See also [docs/grok-cli.md](../../docs/grok-cli.md) in the monorepo.
