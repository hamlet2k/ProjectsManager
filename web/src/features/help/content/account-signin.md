---
title: Account sign-in and OAuth
description: Email, Google/GitHub login, link and unlink identities
order: 70
---

# Account sign-in and OAuth

## Ways to sign in

- **Email + password** (and password reset)
- **Google** or **GitHub** OAuth (account login)

## Link another method

In **Settings → Linked sign-in**:

1. **Link** Google or GitHub while signed in.
2. You can then use either method on the login screen.

## Unlink

- You can unlink a provider only if **another** method remains (email password or a second OAuth provider).
- Supabase blocks removing your **last** identity so you cannot lock yourself out.
- After unlink, the session may refresh; sign out and verify the unlinked provider no longer works if you need to confirm.

## GitHub login vs GitHub tasks

| Feature | Purpose |
|---------|---------|
| **Sign in with GitHub** | Log into Projects Manager |
| **GitHub integration PAT** | Create/sync issues on boards |

They are independent. Linking GitHub for login does **not** replace the integration token. See [GitHub token](?help=github-token).

## Password

Set or change your password under **Settings → Password**. If you only used magic link / OAuth, you can still set a password for email login.
