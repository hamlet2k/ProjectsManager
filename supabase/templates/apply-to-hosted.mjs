/**
 * Apply email templates to the linked hosted Supabase project via Management API.
 *
 * Requires: SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 * Optional: SUPABASE_PROJECT_REF (defaults to ProjectsManager linked ref)
 *
 * Run from repo root:
 *   node supabase/templates/generate.mjs
 *   node supabase/templates/apply-to-hosted.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF || 'xzemmojhwjpegfjnqwuv'

if (!token) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Create one at https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const subjects = JSON.parse(readFileSync(join(__dirname, 'subjects.json'), 'utf8'))
const html = (name) => readFileSync(join(__dirname, `${name}.html`), 'utf8')

/** Map template keys → Management API auth config fields */
const payload = {
  mailer_subjects_confirmation: subjects.confirmation,
  mailer_templates_confirmation_content: html('confirmation'),
  mailer_subjects_invite: subjects.invite,
  mailer_templates_invite_content: html('invite'),
  mailer_subjects_magic_link: subjects.magic_link,
  mailer_templates_magic_link_content: html('magic_link'),
  mailer_subjects_recovery: subjects.recovery,
  mailer_templates_recovery_content: html('recovery'),
  mailer_subjects_email_change: subjects.email_change,
  mailer_templates_email_change_content: html('email_change'),
  mailer_subjects_reauthentication: subjects.reauthentication,
  mailer_templates_reauthentication_content: html('reauthentication'),

  mailer_notifications_password_changed_enabled: true,
  mailer_subjects_password_changed_notification: subjects.password_changed_notification,
  mailer_templates_password_changed_notification_content: html('password_changed_notification'),

  mailer_notifications_email_changed_enabled: true,
  mailer_subjects_email_changed_notification: subjects.email_changed_notification,
  mailer_templates_email_changed_notification_content: html('email_changed_notification'),

  mailer_notifications_phone_changed_enabled: true,
  mailer_subjects_phone_changed_notification: subjects.phone_changed_notification,
  mailer_templates_phone_changed_notification_content: html('phone_changed_notification'),

  mailer_notifications_identity_linked_enabled: true,
  mailer_subjects_identity_linked_notification: subjects.identity_linked_notification,
  mailer_templates_identity_linked_notification_content: html('identity_linked_notification'),

  mailer_notifications_identity_unlinked_enabled: true,
  mailer_subjects_identity_unlinked_notification: subjects.identity_unlinked_notification,
  mailer_templates_identity_unlinked_notification_content: html('identity_unlinked_notification'),

  mailer_notifications_mfa_factor_enrolled_enabled: true,
  mailer_subjects_mfa_factor_enrolled_notification: subjects.mfa_factor_enrolled_notification,
  mailer_templates_mfa_factor_enrolled_notification_content: html('mfa_factor_enrolled_notification'),

  mailer_notifications_mfa_factor_unenrolled_enabled: true,
  mailer_subjects_mfa_factor_unenrolled_notification: subjects.mfa_factor_unenrolled_notification,
  mailer_templates_mfa_factor_unenrolled_notification_content: html('mfa_factor_unenrolled_notification'),
}

const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
})

const text = await res.text()
if (!res.ok) {
  console.error('Failed to update auth config', res.status, text)
  process.exit(1)
}

console.log(`Updated email templates on project ${projectRef} (${Object.keys(payload).length} fields).`)
console.log('Verify in Dashboard → Authentication → Email Templates.')
