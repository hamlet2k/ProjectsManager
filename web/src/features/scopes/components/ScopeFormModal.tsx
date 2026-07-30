import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import type { Scope } from '@/lib/supabase/types'

type Props = {
  open: boolean
  onClose: () => void
  initial?: Scope | null
  onSubmit: (values: { name: string; description: string }) => Promise<void>
}

export function ScopeFormModal({ open, onClose, initial, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setError(null)
    }
  }, [open, initial])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit project' : 'New project'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true)
              setError(null)
              try {
                await onSubmit({ name: name.trim(), description: description.trim() })
                onClose()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to save')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="scope-name" error={error ?? undefined}>
          <Input
            id="scope-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home renovations"
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor="scope-desc">
          <Textarea
            id="scope-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional notes about this project space"
          />
        </Field>
      </div>
    </Modal>
  )
}
