import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Tag, Task } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  initial?: Task | null
  tags: Tag[]
  selectedTagIds?: string[]
  onSubmit: (values: {
    name: string
    description: string
    endDate: string | null
    tagIds: string[]
  }) => Promise<void>
  onDelete?: () => Promise<void>
}

export function TaskModal({
  open,
  onClose,
  initial,
  tags,
  selectedTagIds = [],
  onSubmit,
  onDelete,
}: Props) {
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [endDate, setEndDate] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setEndDate(initial?.end_date ? initial.end_date.slice(0, 10) : '')
    setTagIds(selectedTagIds)
    setError(null)
  }, [open, initial, selectedTagIds])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit task' : 'New task'}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>
            {initial && onDelete ? (
              <Button
                variant="danger"
                disabled={saving}
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete task?',
                    message: initial.name
                      ? `Delete “${initial.name}”? This cannot be undone.`
                      : 'Delete this task? This cannot be undone.',
                    confirmLabel: 'Delete',
                    cancelLabel: 'Cancel',
                    danger: true,
                  })
                  if (!ok) return
                  setSaving(true)
                  try {
                    await onDelete()
                    onClose()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Delete failed')
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              disabled={saving || !name.trim()}
              onClick={async () => {
                setSaving(true)
                setError(null)
                try {
                  await onSubmit({
                    name: name.trim(),
                    description: description.trim(),
                    endDate: endDate ? new Date(endDate).toISOString() : null,
                    tagIds,
                  })
                  onClose()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Save failed')
                } finally {
                  setSaving(false)
                }
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="task-name" error={error ?? undefined}>
          <Input
            id="task-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
          />
        </Field>
        <Field label="Description (Markdown)" htmlFor="task-desc">
          <Textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details, checklists, links…"
            className="min-h-[140px]"
          />
        </Field>
        <Field label="Due date" htmlFor="task-due">
          <Input
            id="task-due"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        {tags.length > 0 ? (
          <Field label="Tags">
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={cn('tag-chip', active && 'active')}
                    onClick={() =>
                      setTagIds((prev) =>
                        active ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                      )
                    }
                  >
                    #{tag.name}
                  </button>
                )
              })}
            </div>
          </Field>
        ) : null}
      </div>
    </Modal>
  )
}
