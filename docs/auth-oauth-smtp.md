# Auth: Google + GitHub OAuth, SMTP, and email templates

_Last updated 2026-07-31._

App buttons are live on **Login** and **Sign up**. They only work after you enable each provider in **Supabase** (and Google Cloud / GitHub Developer Settings).

Production site: `https://projects-manager-navy.vercel.app`  
Local: `http://localhost:5173`  
Branded email HTML: `supabase/templates/` (generate + apply scripts in that folder).

**Callback URL used by the app:**  
`https://projects-manager-navy.vercel.app/auth/callback`  
`http://localhost:5173/auth/callback`

---

## 0. Supabase redirect allow-list (do this first)

**Supabase → Authentication → URL configuration**

| Setting | Value |
|---------|--------|
| **Site URL** | `https://projects-manager-navy.vercel.app` |
| **Redirect URLs** | Add all of: |

```
https://projects-manager-navy.vercel.app/**
https://projects-manager-navy.vercel.app/auth/callback
https://projects-manager-navy.vercel.app/reset-password
http://localhost:5173/**
http://localhost:5173/auth/callback
http://localhost:5173/reset-password
```

Also useful for family testing:

```
https://*.vercel.app/auth/callback
```

---

## 1. Google login (OAuth)

### A. Google Cloud Console

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or pick a project.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if Workspace-only).
   - App name: e.g. `Projects Manager`.
   - Support email: your Gmail.
   - Scopes: defaults are fine (`email`, `profile`, `openid`).
   - Test users: add family Gmail addresses while app is in **Testing**.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**.
   - Name: `Projects Manager Supabase`.
   - **Authorized JavaScript origins:**
     - `https://YOUR_PROJECT_REF.supabase.co`
     - `http://localhost:5173` (optional)
   - **Authorized redirect URIs** (critical — must be Supabase, not Vercel):

```
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

   Find `YOUR_PROJECT_REF` in Supabase → Project Settings → General → Reference ID  
   (also in your URL: `https://xxxxx.supabase.co`).

4. Copy **Client ID** and **Client secret**.

### B. Supabase

1. **Authentication → Providers → Google** → Enable.
2. Paste Client ID + Client secret.
3. Save.

### C. Test

Open production login → **Continue with Google**.  
If it fails with “provider is not enabled”, the Supabase toggle is still off.

---

## 2. GitHub login (OAuth — account sign-in)

This is **separate** from the app’s **GitHub task integration** (personal access token for issues).  
OAuth here only means “log into Projects Manager with your GitHub user”.

### A. GitHub Developer Settings

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**  
   (or [github.com/settings/developers](https://github.com/settings/developers))
2. Fill in:

| Field | Value |
|-------|--------|
| Application name | Projects Manager |
| Homepage URL | `https://projects-manager-navy.vercel.app` |
| Authorization callback URL | `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` |

3. Register → **Generate a new client secret**.
4. Copy **Client ID** and **Client secret**.

### B. Supabase

1. **Authentication → Providers → GitHub** → Enable.
2. Paste Client ID + Client secret.
3. Save.

Optional: for org-restricted apps, leave unrestricted for family use.

### C. Test

Login → **Continue with GitHub**.

---

## 3. Email templates (branded)

Auth email HTML lives in **`supabase/templates/`** (confirm signup, magic link, reset password, invite, email change, reauth, plus security notifications).

```bash
# Rebuild HTML from the shared layout
node supabase/templates/generate.mjs

# Push to hosted Supabase (Management API)
# Token: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN=sbp_...
node supabase/templates/apply-to-hosted.mjs
```

Or paste subjects/body from those files into **Dashboard → Authentication → Email Templates**.  
See `supabase/templates/README.md`.

---

## 4. SMTP recommendation (emails: signup confirm, magic link, reset)

### Recommendation: **Resend** (best balance for a free/personal app)

| Provider | Why |
|----------|-----|
| **Resend** ⭐ | Simple UI, good free tier (~3k emails/month), great docs with Supabase |
| SendGrid | Fine; more enterprise clutter |
| Amazon SES | Cheapest at scale; heavier setup |
| Gmail SMTP | OK for tiny personal use only; easy to hit limits / “less secure” friction |

**Use Resend** unless you already live in AWS.

### Resend + Supabase setup

1. Create account at [resend.com](https://resend.com).
2. **Domains** → add a domain you own (e.g. `mail.yourdomain.com`) **or** start with Resend’s onboarding domain for tests (limited).
3. For production: verify DNS (SPF/DKIM) on your domain.
4. **API Keys** → create key → copy once.
5. Supabase → **Project Settings → Authentication → SMTP Settings** → Enable custom SMTP:

| Field | Example |
|-------|---------|
| Sender email | `noreply@yourdomain.com` (must be allowed by Resend) |
| Sender name | Projects Manager |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` |
| Username | `resend` |
| Password | your Resend API key |

6. Save. Send a test **Forgot password** from the app.

Official-style reference: Supabase docs “Send emails with custom SMTP” + Resend “Supabase” guide.

### Until SMTP is ready

- Prefer **Google / GitHub** login (no Supabase auth email).
- Or **disable email confirmation** (Auth → Providers → Email).
- Password login still works for existing users without sending mail.

---

## 5. Email confirmation (optional)

**Authentication → Providers → Email**

| Setting | Suggestion for family app |
|---------|---------------------------|
| Confirm email | **Off** until SMTP works; then optional **On** |
| Secure email change | On |

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `provider is not enabled` | Enable Google/GitHub in Supabase Providers |
| Redirect mismatch | Callback must be `https://REF.supabase.co/auth/v1/callback` on Google/GitHub apps; Vercel URLs go in Supabase Redirect URLs |
| Stuck on “Finishing sign-in” | Check Site URL + Redirect URLs; open browser console |
| `email rate limit exceeded` | Custom SMTP or use OAuth; wait for free mailer cooldown |
| Two users same person | Same email usually links; if not, delete one test user in Auth → Users |
| GitHub OAuth works but no email | App requests `user:email`; check GitHub email privacy / public email |

---

## 7. Security notes

- Never put OAuth **client secrets** in the Vite app — only in Supabase dashboard.
- GitHub **PAT** in Settings (task issues) ≠ GitHub **OAuth App** (login).
- Rotate secrets if they leak.
