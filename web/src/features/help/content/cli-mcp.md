---
title: Connect ChatGPT or Grok
description: Web chat via OAuth plugins/connectors; Grok CLI only for local dev and backlog sync
order: 60
---

# Connect ChatGPT or Grok

## Web chat vs Grok CLI (keep them separate)

| Path | Where | What it’s for | How you connect |
|------|--------|----------------|-----------------|
| **ChatGPT (web)** | Browser plugin | Day-to-day chat over your boards | **OAuth** — Allow in browser (no paste secret) |
| **Grok (web)** | Browser connector | Same, in Grok on the web | **OAuth** — Allow in browser |
| **Grok CLI** | Terminal / local Grok CLI on your PC | **Local development and backlog sync only** — not a substitute for web chat | **Manual key** under Settings → Advanced |

**Most people only need web ChatGPT or Grok.**  
**Grok CLI** is optional: install MCP once on a machine for agentic coding / backlog work at the terminal. It does **not** power chatgpt.com or grok.com connectors.

---

## Normal setup (web chat)

You do **not** need to create or copy a secret for web chat.

1. In Projects Manager, open the steps for ChatGPT or Grok (web).  
2. In that chat app, add our **server URL**.  
3. Choose **OAuth**.  
4. Sign in and click **Allow**.  

A key is created **for you** when you Allow. You can revoke it later under **Connected keys**.

| App | They call it | Setup |
|-----|----------------|--------|
| **ChatGPT** | **Plugin** | Developer mode → new plugin → OAuth |
| **Grok (web)** | **Connector** | Connectors → Custom → OAuth |

---

## Links you will use

| What | Link |
|------|------|
| ChatGPT — Developer mode | [Enable Developer mode](https://chatgpt.com/plugins#settings/Security?section=developer-mode) |
| ChatGPT — new plugin | [Create custom plugin](https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins) |
| Grok — connectors | [grok.com/connectors](https://grok.com/connectors) |
| OpenAI help | [Developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) |
| Grok docs | [Custom MCP connectors](https://docs.x.ai/grok/connectors) |

The **MCP server URL** is on **Settings → Connect ChatGPT or Grok** (click to copy). It looks like:

`https://….supabase.co/functions/v1/mcp`

---

## ChatGPT plugin (OAuth)

1. [Turn on Developer mode](https://chatgpt.com/plugins#settings/Security?section=developer-mode) if your account shows it.  
2. [Create a new custom plugin](https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins) (or equivalent “custom connector / app”).  
3. Fill:
   - **Name:** Projects Manager  
   - **Description:** Manage my project boards  
   - **Connection:** Server URL  
   - **Server URL:** from Settings (click to copy)  
   - **Authentication:** **OAuth**  
4. Open **Advanced OAuth settings**. URLs are often **already filled**. If it asks for **Client ID**, use:  
   `projects-manager-mcp`  
   Leave Client Secret empty.  
5. Accept the risk warning → Create / connect.  
6. Browser opens Projects Manager → sign in if needed → **Allow**.  
7. In chat: *“List my Projects Manager projects.”*

No token to copy or paste.

**Note:** Whether Developer mode and custom plugins appear depends on **your ChatGPT account** (plan, region, workspace settings). OpenAI’s options change over time — if you don’t see them, check [OpenAI’s help](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) or try the links above on the account you use for chat.

---

## Grok connector (OAuth)

1. Open [grok.com/connectors](https://grok.com/connectors).  
2. **New Connector** → **Custom**.  
3. Paste the MCP server URL from Settings.  
4. If Grok asks for OAuth fields:

| Field | Value |
|--------|--------|
| Client ID | `projects-manager-mcp` |
| Client Secret | *(empty)* |
| Authorization Endpoint | your site `/oauth/mcp/authorize` (copy from Settings) |
| Token Endpoint | `…/functions/v1/mcp-oauth/token` (copy from Settings) |
| Scopes | `mcp` |
| Token Auth Method | none (PKCE only) |

5. **Save & Connect** → **Allow** on Projects Manager.  
6. In Grok: *“List my Projects Manager projects.”*

Again: no manual token for web Grok.

---

## Why not “create a key first” for web chat?

| Old idea | Better idea |
|----------|-------------|
| Create token → copy → paste into chat app | Chat app uses **OAuth** → you click **Allow** → we create the key for you |

Web ChatGPT and Grok use **OAuth**. Creating a key by hand is for **Grok CLI** (local only), not for normal browser plugins/connectors.

---

## Grok CLI (local only — Advanced)

**Purpose:** local development and backlog sync with Grok CLI / agent tooling on your machine.  
**Not for:** replacing ChatGPT plugins or Grok web connectors.

1. Settings → **Connect ChatGPT or Grok** → expand **Advanced (Grok CLI — local only)**.  
2. Choose key name, **which projects** the token may access, and read/write.  
3. **Create Grok CLI key** → copy the **full setup command** (includes the token).  
4. Paste once in a terminal → restart Grok CLI if it was already open.  
5. Confirm with `grok mcp list`.

The CLI install is for **that computer’s** Grok CLI sessions. It does **not** configure chatgpt.com or grok.com.

---

## Connected keys

After Allow (web) or Create (CLI), Settings lists keys such as “ChatGPT connector …”, “Grok connector …”, or a name you chose for CLI.

**Revoke** = disconnect that connection until you connect again.

---

## Safety

- Prefer separate keys: one web connection per app, optional separate key for CLI.  
- Never share Advanced / CLI tokens.  
- Never put a Supabase **service role** key into a chat app or CLI config.

---

## Troubleshooting

| Problem | Try |
|---------|-----|
| No Developer mode / no create plugin | Check whether those options appear on **your** account; use the [Developer mode link](https://chatgpt.com/plugins#settings/Security?section=developer-mode) and [OpenAI help](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt). Availability varies. |
| Advanced OAuth empty | Enter Client ID `projects-manager-mcp`; other URLs often auto-fill. |
| Allow page 404 | Wait for production deploy; URL must be your live site `/oauth/mcp/authorize`. |
| No tools in **web** chat | New conversation; confirm the **plugin/connector** is still enabled (not the CLI install). |
| CLI tools missing | `grok mcp list`; restart CLI; ensure you used Advanced key + setup command, not only web OAuth. |
