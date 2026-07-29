import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { copyToClipboard } from '@/lib/utils'
import { useAuth } from '@/app/providers/AuthProvider'

type FeedbackType = 'question' | 'enhancement' | 'bug'

type Props = {
  open: boolean
  onClose: () => void
}

export function FeedbackModal({ open, onClose }: Props) {
  const { profile } = useAuth()
  const toast = useToast()
  const [type, setType] = useState<FeedbackType>('question')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Feedback"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                const body = [
                  `Type: ${type}`,
                  `From: ${profile?.name ?? ''} <${profile?.email ?? ''}>`,
                  `Username: ${profile?.username ?? ''}`,
                  '',
                  description.trim() || '(no description)',
                  '',
                  `App: ${window.location.href}`,
                ].join('\n')
                const text = `${title.trim()}\n\n${body}`
                const ok = await copyToClipboard(text)
                // Persist locally for your own backlog
                const key = 'pm-feedback-drafts'
                const prev = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]
                prev.unshift({
                  type,
                  title: title.trim(),
                  description: description.trim(),
                  at: new Date().toISOString(),
                  user: profile?.email,
                })
                localStorage.setItem(key, JSON.stringify(prev.slice(0, 50)))
                toast.push(
                  ok
                    ? 'Feedback copied to clipboard (also saved in this browser)'
                    : 'Feedback saved in this browser',
                  'success',
                )
                setTitle('')
                setDescription('')
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            Submit Feedback
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium">Type</p>
          <div className="flex flex-wrap gap-2">
            {([
              ['question', 'Question'],
              ['enhancement', 'Enhancement'],
              ['bug', 'Bug'],
            ] as const).map(([id, label]) => (
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
        </div>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-[120px]"
          />
        </Field>
        <p className="text-xs text-[var(--color-muted)]">
          Feedback is copied to your clipboard and stored locally in this browser until a shared
          inbox is wired up.
        </p>
      </div>
    </Modal>
  )
}
