---
title: Connect ChatGPT or Grok
description: OAuth setup for ChatGPT plugins and Grok connectors — no token pasting for normal use
order: 60
---

# Connect ChatGPT or Grok

You do **not** need to create or copy a secret for the normal setup.

1. In Projects Manager, open the steps for ChatGPT or Grok.  
2. In that chat app, add our **server URL**.  
3. Choose **OAuth**.  
4. Sign in and click **Allow**.  

A key is created **for you** when you Allow. You can revoke it later under **Connected keys**.

| App | They call it | Setup |
|-----|----------------|--------|
| **ChatGPT** | **Plugin** | Developer mode → new plugin → OAuth |
| **Grok (web)** | **Connector** | Connectors → Custom → OAuth |
| **Grok CLI** | MCP on your PC | Advanced only (manual key) |

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

Again: no manual token.

---

## Why not “create a key first”?

| Old idea | Better idea |
|----------|-------------|
| Create token → copy → paste into chat app | Chat app uses **OAuth** → you click **Allow** → we create the key for you |

Creating a key up front was only useful for **Bearer token** auth. ChatGPT and Grok both work with **OAuth**, so the simpler path is: instructions + Allow.

Manual keys still exist under **Advanced** (Grok CLI, rare fallbacks).

---

## Connected keys

After Allow, Settings shows keys named by app (e.g. “ChatGPT connector …”, “Grok connector …”, or “MCP connector …”).  

**Revoke** = disconnect that chat app until you connect again.

---

## Safety

- Prefer one connection per app so you can revoke ChatGPT without Grok.  
- Never share tokens from Advanced.  
- Never put a Supabase **service role** key into a chat app.

---

## Troubleshooting

| Problem | Try |
|---------|-----|
| No Developer mode / no create plugin | Check whether those options appear on **your** account; use the [Developer mode link](https://chatgpt.com/plugins#settings/Security?section=developer-mode) and [OpenAI help](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt). Availability varies. |
| Advanced OAuth empty | Enter Client ID `projects-manager-mcp`; other URLs often auto-fill. |
| Allow page 404 | Wait for production deploy; URL must be your live site `/oauth/mcp/authorize`. |
| No tools in chat | New conversation; confirm the plugin/connector is still enabled. |
