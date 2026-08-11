---
title: Connect ChatGPT or Grok
description: Simple steps to link Projects Manager to ChatGPT, Grok web, or Grok CLI
order: 60
---

# Connect ChatGPT or Grok

You can ask **ChatGPT** or **Grok** to list projects, add tasks, and mark work done — using the same boards as this website.

You will:

1. Create a **secret key (token)** in Projects Manager Settings.  
2. Paste that key (or finish a sign-in screen) inside ChatGPT or Grok.  

**Treat the token like a password.** Anyone with it can use the tools you allowed. You can turn it off anytime under **Settings → Connect ChatGPT or Grok → Your keys**.

---

## Before you start

| You need | Why |
|----------|-----|
| An account on **this** Projects Manager site | So your boards exist here |
| **ChatGPT Plus or Pro** (for ChatGPT) | Custom plugins need a paid plan + Developer Mode |
| A Grok account that supports **Connectors** (for Grok web) | Custom MCP connectors |
| About **5–10 minutes** | First-time setup only |

---

## Path A — ChatGPT (token / Bearer) — simplest

### Step 1 — Create a ChatGPT token here

1. Open **Settings** in Projects Manager (gear icon).  
2. Find **Connect ChatGPT or Grok**.  
3. Press **Create token for ChatGPT**.  
4. A yellow box appears with a long secret starting with `pmcli_…`.  
5. Press **Copy token** and keep it somewhere safe for the next minutes.  
   **You will not see this secret again.**

### Step 2 — Turn on Developer Mode in ChatGPT

1. Open [chatgpt.com](https://chatgpt.com) and sign in.  
2. Open **Settings** (profile picture → Settings).  
3. Open **Apps** or **Connectors** (wording changes).  
4. Open **Advanced** settings if you see it.  
5. Turn **Developer mode** **ON**.  

Official overview: [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).

If you cannot find the toggle, search Settings for “Developer”. Workspace/Enterprise admins may need to allow it.

### Step 3 — Add a new plugin

1. Add a **new plugin** / **connector** (e.g. “New plugin” or “Create”).  
2. Fill in:

| Field | What to type |
|--------|----------------|
| **Name** | `Projects Manager` |
| **Description** | `Manage my project boards` |
| **Connection** | **Server URL** (not Tunnel) |
| **Server URL** | Copy from Settings (same for everyone on this install), looks like: `https://….supabase.co/functions/v1/mcp` |
| **Authentication** | **Access token / API key** → **Bearer** |

3. Check the box that you understand custom servers can be risky.  
4. Press **Create**.

### Step 4 — Paste your token

When ChatGPT asks for the token, paste the `pmcli_…` secret from Step 1.

Optional: if setup fails with an auth/gateway error, add a custom header:

| Header name | Value |
|-------------|--------|
| `apikey` | Supabase **anon** (public) key for this project |

### Step 5 — Try it

In a new chat, try:

> List my Projects Manager projects.

Then:

> On project *Name*, add a task: buy milk.

---

## Path B — Grok on the web (OAuth)

Grok’s custom connector often asks for **OAuth** fields (Client ID, authorize URL, token URL). That is normal.

### Step 1 — Create a Grok token here

1. **Settings → Connect ChatGPT or Grok**.  
2. Press **Create token for Grok**.  
3. Copy the secret if shown (handy backup). Grok web will usually create another key when you click **Allow**.

### Step 2 — Open Grok connectors

1. Go to [grok.com/connectors](https://grok.com/connectors).  
2. **New Connector** → **Custom**.  
3. Paste the **MCP server URL** from Settings (click to copy in the app).

### Step 3 — OAuth fields (if Grok asks)

Use **Copy all Grok OAuth fields** in Settings, or:

| Field | Value |
|--------|--------|
| **Client ID** | `projects-manager-mcp` |
| **Client Secret** | *leave empty* |
| **Authorization Endpoint** | `https://projects-manager-navy.vercel.app/oauth/mcp/authorize` |
| **Token Endpoint** | `https://YOUR_PROJECT.supabase.co/functions/v1/mcp-oauth/token` |
| **Scopes** | `mcp` |
| **Token Auth Method** | **none (PKCE only)** |

Exact URLs for *your* install are on the Settings page (copy buttons).

### Step 4 — Allow access

1. Press **Save & Connect**.  
2. A Projects Manager page opens → sign in if needed → **Allow**.  
3. Return to Grok and ask it to list your projects.

Docs: [Grok custom MCP connectors](https://docs.x.ai/grok/connectors).

---

## Path C — Grok CLI on your computer (optional)

For developers who use **Grok CLI** on a laptop (not required for chat websites):

1. Create any token in Settings and copy it.  
2. Install [Node.js 18+](https://nodejs.org/).  
3. Run the commands under **Advanced** in Settings, or:

```bash
grok mcp add projects-manager \
  -e "PROJECTS_MANAGER_URL=https://YOUR.supabase.co" \
  -e "PROJECTS_MANAGER_TOKEN=pmcli_…" \
  -e "PROJECTS_MANAGER_ANON_KEY=your-anon-key" \
  -- npx -y projects-manager-mcp@latest
```

4. Restart Grok CLI. Check with `grok mcp list`.

---

## What the AI can do

With a write-enabled token:

- List projects and tasks  
- Create / update / complete / delete tasks  
- List tags  

Completing a task that is linked to GitHub may also **close the GitHub issue** (same rules as the website).

---

## Safety tips

- Prefer a **new token** per chat app (ChatGPT vs Grok) so you can revoke one without the other.  
- **Revoke** lost tokens under **Your keys** in Settings.  
- Never share your token in a public chat or screenshot.  
- Never put a Supabase **service role** key into ChatGPT or Grok.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| No Developer Mode in ChatGPT | Paid plan? Admin allowed custom connectors? Search Settings for “Developer”. |
| ChatGPT rejects the server URL | Use **Server URL** (not Tunnel). URL must end with `/functions/v1/mcp`. |
| Token rejected | Create a **new** token; paste the full `pmcli_…` string; no extra spaces. |
| Tools missing in chat | Reconnect the plugin; start a **new** conversation. |
| Grok OAuth loop | Authorization URL must be the **navy** site `/oauth/mcp/authorize`; Client ID exactly `projects-manager-mcp`. |
| “Permission” errors on a board | Token owner must be editor/owner of that project. |

Still stuck? Use the **?** next to **Connect ChatGPT or Grok** in Settings, or the in-app Help Center.
