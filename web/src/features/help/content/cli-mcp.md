---
title: Connect ChatGPT or Grok
description: Simple steps for ChatGPT plugins and Grok connectors (token or OAuth)
order: 60
---

# Connect ChatGPT or Grok

ChatGPT calls these **plugins**. Grok calls them **connectors**. Both talk to the same Projects Manager MCP server.

| App | What they call it | Easiest auth |
|-----|-------------------|--------------|
| **ChatGPT** | Plugin | **Bearer token** (paste `pmcli_…`) |
| **Grok (web)** | Connector | **OAuth** (browser “Allow”) |
| **Grok CLI** | MCP server | Token in env vars (advanced) |

**OAuth for ChatGPT too?** Yes. ChatGPT also supports **OAuth**. Using OAuth there makes the flow feel like Grok (sign in → Allow). Token is still simpler for ChatGPT if you prefer one paste.

In Settings → **Connect ChatGPT or Grok** you get big buttons and copy helpers. This page is the full written guide.

---

## Direct links (bookmark these)

| Step | Link |
|------|------|
| ChatGPT — enable Developer mode | [chatgpt.com/plugins → Security → Developer mode](https://chatgpt.com/plugins#settings/Security?section=developer-mode) |
| ChatGPT — new custom plugin | [Create connector / plugin](https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins) |
| Grok — connectors | [grok.com/connectors](https://grok.com/connectors) |
| OpenAI help | [Developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) |
| Grok connectors docs | [docs.x.ai — connectors](https://docs.x.ai/grok/connectors) |

---

## ChatGPT plugin (token — recommended)

### 1. Create a key in Projects Manager

1. Open **Settings** (gear).  
2. **Connect ChatGPT or Grok**.  
3. Press **Start: Create key for ChatGPT**.  
4. **Copy token** from the yellow box (`pmcli_…`). You will not see it again.

### 2. Enable Developer mode

1. Open the [Developer mode](https://chatgpt.com/plugins#settings/Security?section=developer-mode) link (or Settings → Security / Advanced → Developer mode).  
2. Turn **Developer mode** **ON**.  
3. Needs **Plus or Pro** (custom plugins are not on free tier).

### 3. Create the plugin

1. Open [Create custom plugin](https://chatgpt.com/plugins#settings/Connectors?create-connector=true&redirectAfter=%2Fplugins).  
2. Fill:

| Field | Value |
|--------|--------|
| **Name** | Projects Manager |
| **Description** | Manage my project boards |
| **Connection** | **Server URL** (not Tunnel) |
| **Server URL** | From Settings (click to copy) — ends with `/functions/v1/mcp` |
| **Authentication** | Access token / API key → **Bearer** |

3. Accept the risk warning → **Create**.  
4. When asked for the token, paste `pmcli_…`.

### 4. Try it

> List my Projects Manager projects.

---

## ChatGPT plugin (OAuth — similar to Grok)

Use this if you want the same “Allow” experience as Grok.

1. Developer mode ON (link above).  
2. New plugin → same **Server URL**.  
3. **Authentication:** **OAuth** (not token).  
4. If Advanced OAuth is empty, use the same OAuth fields as Grok (Client ID `projects-manager-mcp`, empty secret, authorize / token URLs from Settings → copy).  
5. Create → browser opens Projects Manager → sign in → **Allow**.

---

## Grok connector (OAuth)

1. Open [grok.com/connectors](https://grok.com/connectors).  
2. **New Connector** → **Custom**.  
3. Paste **MCP server URL** from Settings.  
4. When OAuth is required:

| Field | Value |
|--------|--------|
| Client ID | `projects-manager-mcp` |
| Client Secret | *(empty)* |
| Authorization Endpoint | your site `/oauth/mcp/authorize` |
| Token Endpoint | `…/functions/v1/mcp-oauth/token` |
| Scopes | `mcp` |
| Token Auth Method | none (PKCE only) |

Use **Copy all OAuth fields** in Settings so you do not type them by hand.

5. **Save & Connect** → **Allow** on Projects Manager.  
6. Ask Grok to list your projects.

Optional: **Also create a backup Grok key** in Settings if you want a manual token later.

---

## Are ChatGPT and Grok “the same”?

| | ChatGPT | Grok web |
|--|---------|----------|
| Name in their UI | **Plugin** | **Connector** |
| Same MCP URL? | Yes | Yes |
| Same keys system? | Yes (`pmcli_…`) | Yes (OAuth issues a `pmcli_…` for you) |
| Easiest for most people | Paste **Bearer token** | **OAuth** form + Allow |
| Can use OAuth? | Yes (optional) | Yes (usual) |

Making ChatGPT use **OAuth** does make the two processes more similar (both end on our Allow page). Token remains available because ChatGPT’s form supports token *and* OAuth.

---

## Safety

- Prefer **one key per app** (ChatGPT plugin vs Grok connector) so you can revoke one.  
- Revoke under Settings → **Your keys**.  
- Never post a token in a public chat or screenshot.  
- Never use a Supabase **service role** key in a chat app.

---

## Troubleshooting

| Problem | Try this |
|---------|----------|
| No Developer mode | Plus/Pro? Use the [direct Developer mode link](https://chatgpt.com/plugins#settings/Security?section=developer-mode). |
| Plugin form looks different | OpenAI renames screens; look for Server URL + Authentication. |
| Token rejected | New key; full `pmcli_…`; no spaces. |
| OAuth loop | Client ID exactly `projects-manager-mcp`; authorize URL is your **production site** `/oauth/mcp/authorize`. |
| No tools in chat | New conversation after connecting; confirm Developer mode still on. |

More detail for power users: repo file `docs/grok-cli.md`.
