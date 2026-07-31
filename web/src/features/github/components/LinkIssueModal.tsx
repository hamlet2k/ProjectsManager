import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { listGitHubIssues, type GitHubIssueSummary } from '@/features/github/api'
import { cn } from '@/lib/utils'
import { Icons } from '@/components/icons'

type Mode = 'link' | 'import'

type Props = {
  open: boolean
  onClose: () => void
  mode: Mode
  owner: string
  repo: string
  /** For link mode — task already exists */
  taskName?: string
  onSelect: (issue: GitHubIssueSummary) => Promise<void>
}

export function LinkIssueModal({
  open,
  onClose,
  mode,
  owner,
  repo,
  taskName,
  onSelect,
}: Props) {
  const [q, setQ] = useState('')
  const [debounced, setDebounced] = useState('')
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open')
  const [busyNumber, setBusyNumber] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setDebounced('')
    setStateFilter('open')
    setBusyNumber(null)
    setError(null)
  }, [open])

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  const issuesQuery = useQuery({
    queryKey: ['github-issues', owner, repo, debounced, stateFilter, open],
    enabled: open && Boolean(owner && repo),
    queryFn: () =>
      listGitHubIssues({
        owner,
        repo,
        q: debounced || undefined,
        state: stateFilter,
      }),
    staleTime: 15_000,
  })

  const issues = issuesQuery.data?.issues ?? []

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'import' ? 'Import from GitHub' : 'Link existing issue'}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose} disabled={busyNumber != null}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          {mode === 'import' ? (
            <>
              Create a new task from an open issue in{' '}
              <strong className="text-[var(--color-text)]">
                {owner}/{repo}
              </strong>
              .
            </>
          ) : (
            <>
              Link{' '}
              {taskName ? (
                <>
                  “<strong className="text-[var(--color-text)]">{taskName}</strong>”{' '}
                </>
              ) : (
                'this task '
              )}
              to an issue in{' '}
              <strong className="text-[var(--color-text)]">
                {owner}/{repo}
              </strong>
              .
            </>
          )}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Search</span>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title keywords or #number…"
              autoFocus
              disabled={busyNumber != null}
            />
          </label>
          <label className="block text-sm sm:w-36">
            <span className="mb-1 block text-[var(--color-muted)]">State</span>
            <select
              className="field-input"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as 'open' | 'closed' | 'all')}
              disabled={busyNumber != null}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
        {issuesQuery.isLoading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading issues…</p>
        ) : null}
        {issuesQuery.isError ? (
          <p className="text-sm text-[var(--color-danger)]">
            {(issuesQuery.error as Error)?.message || 'Could not list issues'}
          </p>
        ) : null}

        <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-[var(--color-border)]">
          {issues.length === 0 && !issuesQuery.isLoading ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
              No issues found.
            </li>
          ) : null}
          {issues.map((issue) => (
            <li key={issue.id}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--color-surface-2)]',
                  busyNumber === issue.number && 'opacity-60',
                )}
                disabled={busyNumber != null}
                onClick={async () => {
                  setBusyNumber(issue.number)
                  setError(null)
                  try {
                    await onSelect(issue)
                    onClose()
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Failed')
                  } finally {
                    setBusyNumber(null)
                  }
                }}
              >
                <Icons.Github className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-[var(--color-text)]">
                    #{issue.number} {issue.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    {issue.state}
                    {issue.labels.length
                      ? ` · ${issue.labels.slice(0, 4).join(', ')}`
                      : ''}
                  </span>
                </span>
                {busyNumber === issue.number ? (
                  <span
                    className="mt-1 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
