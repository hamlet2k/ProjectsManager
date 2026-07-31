import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { Task, TaskGitHubConfig } from '@/lib/supabase/types'

export type TaskDeleteMode = 'unlink' | 'close'

export type TaskDeleteConfirmProps = {
  open: boolean
  tasks: Task[]
  githubByTask?: Map<string, TaskGitHubConfig>
  /** User can call GitHub close (preference + credentials + project linked). */
  canCloseGithub: boolean
  /** e.g. tag group title “#backend” or “Today” */
  groupTitle?: string | null
  busy?: boolean
  onCancel: () => void
  onConfirm: (mode: TaskDeleteMode) => void
}

export type GithubDeleteSummary = {
  total: number
  linked: number
  openLinked: number
  closedLinked: number
  unlinked: number
  openIssueLabels: string[]
}

export function summarizeGithubForDelete(
  tasks: Task[],
  githubByTask?: Map<string, TaskGitHubConfig>,
): GithubDeleteSummary {
  let linked = 0
  let openLinked = 0
  let closedLinked = 0
  const openIssueLabels: string[] = []

  for (const t of tasks) {
    const gh = githubByTask?.get(t.id)
    if (!gh?.github_issue_number) continue
    linked += 1
    const label =
      gh.github_repo_name != null
        ? `${gh.github_repo_name}#${gh.github_issue_number}`
        : `#${gh.github_issue_number}`
    if (gh.github_issue_state === 'closed') {
      closedLinked += 1
    } else {
      openLinked += 1
      if (openIssueLabels.length < 6) openIssueLabels.push(label)
    }
  }

  return {
    total: tasks.length,
    linked,
    openLinked,
    closedLinked,
    unlinked: tasks.length - linked,
    openIssueLabels,
  }
}

/**
 * Option C: never delete GitHub issues.
 * - Unlink & delete: drop app tasks; issues stay as-is
 * - Close open issues & delete: close open linked issues first, then delete tasks
 */
export function TaskDeleteConfirm({
  open,
  tasks,
  githubByTask,
  canCloseGithub,
  groupTitle = null,
  busy = false,
  onCancel,
  onConfirm,
}: TaskDeleteConfirmProps) {
  const primaryRef = useRef<HTMLButtonElement>(null)
  const [closingChoice, setClosingChoice] = useState<TaskDeleteMode | null>(null)

  const summary = useMemo(
    () => summarizeGithubForDelete(tasks, githubByTask),
    [tasks, githubByTask],
  )

  const isGroup = tasks.length > 1 || Boolean(groupTitle)
  const hasOpenLinks = summary.openLinked > 0
  const showCloseOption = hasOpenLinks && canCloseGithub

  useEffect(() => {
    if (!open) {
      setClosingChoice(null)
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    queueMicrotask(() => primaryRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, busy, onCancel])

  if (!open || tasks.length === 0) return null

  const title = isGroup
    ? groupTitle
      ? `Delete group ${groupTitle}?`
      : `Delete ${summary.total} tasks?`
    : 'Delete task?'

  const taskName = tasks[0]?.name
  const headline =
    isGroup
      ? `Permanently delete ${summary.total} task${summary.total === 1 ? '' : 's'}${
          groupTitle ? ` in ${groupTitle}` : ''
        }. This cannot be undone.`
      : `Delete “${taskName ?? 'this task'}”? This cannot be undone.`

  const choose = (mode: TaskDeleteMode) => {
    setClosingChoice(mode)
    onConfirm(mode)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-black/45"
        disabled={busy}
        onClick={() => !busy && onCancel()}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="task-delete-title"
        aria-describedby="task-delete-message"
        className={cn(
          'relative z-10 w-full max-w-md overflow-hidden',
          'border border-[var(--color-border-strong)] bg-[var(--color-surface)]',
          'rounded-t-[var(--radius-sketch)] sm:rounded-[var(--radius-sketch)]',
          'shadow-[0_10px_28px_rgba(15,23,42,0.18),var(--shadow-sketch)]',
        )}
      >
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <span
            className={cn(
              'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center',
              'rounded-[var(--radius-sketch-sm)] border border-[var(--color-border)]',
              'bg-[var(--color-surface-2)] text-[var(--color-text)]',
            )}
            aria-hidden
          >
            <Icons.Trash />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="task-delete-title" className="font-[family-name:var(--font-display)] text-lg font-bold">
              {title}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close"
          >
            <Icons.X />
          </Button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <p id="task-delete-message" className="text-[0.98rem] leading-relaxed">
            {headline}
          </p>

          {summary.linked > 0 ? (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
              <p className="font-medium">
                <Icons.Github className="mr-1 inline-block" />
                GitHub links
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[var(--color-muted)]">
                {summary.openLinked > 0 ? (
                  <li>
                    <strong className="text-[var(--color-text)]">{summary.openLinked}</strong> open
                    issue{summary.openLinked === 1 ? '' : 's'}
                    {summary.openIssueLabels.length
                      ? ` (${summary.openIssueLabels.join(', ')}${
                          summary.openLinked > summary.openIssueLabels.length ? '…' : ''
                        })`
                      : ''}
                  </li>
                ) : null}
                {summary.closedLinked > 0 ? (
                  <li>
                    <strong className="text-[var(--color-text)]">{summary.closedLinked}</strong>{' '}
                    already closed
                  </li>
                ) : null}
                {summary.unlinked > 0 && isGroup ? (
                  <li>
                    <strong className="text-[var(--color-text)]">{summary.unlinked}</strong> with no
                    GitHub link
                  </li>
                ) : null}
              </ul>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                GitHub issues are never deleted from the app — only unlinked, or optionally closed
                first.
              </p>
              {!canCloseGithub && hasOpenLinks ? (
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  You can’t close issues from here (GitHub actions unavailable). Delete will leave
                  them open on GitHub.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-4 py-3">
          {showCloseOption ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => choose('close')}
              title="Close open linked issues on GitHub, then delete the app tasks"
            >
              {busy && closingChoice === 'close'
                ? 'Working…'
                : isGroup
                  ? `Close ${summary.openLinked} open issue${summary.openLinked === 1 ? '' : 's'} & delete tasks`
                  : 'Close issue & delete task'}
            </Button>
          ) : null}
          <Button
            ref={primaryRef}
            variant={showCloseOption ? 'secondary' : 'danger'}
            disabled={busy}
            onClick={() => choose('unlink')}
            title="Delete app tasks only; leave GitHub issues as they are"
          >
            {busy && closingChoice === 'unlink'
              ? 'Deleting…'
              : summary.linked > 0
                ? isGroup
                  ? 'Delete tasks only (keep issues)'
                  : 'Unlink & delete task'
                : isGroup
                  ? `Delete ${summary.total} tasks`
                  : 'Delete task'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
