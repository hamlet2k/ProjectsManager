/**
 * Builds Projects Manager auth email HTML for Supabase Go templates.
 * Run: node supabase/templates/generate.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = __dirname

const BRAND = 'Projects Manager'
const SITE = 'https://projects-manager-navy.vercel.app'
const PRIMARY = '#4b5563'
const MUTED = '#6b7280'
const BORDER = '#e5e7eb'
const BG = '#f3f4f6'

function layout({ title, preheader, bodyHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${title}</title>
  <!-- preheader -->
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</span>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:20px 24px;background:${PRIMARY};color:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:10px;background:rgba(255,255,255,0.15);font-weight:700;font-size:13px;">PM</span>
                    <span style="margin-left:10px;font-size:17px;font-weight:700;letter-spacing:-0.02em;">${BRAND}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;color:#111827;">${title}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTED};">
                ${footerNote || `You're receiving this because of an account action on ${BRAND}.`}
              </p>
              <p style="margin:12px 0 0;font-size:12px;line-height:1.5;color:${MUTED};">
                <a href="${SITE}" style="color:${PRIMARY};text-decoration:underline;">Open ${BRAND}</a>
                &nbsp;·&nbsp;
                <a href="https://ko-fi.com/hamlet2k" style="color:${PRIMARY};text-decoration:underline;">Support on Ko-fi</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:${MUTED};max-width:520px;">
          If a button doesn't work, copy and paste this URL into your browser (when shown in the message body).
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

function p(text) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#374151;">${text}</p>`
}

function btn(href, label) {
  return `<p style="margin:20px 0 16px;">
  <a href="${href}" style="display:inline-block;padding:12px 18px;background:${PRIMARY};color:#ffffff;text-decoration:none;border-radius:8px;font-size:15px;font-weight:600;">${label}</a>
</p>`
}

function codeBox(tokenExpr) {
  return `<p style="margin:16px 0;padding:14px 16px;background:${BG};border:1px dashed ${BORDER};border-radius:8px;font-size:28px;letter-spacing:0.2em;font-weight:700;text-align:center;color:#111827;font-family:ui-monospace,Consolas,monospace;">${tokenExpr}</p>`
}

function muted(text) {
  return `<p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:${MUTED};">${text}</p>`
}

const templates = {
  confirmation: {
    subject: `Confirm your email — ${BRAND}`,
    html: layout({
      title: 'Confirm your email',
      preheader: `Confirm your email to finish signing up for ${BRAND}.`,
      bodyHtml: [
        p(`Thanks for signing up for <strong>${BRAND}</strong>. Confirm this address to activate your account.`),
        p(`Account: <strong>{{ .Email }}</strong>`),
        btn('{{ .ConfirmationURL }}', 'Confirm email'),
        muted('This link expires shortly and can only be used once. If you did not create an account, you can ignore this email.'),
      ].join('\n'),
    }),
  },
  invite: {
    subject: `You're invited to ${BRAND}`,
    html: layout({
      title: "You've been invited",
      preheader: `Accept your invitation to join ${BRAND}.`,
      bodyHtml: [
        p(`You've been invited to create an account on <strong>${BRAND}</strong>.`),
        p(`Invite email: <strong>{{ .Email }}</strong>`),
        btn('{{ .ConfirmationURL }}', 'Accept invitation'),
        muted('If you were not expecting this invitation, you can ignore this email.'),
      ].join('\n'),
    }),
  },
  magic_link: {
    subject: `Your sign-in link — ${BRAND}`,
    html: layout({
      title: 'Sign in to Projects Manager',
      preheader: `Your one-time sign-in link for ${BRAND}.`,
      bodyHtml: [
        p(`Use the button below to sign in as <strong>{{ .Email }}</strong>. This link works once and expires soon.`),
        btn('{{ .ConfirmationURL }}', 'Sign in'),
        muted('Or enter this one-time code if prompted:'),
        codeBox('{{ .Token }}'),
        muted('If you did not request this email, you can safely ignore it.'),
      ].join('\n'),
    }),
  },
  recovery: {
    subject: `Reset your password — ${BRAND}`,
    html: layout({
      title: 'Reset your password',
      preheader: `Choose a new password for your ${BRAND} account.`,
      bodyHtml: [
        p(`We received a request to reset the password for <strong>{{ .Email }}</strong>.`),
        btn('{{ .ConfirmationURL }}', 'Reset password'),
        muted('If you did not request a password reset, you can ignore this email. Your password will stay the same.'),
      ].join('\n'),
    }),
  },
  email_change: {
    subject: `Confirm your new email — ${BRAND}`,
    html: layout({
      title: 'Confirm your new email',
      preheader: 'Confirm the new email address for your account.',
      bodyHtml: [
        p(`Confirm <strong>{{ .NewEmail }}</strong> as the new email for your ${BRAND} account.`),
        p(`Current email on file: <strong>{{ .Email }}</strong>`),
        btn('{{ .ConfirmationURL }}', 'Confirm new email'),
        muted('If you did not request this change, ignore this email or contact support.'),
      ].join('\n'),
    }),
  },
  reauthentication: {
    subject: `{{ .Token }} is your ${BRAND} verification code`,
    html: layout({
      title: 'Verification code',
      preheader: 'Your one-time verification code.',
      bodyHtml: [
        p(`Use this code to verify your identity for a sensitive action on ${BRAND}.`),
        codeBox('{{ .Token }}'),
        muted('This code expires shortly. If you did not request it, secure your account and ignore this email.'),
      ].join('\n'),
    }),
  },
  password_changed_notification: {
    subject: `Your password was changed — ${BRAND}`,
    html: layout({
      title: 'Password changed',
      preheader: 'Your account password was recently changed.',
      bodyHtml: [
        p(`The password for <strong>{{ .Email }}</strong> on ${BRAND} was recently changed.`),
        muted('If you made this change, no further action is needed.'),
        muted(`If you did not, <a href="${SITE}/forgot-password" style="color:${PRIMARY};">reset your password</a> immediately and review account security.`),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
  email_changed_notification: {
    subject: `Your email was changed — ${BRAND}`,
    html: layout({
      title: 'Email address changed',
      preheader: 'Your account email address was changed.',
      bodyHtml: [
        p(`Your ${BRAND} account email was changed from <strong>{{ .OldEmail }}</strong> to <strong>{{ .Email }}</strong>.`),
        muted('If you made this change, no further action is needed. If not, contact support immediately.'),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
  phone_changed_notification: {
    subject: `Your phone number was changed — ${BRAND}`,
    html: layout({
      title: 'Phone number changed',
      preheader: 'Your account phone number was changed.',
      bodyHtml: [
        p(`Your ${BRAND} phone number was changed from <strong>{{ .OldPhone }}</strong> to <strong>{{ .Phone }}</strong>.`),
        muted('If you did not make this change, secure your account immediately.'),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
  identity_linked_notification: {
    subject: `A sign-in method was linked — ${BRAND}`,
    html: layout({
      title: 'Sign-in method linked',
      preheader: 'A new sign-in method was linked to your account.',
      bodyHtml: [
        p(`Your <strong>{{ .Provider }}</strong> account was linked as a sign-in method for <strong>{{ .Email }}</strong> on ${BRAND}.`),
        muted('If you did not link this method, remove it in Settings and secure your account.'),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
  identity_unlinked_notification: {
    subject: `A sign-in method was removed — ${BRAND}`,
    html: layout({
      title: 'Sign-in method removed',
      preheader: 'A sign-in method was removed from your account.',
      bodyHtml: [
        p(`Your <strong>{{ .Provider }}</strong> sign-in method was removed from <strong>{{ .Email }}</strong> on ${BRAND}.`),
        muted('If you did not make this change, secure your account immediately.'),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
  mfa_factor_enrolled_notification: {
    subject: `Verification method added — ${BRAND}`,
    html: layout({
      title: 'Verification method added',
      preheader: 'A new verification method was added to your account.',
      bodyHtml: [
        p(`A new sign-in verification method (<strong>{{ .FactorType }}</strong>) was added to your ${BRAND} account.`),
        muted('If you did not add this method, remove unknown factors and change your password.'),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
  mfa_factor_unenrolled_notification: {
    subject: `Verification method removed — ${BRAND}`,
    html: layout({
      title: 'Verification method removed',
      preheader: 'A verification method was removed from your account.',
      bodyHtml: [
        p(`Sign-in verification method <strong>{{ .FactorType }}</strong> was removed from your ${BRAND} account.`),
        muted('If you did not remove this method, secure your account immediately.'),
      ].join('\n'),
      footerNote: 'Security notification from Projects Manager.',
    }),
  },
}

const subjects = {}
for (const [key, value] of Object.entries(templates)) {
  writeFileSync(join(OUT, `${key}.html`), value.html, 'utf8')
  subjects[key] = value.subject
  console.log('wrote', key + '.html')
}

writeFileSync(join(OUT, 'subjects.json'), JSON.stringify(subjects, null, 2) + '\n', 'utf8')
console.log('wrote subjects.json')
