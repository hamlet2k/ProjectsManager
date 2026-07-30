import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/app/providers/AuthProvider'
import { submitFeedback } from '@/features/github/api'

type FeedbackType = 'question' | 'enhancement' | 'bug'

type Props = {
  open: boolean
  onClose: () => void
}

const TYPE_LINKS: Record<FeedbackType, { href: string; text: string }> = {
  bug: {
    href: 'https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue+state%3Aopen+label%3Abug',
    text: 'Check known bugs',
  },
  enhancement: {
    href: 'https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue+state%3Aopen+label%3Aenhancement',
    text: 'Check upcoming enhancements',
  },
  question: {
    href: 'https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue+label%3Aquestion',
    text: 'Check existing questions',
  },
}

export function FeedbackModal({ open, onClose }: Props) {
  const { profile } = useAuth()
  const toast = useToast()
  const [type, setType] = useState<FeedbackType>('question')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    // Prefill contact from profile email when empty
    setContact((c) => c || profile?.email || '')
  }, [open, profile?.email])

  const reset = () => {
    setTitle('')
    setDescription('')
    setType('question')
    setContact(profile?.email || '')
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Feedback"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              onClose()
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            disabled={busy || !title.trim() || !description.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                const res = await submitFeedback({
                  type,
                  title: title.trim(),
                  description: description.trim(),
                  contact: contact.trim() || undefined,
                  appUrl: window.location.href,
                })
                toast.push(
                  res.issue_number
                    ? `Thanks! Opened issue #${res.issue_number} on GitHub`
                    : 'Feedback submitted',
                  'success',
                )
                if (res.issue_url) {
                  // Keep a local breadcrumb
                  try {
                    const key = 'pm-feedback-drafts'
                    const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]
                    prev.unshift({
                      type,
                      title: title.trim(),
                      description: description.trim(),
                      contact: contact.trim(),
                      issue_url: res.issue_url,
                      issue_number: res.issue_number,
                      at: new Date().toISOString(),
                    })
                    localStorage.setItem(key, JSON.stringify(prev.slice(0, 50)))
                  } catch {
                    /* ignore */
                  }
                }
                reset()
                onClose()
              } catch (e) {
                toast.push(
                  e instanceof Error ? e.message : 'Could not submit feedback',
                  'error',
                )
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Submitting…' : 'Submit Feedback'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">Type</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['question', 'Question'],
                ['enhancement', 'Enhancement'],
                ['bug', 'Bug'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                  type === id
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                }`}
                onClick={() => setType(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            <a
              className="underline decoration-wavy"
              href={TYPE_LINKS[type].href}
              target="_blank"
              rel="noreferrer"
            >
              {TYPE_LINKS[type].text}
            </a>
          </p>
        </div>
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary"
            autoFocus
            disabled={busy}
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[120px]"
            placeholder="What happened, what you expected, steps to reproduce…"
            disabled={busy}
          />
        </Field>
        <Field label="Contact (optional)">
          <Input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email, Discord, or other way we can reach you"
            disabled={busy}
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Prefills with your account email. Change it if you prefer a different reply channel.
          </p>
        </Field>
        <p className="text-xs text-[var(--color-muted)]">
          Submits a GitHub issue on the Projects Manager repository so we can track and respond.
        </p>
      </div>
    </Modal>
  )
}
