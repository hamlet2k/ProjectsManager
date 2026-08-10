import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import type { Tag, Task } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'
import { Icons } from '@/components/icons'
import { isModKey, TASK_SHORTCUTS } from '@/lib/keyboardShortcuts'
import { InlineTagAdd } from '@/features/tasks/components/InlineTagAdd'
import { isGithubSystemTag } from '@/features/github/systemTag'
import { MarkdownHelp } from '@/components/ui/MarkdownHelp'
import { TaskDeleteConfirm, type TaskDeleteMode } from '@/features/tasks/components/TaskDeleteConfirm'
import type { TaskGitHubConfig } from '@/lib/supabase/types'
import {
  loadLastNewTaskTagIds,
  saveLastNewTaskTagIds,
} from '@/features/tasks/lastNewTaskTags'
import { getProjectPref, setProjectPref } from '@/lib/projectPrefs'

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
    /** New task only: also create + link a GitHub issue. */
    createGithubIssue?: boolean
  }) => Promise<void | { id?: string } | Task>
  onDelete?: (opts?: { closeGithubIssues?: boolean }) => Promise<void>
  /** GitHub link for delete confirm (option C). */
  githubConfig?: TaskGitHubConfig | null
  canCloseGithubIssues?: boolean
  /** New task: show “create GitHub issue” option. */
  canCreateGithubIssue?: boolean
  githubRepoLabel?: string | null
  /** Create a project tag (for inline + tag). */
  onCreateTag?: (name: string) => Promise<Tag>
  /** New task only: create task from a GitHub issue instead. */
  onImportFromGithub?: () => void
  /** AI polish title / description / tags (optional). */
  onEnhance?: (draft: {
    name: string
    description: string
    tagIds: string[]
  }) => Promise<{
    name: string
    description: string
    tagIds: string[]
    endDate?: string | null
  }>
  /** After create+close: parent can scroll to the new task id. */
  onCreated?: (taskId: string) => void
  /** Project id for per-project remembered tags / GH-on-add */
  scopeId?: string
}

