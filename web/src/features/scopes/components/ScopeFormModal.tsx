import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import type { Scope } from '@/lib/supabase/types'

export type ScopeFormValues = {
  name: string
  description: string
  /** Project UX: dependency tools (default on). */
  dependenciesEnabled: boolean
  /** Project UX: full export modal from copy (default on). */
  advancedExportEnabled: boolean
}

type Props = {
  open: boolean
  onClose: () => void
  initial?: Scope | null
  onSubmit: (values: ScopeFormValues) => Promise<void>
}

export function ScopeFormModal({ open, onClose, initial, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dependenciesEnabled, setDependenciesEnabled] = useState(true)
  const [advancedExportEnabled, setAdvancedExportEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setDependenciesEnabled(initial?.dependencies_enabled !== false)
      setAdvancedExportEnabled(initial?.advanced_export_enabled !== false)
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
                await onSubmit({
                  name: name.trim(),
                  description: description.trim(),
                  dependenciesEnabled,
                  advancedExportEnabled,
                })
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

        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Project tools
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            Turn off what you don’t need for a simpler board. Shared with everyone on this project.
            Defaults stay on for power workflows.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={dependenciesEnabled}
              onChange={(e) => setDependenciesEnabled(e.target.checked)}
            />
            <span>
              Task dependencies
              <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                Blocked-by / blocks pills and manage button. Existing links are kept if you turn this
                off later.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={advancedExportEnabled}
              onChange={(e) => setAdvancedExportEnabled(e.target.checked)}
            />
            <span>
              Advanced export on copy
              <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                When on, the copy icon opens Import / Export (formats, AI backlog, JSON…). When off,
                copy pastes a simple checklist immediately. The full Import / Export button still
                works either way.
              </span>
            </span>
          </label>
        </div>
      </div>
    </Modal>
  )
}
