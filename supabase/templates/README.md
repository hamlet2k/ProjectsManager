# Supabase auth email templates

Branded **Projects Manager** templates for Supabase Auth (signup, magic link, password reset, etc.) and security notifications.

## Files

| File | Auth flow |
|------|-----------|
| `confirmation.html` | Confirm sign-up email |
| `invite.html` | Invite user |
| `magic_link.html` | Magic link / OTP sign-in |
| `recovery.html` | Password reset |
| `email_change.html` | Confirm new email |
| `reauthentication.html` | Sensitive-action OTP |
| `*_notification.html` | Security notices (password/email/phone/MFA/identity) |
| `subjects.json` | Email subjects |
| `generate.mjs` | Rebuild HTML from layout |
| `apply-to-hosted.mjs` | Push to hosted project via Management API |

## Local (CLI)

Templates are wired in `supabase/config.toml`. After edits:

```bash
node supabase/templates/generate.mjs
supabase stop && supabase start
```

## Hosted (production)

### Option A — script (recommended)

```bash
node supabase/templates/generate.mjs
# token: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN=sbp_...
export SUPABASE_PROJECT_REF=xzemmojhwjpegfjnqwuv   # optional if default
node supabase/templates/apply-to-hosted.mjs
```

### Option B — Dashboard

1. Open [Email Templates](https://supabase.com/dashboard/project/xzemmojhwjpegfjnqwuv/auth/templates).
2. For each template, paste **Subject** from `subjects.json` and **Body** from the matching `.html` file.
3. Enable security notification templates if you want password/email change alerts.

## Variables

Go templates — see [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates):

- `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`, `{{ .SiteURL }}`, etc.

## SMTP

Templates only control content. Delivery needs custom SMTP (Resend recommended) — see `docs/auth-oauth-smtp.md`.