export function TaskModal({
  open,
  onClose,
  initial,
  tags,
  selectedTagIds = [],
  onSubmit,
  onDelete,
  githubConfig = null,
  canCloseGithubIssues = false,
  canCreateGithubIssue = false,
  githubRepoLabel = null,
  onCreateTag,
  onImportFromGithub,
  onEnhance,
  onCreated,
  scopeId,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [endDate, setEndDate] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [createGithubIssue, setCreateGithubIssue] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setDescription(initial?.description ?? '')
    setEndDate(initial?.end_date ? initial.end_date.slice(0, 10) : '')
    setError(null)
    if (initial) {
      setTagIds(selectedTagIds)
    } else {
      // New task: parent may pass overrides (e.g. future); else last selection for this project
      const valid = tags.map((t) => t.id)
      setTagIds(
        selectedTagIds.length > 0
          ? selectedTagIds.filter((id) => valid.includes(id))
          : loadLastNewTaskTagIds(scopeId, valid),
      )
      setCreateGithubIssue(getProjectPref(scopeId, 'create-gh-on-add', 'false') === 'true')
    }
  }, [open, initial, selectedTagIds, tags, scopeId])

  const resetFormForAnother = () => {
    setName('')
    setDescription('')
    setEndDate('')
    const valid = tags.map((t) => t.id)
    setTagIds(loadLastNewTaskTagIds(scopeId, valid))
    setError(null)
  }

  const save = async (opts?: { addAnother?: boolean }) => {
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      if (!initial) {
        setProjectPref(scopeId, 'create-gh-on-add', String(createGithubIssue))
        saveLastNewTaskTagIds(scopeId, tagIds)
      }
      const result = await onSubmit({
        name: name.trim(),
        description: description.trim(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        tagIds,
        createGithubIssue: !initial && canCreateGithubIssue ? createGithubIssue : undefined,
      })
      const newId =
        result && typeof result === 'object' && 'id' in result && result.id
          ? String(result.id)
          : null
      if (newId) onCreated?.(newId)

      if (!initial && opts?.addAnother) {
        resetFormForAnother()
        return
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    if (saving) return
    onClose()
  }

  // Ctrl/Cmd+S save while modal is open (closes after save)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!isModKey(e)) return
      if (e.key.toLowerCase() !== 's') return
      e.preventDefault()
      void save()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

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
                disabled={saving || deleteBusy}
                onClick={() => setDeleteOpen(true)}
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={cancel} disabled={saving || enhancing}>
              Cancel
            </Button>
            {!initial ? (
              <Button
                variant="secondary"
                disabled={saving || enhancing || !name.trim()}
                onClick={() => void save({ addAnother: true })}
                title="Save this task and keep the form open for another"
              >
                Save & add another
              </Button>
            ) : null}
            <Button
              disabled={saving || enhancing || !name.trim()}
              onClick={() => void save()}
              title={`${TASK_SHORTCUTS.saveModal.description} (${TASK_SHORTCUTS.saveModal.combo()})`}
              aria-keyshortcuts="Control+S Meta+S"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="task-name" error={error ?? undefined}>
          <div className="quick-add">
            <input
              id="task-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What needs doing?"
              autoFocus
              disabled={saving || enhancing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void save() // default: save and close
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancel()
                }
              }}
            />
            <div className="quick-side">
              {onEnhance ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="AI enhance title, description, and tags"
                  disabled={saving || enhancing || (!name.trim() && !description.trim())}
                  onClick={() => {
                    void (async () => {
                      setEnhancing(true)
                      setError(null)
                      try {
                        const res = await onEnhance({
                          name,
                          description,
                          tagIds,
                        })
                        setName(res.name)
                        setDescription(res.description)
                        setTagIds(res.tagIds)
                        if (res.endDate !== undefined && res.endDate) {
                          setEndDate(res.endDate.slice(0, 10))
                        }
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Enhance failed')
                      } finally {
                        setEnhancing(false)
                      }
                    })()
                  }}
                >
                  <Icons.Sparkles />
                </button>
              ) : null}
              {!initial && onImportFromGithub ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="Create task from a GitHub issue"
                  disabled={saving || enhancing}
                  onClick={() => {
                    onClose()
                    onImportFromGithub()
                  }}
                >
                  <Icons.Github />
                </button>
              ) : null}
              <button
                type="button"
                className="icon-btn"
                title="Cancel"
                disabled={saving || enhancing}
                onClick={cancel}
              >
                <Icons.X />
              </button>
              <button
                type="button"
                className="icon-btn"
                title={`${TASK_SHORTCUTS.saveModal.description} (${TASK_SHORTCUTS.saveModal.combo()})`}
                aria-keyshortcuts="Control+S Meta+S Control+Enter Meta+Enter"
                disabled={saving || enhancing || !name.trim()}
                onClick={() => void save()}
              >
                <Icons.Save />
              </button>
            </div>
          </div>
          {onEnhance ? (
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {enhancing
                ? 'Enhancing with AI…'
                : 'Sparkles: improve title, description, and suggest tags from project context.'}
            </p>
          ) : null}
        </Field>
        {!initial && canCreateGithubIssue ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={createGithubIssue}
              onChange={(e) => setCreateGithubIssue(e.target.checked)}
              disabled={saving}
            />
            <span>
              Create GitHub issue
              <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                Opens a new issue on{' '}
                <strong className="text-[var(--color-text)]">
                  {githubRepoLabel ?? 'the linked repository'}
                </strong>{' '}
                and links it to this task
              </span>
            </span>
          </label>
        ) : null}

        <Field label="Description (Markdown)" htmlFor="task-desc">
          <div className="mb-1.5 flex justify-end">
            <MarkdownHelp />
          </div>
          <Textarea
            id="task-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details, checklists, links…"
            className="min-h-[140px]"
            disabled={saving}
          />
        </Field>
        <Field label="Due date" htmlFor="task-due">
          <Input
            id="task-due"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={saving}
          />
        </Field>
        <Field label="Tags">
          <div className="flex flex-wrap gap-2">
            {tags
              .filter((t) => !isGithubSystemTag(t.name))
              .map((tag) => {
                const active = tagIds.includes(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={cn('tag-chip', active && 'active')}
                    disabled={saving}
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
            {onCreateTag ? (
              <InlineTagAdd
                disabled={saving}
                onCreate={async (n) => {
                  const tag = await onCreateTag(n)
                  setTagIds((prev) => (prev.includes(tag.id) ? prev : [...prev, tag.id]))
                }}
              />
            ) : null}
          </div>
        </Field>
      </div>

      {initial && onDelete ? (
        <TaskDeleteConfirm
          open={deleteOpen}
          tasks={[initial]}
          githubByTask={
            githubConfig
              ? new Map([[initial.id, githubConfig]])
              : undefined
          }
          canCloseGithub={canCloseGithubIssues}
          busy={deleteBusy}
          onCancel={() => {
            if (!deleteBusy) setDeleteOpen(false)
          }}
          onConfirm={(mode: TaskDeleteMode) => {
            void (async () => {
              setDeleteBusy(true)
              setSaving(true)
              try {
                await onDelete({ closeGithubIssues: mode === 'close' })
                setDeleteOpen(false)
                onClose()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Delete failed')
              } finally {
                setDeleteBusy(false)
                setSaving(false)
              }
            })()
          }}
        />
      ) : null}
    </Modal>
  )
}
