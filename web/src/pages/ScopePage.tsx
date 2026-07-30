import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { useScope, useScopeShares } from '@/features/scopes/hooks'
import {
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useScopeTasks,
  useToggleTaskComplete,
  useUpdateTask,
  useCreateTag,
} from '@/features/tasks/hooks'
import { TaskBoard } from '@/features/tasks/components/TaskBoard'
import { TaskModal } from '@/features/tasks/components/TaskModal'
import { ShareModal } from '@/features/scopes/components/ShareModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { computeScopeAccess } from '@/lib/permissions'
import type { Task } from '@/lib/supabase/types'
import {
  closeIssueForTask,
  createIssueForTask,
  fetchScopeGitHubConfigs,
  fetchTaskGitHubConfigsForTasks,
  listGitHubMilestones,
  listGitHubProjects,
  listGitHubRepos,
  syncTaskWithGitHub,
  upsertScopeGitHubConfig,
} from '@/features/github/api'
import {
  computeGitHubCapabilities,
  mapTaskGitHubByTaskId,
  repoLabel,
} from '@/features/github/visibility'
import { setTaskTags } from '@/features/tasks/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Input'
import { copyToClipboard } from '@/lib/utils'
import { Icons } from '@/components/icons'

export function ScopePage() {
  const { scopeId } = useParams<{ scopeId: string }>()
  const { user, profile } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()

  const { data: scope, isLoading: scopeLoading, error: scopeError } = useScope(scopeId)
  const { data: shares = [] } = useScopeShares(scopeId)
  const { tasksQuery, tagsQuery, taskTagsQuery } = useScopeTasks(scopeId)

  const createTask = useCreateTask(scopeId!)
  const updateTask = useUpdateTask(scopeId!)
  const toggleComplete = useToggleTaskComplete(scopeId!)
  const deleteTask = useDeleteTask(scopeId!)
  const reorderTasks = useReorderTasks(scopeId!)
  const createTag = useCreateTag(scopeId!)

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [githubOpen, setGithubOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)

  const myShare = shares.find((s) => s.user_id === user?.id)
  const access = computeScopeAccess(scope, user?.id, myShare)

  const tasks = tasksQuery.data ?? []
  const tags = tagsQuery.data ?? []
  const taskTags = taskTagsQuery.data ?? []

  const selectedTagIds = useMemo(() => {
    if (!editingTask) return []
    return taskTags.filter((tt) => tt.task_id === editingTask.id).map((tt) => tt.tag_id)
  }, [editingTask, taskTags])

  const scopeGhConfigsQuery = useQuery({
    queryKey: ['scope-github-configs', scopeId],
    enabled: Boolean(scopeId && user?.id),
    queryFn: () => fetchScopeGitHubConfigs(scopeId!),
  })

  const ghCaps = useMemo(
    () =>
      computeGitHubCapabilities({
        profile,
        scopeOwnerId: scope?.owner_id,
        currentUserId: user?.id,
        configs: scopeGhConfigsQuery.data ?? [],
        canEditScope: access.canEdit,
        isOwner: access.isOwner,
      }),
    [profile, scope?.owner_id, user?.id, scopeGhConfigsQuery.data, access.canEdit, access.isOwner],
  )

  const binding = ghCaps.binding
  /** Current user's own row (for editing defaults when they configure). */
  const myScopeConfig = useMemo(
    () => (scopeGhConfigsQuery.data ?? []).find((c) => c.user_id === user?.id) ?? null,
    [scopeGhConfigsQuery.data, user?.id],
  )

  const taskGhQuery = useQuery({
    queryKey: ['task-github', scopeId, tasks.map((t) => t.id).join(',')],
    enabled: Boolean(scopeId && user?.id && tasks.length && ghCaps.canSee),
    queryFn: () => fetchTaskGitHubConfigsForTasks(tasks.map((t) => t.id)),
  })

  const githubByTask = useMemo(
    () => mapTaskGitHubByTaskId(taskGhQuery.data ?? [], user?.id),
    [taskGhQuery.data, user?.id],
  )

  const reposQuery = useQuery({
    queryKey: ['github-repos'],
    enabled: githubOpen && ghCaps.canConfigure,
    queryFn: () => listGitHubRepos(),
    retry: false,
  })

  const repoOwner = binding?.github_repo_owner ?? myScopeConfig?.github_repo_owner ?? null
  const repoName = binding?.github_repo_name ?? myScopeConfig?.github_repo_name ?? null
  const displayRepo = repoLabel(binding) ?? repoLabel(myScopeConfig)

  const milestonesQuery = useQuery({
    queryKey: ['github-milestones', repoOwner, repoName],
    enabled: Boolean(githubOpen && ghCaps.canConfigure && repoOwner && repoName),
    queryFn: () => listGitHubMilestones(repoOwner!, repoName!),
    retry: false,
  })

  const projectsQuery = useQuery({
    queryKey: ['github-projects', repoOwner],
    enabled: Boolean(githubOpen && ghCaps.canConfigure && repoOwner),
    queryFn: () => listGitHubProjects(repoOwner!, repoName || ''),
    retry: false,
  })

  const saveGhConfig = useMutation({
    mutationFn: (patch: Parameters<typeof upsertScopeGitHubConfig>[2]) =>
      upsertScopeGitHubConfig(scopeId!, user!.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scope-github-configs', scopeId] })
      qc.invalidateQueries({ queryKey: ['scope-github-flags'] })
      toast.push('GitHub settings saved', 'success')
    },
    onError: (e) => toast.push(e instanceof Error ? e.message : 'Save failed', 'error'),
  })

  // Shortcuts for add/search live in TaskBoard; keep page free of conflicts.

  if (scopeLoading || tasksQuery.isLoading) return <PageLoader />

  if (scopeError || !scope) {
    return (
      <div className="space-y-3">
        <p className="text-[var(--color-danger)]">
          {scopeError instanceof Error ? scopeError.message : 'Project not found or no access.'}
        </p>
        <Link to="/">
          <Button variant="secondary">Back to projects</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Link to="/" className="hover:underline">
              Projects
            </Link>
            <span>/</span>
            <span className="truncate">{scope.name}</span>
          </div>
          <h1 className="project-title text-2xl font-bold tracking-tight">{scope.name}</h1>
          {scope.description ? (
            <p className="mt-1 text-sm text-[var(--color-muted)]">{scope.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={async () => {
              const text = tasks
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.name}`)
                .join('\n')
              const ok = await copyToClipboard(text)
              toast.push(ok ? 'Tasks copied' : 'Copy failed', ok ? 'success' : 'error')
            }}
          >
            <Icons.Clipboard size={14} /> Copy list
          </Button>
          {access.canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Icons.Paste size={14} /> Import
            </Button>
          ) : null}
          {access.canManageShares ? (
            <Button variant="secondary" size="sm" onClick={() => setShareOpen(true)}>
              <Icons.Share size={14} /> Share
            </Button>
          ) : null}
          {ghCaps.canSee ? (
            <Button variant="secondary" size="sm" onClick={() => setGithubOpen(true)}>
              <Icons.Github size={14} /> GitHub
              {ghCaps.scopeIntegrated && displayRepo ? (
                <span className="ml-1 opacity-70">· linked</span>
              ) : null}
            </Button>
          ) : null}
        </div>
      </div>

      <TaskBoard
        tasks={tasks}
        tags={tags}
        taskTags={taskTags}
        githubByTask={githubByTask}
        canEdit={access.canEdit}
        githubVisible={ghCaps.canSee}
        githubEnabled={ghCaps.canMutate && ghCaps.scopeIntegrated}
        searchInputRef={searchRef}
        quickAddRef={quickAddRef}
        onToggleComplete={async (task, completed) => {
          try {
            await toggleComplete.mutateAsync({ taskId: task.id, completed })
            // Optional complete → close GitHub issue
            if (
              completed &&
              ghCaps.canMutate &&
              binding?.close_issue_on_complete &&
              githubByTask.get(task.id)?.github_issue_number &&
              githubByTask.get(task.id)?.github_issue_state !== 'closed'
            ) {
              try {
                await closeIssueForTask(task.id)
                await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
                toast.push('Task completed and GitHub issue closed', 'success')
              } catch (e) {
                toast.push(
                  e instanceof Error
                    ? `Task completed; failed to close issue: ${e.message}`
                    : 'Task completed; failed to close GitHub issue',
                  'error',
                )
              }
            }
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'Update failed', 'error')
          }
        }}
        onEdit={(task) => {
          setEditingTask(task)
          setTaskModalOpen(true)
        }}
        onDelete={async (task) => {
          try {
            await deleteTask.mutateAsync(task.id)
            toast.push('Task deleted', 'success')
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
          }
        }}
        onReorder={(ids) => {
          reorderTasks.mutate(ids, {
            onError: (e) =>
              toast.push(e instanceof Error ? e.message : 'Reorder failed', 'error'),
          })
        }}
        onQuickAdd={async (input) => {
          await createTask.mutateAsync({
            name: input.name,
            description: input.description,
            endDate: input.endDate,
            tagIds: input.tagIds,
          })
          toast.push('Task added', 'success')
        }}
        onOpenDetailedAdd={() => {
          setEditingTask(null)
          setTaskModalOpen(true)
        }}
        onSetTaskTags={async (taskId, tagIds) => {
          await setTaskTags(taskId, tagIds)
          await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
        }}
        onCreateTag={async (name) => {
          const tag = await createTag.mutateAsync(name)
          return tag
        }}
        onGithubAction={async (task, action) => {
          if (!ghCaps.canMutate || !ghCaps.scopeIntegrated) {
            toast.push('Enable GitHub in Settings and link a repo for this project first', 'error')
            return
          }
          try {
            if (action === 'create') {
              await createIssueForTask({
                taskId: task.id,
                title: task.name,
                body: task.description ?? undefined,
              })
              toast.push('GitHub issue created', 'success')
            } else {
              await syncTaskWithGitHub(task.id)
              toast.push('Synced with GitHub', 'success')
            }
            await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'GitHub action failed', 'error')
          }
        }}
      />

      <TaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        initial={editingTask}
        tags={tags}
        selectedTagIds={selectedTagIds}
        onSubmit={async (values) => {
          if (editingTask) {
            await updateTask.mutateAsync({
              id: editingTask.id,
              patch: {
                name: values.name,
                description: values.description || null,
                end_date: values.endDate,
              },
              tagIds: values.tagIds,
            })
            toast.push('Task updated', 'success')
          } else {
            await createTask.mutateAsync({
              name: values.name,
              description: values.description || null,
              endDate: values.endDate,
              tagIds: values.tagIds,
            })
            toast.push('Task created', 'success')
          }
        }}
        onDelete={
          editingTask
            ? async () => {
                await deleteTask.mutateAsync(editingTask.id)
                toast.push('Task deleted', 'success')
              }
            : undefined
        }
      />

      {access.canManageShares ? (
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} scopeId={scope.id} />
      ) : null}

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import tasks from list"
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)} disabled={importing}>
              Cancel
            </Button>
            <Button
              disabled={importing || !importText.trim()}
              onClick={async () => {
                const names = importText
                  .split(/\r?\n/)
                  .map((l) => l.replace(/^\s*[-*\[\]xX\d.)\s]+/, '').trim())
                  .filter(Boolean)
                if (!names.length) return
                setImporting(true)
                try {
                  for (const name of names) {
                    await createTask.mutateAsync({ name })
                  }
                  toast.push(`Imported ${names.length} task(s)`, 'success')
                  setImportText('')
                  setImportOpen(false)
                } catch (e) {
                  toast.push(e instanceof Error ? e.message : 'Import failed', 'error')
                } finally {
                  setImporting(false)
                }
              }}
            >
              {importing ? 'Importing…' : 'Import'}
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-[var(--color-muted)]">
          Paste one task per line. Leading bullets, numbers, or <code>[ ]</code> are stripped.
        </p>
        <textarea
          className="field-input min-h-[180px] font-mono text-sm"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={'Buy milk\nCall plumber\n- Fix fence'}
        />
      </Modal>

      <Modal open={githubOpen} onClose={() => setGithubOpen(false)} title="GitHub for this project" size="lg">
        <div className="space-y-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {ghCaps.scopeIntegrated && displayRepo ? (
                  <>
                    Linked:{' '}
                    <a
                      className="underline"
                      href={`https://github.com/${displayRepo}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {displayRepo}
                    </a>
                  </>
                ) : (
                  'No repository linked yet'
                )}
              </span>
              {saveGhConfig.isPending ? (
                <span className="text-xs text-[var(--color-muted)]">Saving…</span>
              ) : null}
            </div>
            {ghCaps.readOnly ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Read-only for you. Enable GitHub under Settings (and ensure you can edit this
                project) to create/sync issues.
              </p>
            ) : null}
          </div>

          {!ghCaps.preferenceOn ? (
            <p className="text-sm text-[var(--color-muted)]">
              {ghCaps.scopeIntegrated ? (
                <>
                  This project is linked to GitHub. Enable your personal GitHub integration under{' '}
                  <Link className="underline" to="/settings">
                    Settings
                  </Link>{' '}
                  to create, sync, or change the binding.
                </>
              ) : (
                <>
                  Enable GitHub integration and save a personal access token under{' '}
                  <Link className="underline" to="/settings">
                    Settings
                  </Link>{' '}
                  first.
                </>
              )}
            </p>
          ) : !ghCaps.canConfigure ? (
            <p className="text-sm text-[var(--color-muted)]">
              You can view this project’s GitHub link but need editor access to change it.
            </p>
          ) : (
            <>
              <p className="text-xs text-[var(--color-muted)]">
                One repository per project. Owner or editors can set the link; the owner’s binding
                wins if both exist.
              </p>

              <label className="flex items-start gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(
                    (myScopeConfig?.github_integration_enabled &&
                      myScopeConfig?.github_repo_owner &&
                      myScopeConfig?.github_repo_name) ||
                      (ghCaps.scopeIntegrated && !myScopeConfig),
                  )}
                  onChange={(e) => {
                    if (!e.target.checked) {
                      saveGhConfig.mutate({
                        github_integration_enabled: false,
                        github_repo_id: null,
                        github_repo_name: null,
                        github_repo_owner: null,
                      })
                    }
                    // Turning on: user picks a repo below (enables on select)
                  }}
                />
                <span>
                  Link this project to GitHub
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    Uncheck to clear <em>your</em> binding. Pick a repository below to enable.
                  </span>
                </span>
              </label>

              <Field label="Repository">
                {reposQuery.isLoading ? (
                  <p className="mt-1 text-sm text-[var(--color-muted)]">Loading repositories…</p>
                ) : null}
                {reposQuery.isError ? (
                  <p className="text-sm text-[var(--color-danger)]">
                    Could not list repos. Check your token in Settings.
                  </p>
                ) : null}
                <select
                  className="field-input mt-1"
                  disabled={reposQuery.isLoading || saveGhConfig.isPending}
                  value={
                    (myScopeConfig?.github_repo_owner && myScopeConfig?.github_repo_name
                      ? `${myScopeConfig.github_repo_owner}/${myScopeConfig.github_repo_name}`
                      : displayRepo) ?? ''
                  }
                  onChange={(e) => {
                    const full = e.target.value
                    if (!full) {
                      saveGhConfig.mutate({
                        github_integration_enabled: false,
                        github_repo_id: null,
                        github_repo_name: null,
                        github_repo_owner: null,
                      })
                      return
                    }
                    const [owner, name] = full.split('/')
                    const repo = reposQuery.data?.repositories.find(
                      (r) => r.owner === owner && r.name === name,
                    )
                    saveGhConfig.mutate({
                      github_integration_enabled: true,
                      github_repo_id: repo?.id ?? null,
                      github_repo_owner: owner ?? null,
                      github_repo_name: name ?? null,
                    })
                  }}
                >
                  <option value="">Select a repository…</option>
                  {(reposQuery.data?.repositories ?? []).map((r) => (
                    <option key={r.id} value={`${r.owner}/${r.name}`}>
                      {r.full_name}
                    </option>
                  ))}
                  {displayRepo &&
                  !(reposQuery.data?.repositories ?? []).some(
                    (r) => `${r.owner}/${r.name}` === displayRepo,
                  ) ? (
                    <option value={displayRepo}>{displayRepo} (current)</option>
                  ) : null}
                </select>
              </Field>
              {repoOwner && repoName ? (
                <>
                  <Field label="Default milestone">
                    <select
                      className="field-input mt-1"
                      disabled={saveGhConfig.isPending}
                      value={
                        myScopeConfig?.github_milestone_number ??
                        binding?.github_milestone_number ??
                        ''
                      }
                      onChange={(e) => {
                        const num = e.target.value ? Number(e.target.value) : null
                        const m = milestonesQuery.data?.milestones.find((x) => x.number === num)
                        saveGhConfig.mutate({
                          github_milestone_number: num,
                          github_milestone_title: m?.title ?? null,
                        })
                      }}
                    >
                      <option value="">None</option>
                      {(milestonesQuery.data?.milestones ?? []).map((m) => (
                        <option key={m.number} value={m.number}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="GitHub Project board (optional)">
                    <select
                      className="field-input mt-1"
                      disabled={saveGhConfig.isPending}
                      value={myScopeConfig?.github_project_id ?? binding?.github_project_id ?? ''}
                      onChange={(e) => {
                        const id = e.target.value || null
                        const p = projectsQuery.data?.projects.find((x) => x.id === id)
                        saveGhConfig.mutate({
                          github_project_id: id,
                          github_project_name: p?.title ?? null,
                        })
                      }}
                    >
                      <option value="">None</option>
                      {(projectsQuery.data?.projects ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={Boolean(
                        myScopeConfig?.close_issue_on_complete ??
                          binding?.close_issue_on_complete,
                      )}
                      onChange={(e) => {
                        saveGhConfig.mutate({ close_issue_on_complete: e.target.checked })
                      }}
                    />
                    <span>
                      When I complete a linked task, close the GitHub issue
                      <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                        Only applies when your integration is on and you complete the task.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
              <Field label="Sync label (optional)">
                <Input
                  defaultValue={
                    myScopeConfig?.github_label_name ?? binding?.github_label_name ?? ''
                  }
                  placeholder="projects-manager"
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    const prev =
                      myScopeConfig?.github_label_name ?? binding?.github_label_name ?? ''
                    if (v !== prev) {
                      saveGhConfig.mutate({ github_label_name: v || null })
                    }
                  }}
                />
              </Field>
              <p className="text-xs text-[var(--color-muted)]">
                Use the GitHub button on a task row to create or sync an issue for that task.
              </p>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
