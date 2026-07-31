import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import type { Task, TaskDependency } from '@/lib/supabase/types'

type Tab = 'blocked_by' | 'blocks'

type Props = {
  open: boolean
  onClose: () => void
  /** Task we are editing dependencies for */
  task: Task
  allTasks: Task[]
  dependencies: TaskDependency[]
  initialTab?: Tab
  onAddBlocker: (blockedTaskId: string, blockerTaskId: string) => Promise<void>
  onRemoveBlocker: (dep: TaskDependency) => Promise<void>
}

/**
 * Manage who blocks this task and which tasks this one blocks.
 * Draft + Save so multi-select is comfortable; GitHub sync happens in parent handlers.
 */
export function TaskDependenciesModal({
  open,
  onClose,
  task,
  allTasks,
  dependencies,
  initialTab = 'blocked_by',
  onAddBlocker,
  onRemoveBlocker,
}: Props) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [q, setQ] = useState('')
  const [showCompleted, setShowCompleted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Draft: set of task ids that block `task` */
  const [draftBlockers, setDraftBlockers] = useState<Set<string>>(new Set())
  /** Draft: set of task ids blocked by `task` */
  const [draftBlocking, setDraftBlocking] = useState<Set<string>>(new Set())

  const baseline = useMemo(() => {
    const blockers = new Set(
      dependencies.filter((d) => d.blocked_task_id === task.id).map((d) => d.blocker_task_id),
    )
    const blocking = new Set(
      dependencies.filter((d) => d.blocker_task_id === task.id).map((d) => d.blocked_task_id),
    )
    return { blockers, blocking }
  }, [dependencies, task.id])

  useEffect(() => {
    if (!open) return
    setTab(initialTab)
    setQ('')
    setShowCompleted(false)
    setError(null)
    setDraftBlockers(new Set(baseline.blockers))
    setDraftBlocking(new Set(baseline.blocking))
  }, [open, initialTab, baseline])

  const dirty = useMemo(() => {
    if (draftBlockers.size !== baseline.blockers.size) return true
    if (draftBlocking.size !== baseline.blocking.size) return true
    for (const id of draftBlockers) if (!baseline.blockers.has(id)) return true
    for (const id of draftBlocking) if (!baseline.blocking.has(id)) return true
    return false
  }, [draftBlockers, draftBlocking, baseline])

  const candidates = useMemo(() => {
    const query = q.trim().toLowerCase()
    return allTasks
      .filter((t) => t.id !== task.id)
      .filter((t) => showCompleted || !t.completed)
      .filter((t) => {
        if (!query) return true
        return (
          t.name.toLowerCase().includes(query) ||
          (t.description ?? '').toLowerCase().includes(query)
        )
      })
      .sort((a, b) => {
        // Selected first, then incomplete, then name
        const selA =
          tab === 'blocked_by' ? draftBlockers.has(a.id) : draftBlocking.has(a.id)
        const selB =
          tab === 'blocked_by' ? draftBlockers.has(b.id) : draftBlocking.has(b.id)
        if (selA !== selB) return selA ? -1 : 1
        if (a.completed !== b.completed) return a.completed ? 1 : -1
        return a.name.localeCompare(b.name) || a.rank - b.rank
      })
  }, [allTasks, task.id, showCompleted, q, tab, draftBlockers, draftBlocking])

  const toggle = (id: string) => {
    if (tab === 'blocked_by') {
      setDraftBlockers((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    } else {
      setDraftBlocking((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      // blocked_by: task is blocked by X
      for (const id of draftBlockers) {
        if (!baseline.blockers.has(id)) {
          await onAddBlocker(task.id, id)
        }
      }
      for (const id of baseline.blockers) {
        if (!draftBlockers.has(id)) {
          const dep = dependencies.find(
            (d) => d.blocked_task_id === task.id && d.blocker_task_id === id,
          )
          if (dep) await onRemoveBlocker(dep)
        }
      }
      // blocks: task blocks Y (Y is blocked by task)
      for (const id of draftBlocking) {
        if (!baseline.blocking.has(id)) {
          await onAddBlocker(id, task.id)
        }
      }
      for (const id of baseline.blocking) {
        if (!draftBlocking.has(id)) {
          const dep = dependencies.find(
            (d) => d.blocked_task_id === id && d.blocker_task_id === task.id,
          )
          if (dep) await onRemoveBlocker(dep)
        }
      }
      toast.push('Dependencies saved', 'success')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save dependencies')
    } finally {
      setBusy(false)
    }
  }

  const selectedCount = tab === 'blocked_by' ? draftBlockers.size : draftBlocking.size

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      title="Task dependencies"
      size="lg"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          For “
          <strong className="text-[var(--color-text)]">{task.name}</strong>”
          {dirty ? (
            <span className="ml-2 text-xs font-medium text-[var(--color-muted)]">· Unsaved</span>
          ) : null}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium',
              tab === 'blocked_by'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                : 'border-[var(--color-border)]',
            )}
            onClick={() => setTab('blocked_by')}
          >
            Blocked by
            {draftBlockers.size > 0 ? (
              <span className="ml-1.5 opacity-80">({draftBlockers.size})</span>
            ) : null}
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium',
              tab === 'blocks'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                : 'border-[var(--color-border)]',
            )}
            onClick={() => setTab('blocks')}
          >
            Blocks
            {draftBlocking.size > 0 ? (
              <span className="ml-1.5 opacity-80">({draftBlocking.size})</span>
            ) : null}
          </button>
        </div>

        <p className="text-xs text-[var(--color-muted)]">
          {tab === 'blocked_by'
            ? 'Select tasks that must finish before this one can proceed.'
            : 'Select tasks that cannot proceed until this one is done.'}
          {' '}
          If both sides are linked to GitHub issues in the same repo, the relationship is synced
          there too.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Search</span>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter by name or description…"
              autoFocus
              disabled={busy}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-muted)]">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary)]"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
              disabled={busy}
            />
            Show completed
          </label>
        </div>

        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

        <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
          <span>
            {candidates.length} task{candidates.length === 1 ? '' : 's'}
            {selectedCount > 0 ? ` · ${selectedCount} selected` : ''}
          </span>
          {selectedCount > 0 ? (
            <button
              type="button"
              className="underline decoration-wavy"
              disabled={busy}
              onClick={() => {
                if (tab === 'blocked_by') setDraftBlockers(new Set())
                else setDraftBlocking(new Set())
              }}
            >
              Clear selection
            </button>
          ) : null}
        </div>

        <ul className="max-h-80 space-y-0.5 overflow-y-auto rounded-md border border-[var(--color-border)]">
          {candidates.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">
              No tasks match.
            </li>
          ) : (
            candidates.map((t) => {
              const checked =
                tab === 'blocked_by' ? draftBlockers.has(t.id) : draftBlocking.has(t.id)
              return (
                <li key={t.id}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm hover:bg-[var(--color-surface-2)]',
                      checked && 'bg-[var(--color-surface-2)]',
                      t.completed && 'opacity-70',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggle(t.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-[var(--color-text)]">
                        {t.completed ? '✓ ' : ''}
                        {t.name}
                      </span>
                      {t.end_date ? (
                        <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                          Due {t.end_date.slice(0, 10)}
                        </span>
                      ) : null}
                    </span>
                    {checked ? (
                      <span
                        className={cn(
                          'shrink-0 text-[10px] font-bold uppercase tracking-wide',
                          tab === 'blocked_by' ? 'text-[#8b2e2e]' : 'text-[#7a4e12]',
                        )}
                      >
                        {tab === 'blocked_by' ? 'blocker' : 'blocked'}
                      </span>
                    ) : null}
                  </label>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </Modal>
  )
}
