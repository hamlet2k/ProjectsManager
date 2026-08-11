---
title: GitHub token and permissions
description: Create a PAT and enable GitHub integration in Settings
order: 30
---

# GitHub token and permissions

GitHub **task integration** (create/sync issues) is separate from **Sign in with GitHub** (account login).

## Enable integration

1. Go to **Settings → GitHub integration**.
2. Turn **Enable GitHub integration** on.
3. Create a Personal Access Token on GitHub and paste it.
4. **Save token**, then optionally **Test connection**.

## Create a token on GitHub

1. Open [GitHub → Settings → Developer settings → Personal access tokens](https://github.com/settings/tokens).
2. Prefer a **fine-grained** token, or use a **classic** token if Projects permissions are awkward.

### Fine-grained (recommended)

- **Repository access:** only the repos you will link.
- Permissions commonly needed:
  - **Issues** — Read and write
  - **Metadata** — Read
  - **Contents** — Read (optional metadata)
  - **Projects** — Read and write if you use GitHub Projects (v2)

### Classic (fallback)

Typical scopes:

- `repo` — issues and private repos
- `project` — GitHub Projects
- `user` — identify the account

## After saving

1. Open a **project**.
2. Click **GitHub** and choose the default repository (and optional project board / label).
3. Create or link issues from tasks.

See also: [Link a project to GitHub](?help=github-project-link).

## Soft-disable

Turning **Enable GitHub integration** off stops your mutations but keeps linked issue numbers visible as read-only where a project still has a binding. Your encrypted token is kept until you delete it.

## Security

- Tokens are stored for Edge Functions — they are not exposed in the browser after save.
- Prefer least privilege (fine-grained, selected repos).
- Revoke the token on GitHub if it leaks; then save a new one in Settings.
