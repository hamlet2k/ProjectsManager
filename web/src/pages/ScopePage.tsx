import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/AuthProvider'
import { useScope, useScopeShares, useUpdateScope } from '@/features/scopes/hooks'
import {
  useCreateTask,
  useDeleteTask,
  useReorderTasks,
  useScopeTasks,
  useToggleTaskComplete,
  useSetTasksCompleted,
  useUpdateTask,
  useCreateTag,
  useDeleteTag,
  useDeleteTasks,
  useAddTaskDependency,
  useRemoveTaskDependency,
} from '@/features/tasks/hooks'
import { TaskBoard } from '@/features/tasks/components/TaskBoard'
import { TaskModal } from '@/features/tasks/components/TaskModal'
import { ShareModal } from '@/features/scopes/components/ShareModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { computeScopeAccess } from '@/lib/permissions'
import type { Task } from '@/lib/supabase/types'
import {
  closeIssueForTask,
  createIssueForTask,
  disableScopeGitHubBinding,
  fetchScopeGitHubConfigs,
  fetchTaskGitHubConfigsForTasks,
  importIssueAsTask,
  linkIssueToTask,
  listGitHubMilestones,
  listGitHubProjects,
  listGitHubRepos,
  notifyGitHubBindingChange,
  syncTaskWithGitHub,
  upsertScopeGitHubConfig,
} from '@/features/github/api'
import { LinkIssueModal } from '@/features/github/components/LinkIssueModal'
import {
  computeGitHubCapabilities,
  getStoredRepoLabel,
  mapTaskGitHubByTaskId,
  repoLabel,
} from '@/features/github/visibility'
import { createTag as createTagApi, setTaskTags } from '@/features/tasks/api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Input'
import { Icons } from '@/components/icons'
import { TaskTransferModal } from '@/features/tasks/components/TaskTransferModal'
import { ScopeFormModal } from '@/features/scopes/components/ScopeFormModal'
import { VoiceHoldFab } from '@/features/assistant/VoiceHoldFab'
import type { TaskBoardViewApi } from '@/features/tasks/components/TaskBoard'
import { isGithubSystemTag } from '@/features/github/systemTag'
import { enhanceTaskDraft } from '@/features/assistant/api'

export function ScopePage() {
  const { scopeId } = useParams<{ scopeId: string }>()
  const { user, profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const { data: scope, isLoading: scopeLoading, error: scopeError } = useScope(scopeId)
  const { data: shares = [] } = useScopeShares(scopeId)
  const { tasksQuery, tagsQuery, taskTagsQuery, depsQuery } = useScopeTasks(scopeId)
  const addDep = useAddTaskDependency(scopeId!)
  const removeDep = useRemoveTaskDependency(scopeId!)
  const updateScope = useUpdateScope()

  const createTask = useCreateTask(scopeId!)
  const updateTask = useUpdateTask(scopeId!)
  const toggleComplete = useToggleTaskComplete(scopeId!)
  const setTasksCompleted = useSetTasksCompleted(scopeId!)
  const deleteTask = useDeleteTask(scopeId!)
  const deleteTasks = useDeleteTasks(scopeId!)
  const reorderTasks = useReorderTasks(scopeId!)
  const createTag = useCreateTag(scopeId!)
  const deleteTagMut = useDeleteTag(scopeId!)

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editProjectOpen, setEditProjectOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [githubOpen, setGithubOpen] = useState(false)
  const [ghDraft, setGhDraft] = useState<{
    linked: boolean
    repoFull: string
    milestone: string
    projectId: string
    label: string
    closeOnComplete: boolean
  } | null>(null)
  const [ghSaving, setGhSaving] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferMode, setTransferMode] = useState<'export' | 'import'>('export')
  const [transferTaskIds, setTransferTaskIds] = useState<string[] | null>(null)

  const [issuePicker, setIssuePicker] = useState<{
    mode: 'link' | 'import'
    taskId?: string
    taskName?: string
  } | null>(null)
  /** Choose create vs link for an unlinked task */
  const [ghChooseTask, setGhChooseTask] = useState<Task | null>(null)
  const [ghChooseBusy, setGhChooseBusy] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const quickAddRef = useRef<HTMLInputElement>(null)
  const taskBoardViewApiRef = useRef<TaskBoardViewApi | null>(null)
  /** Throttle soft GitHub sync on expand (parity with classic app, without spam). */
  const lastGhSyncAt = useRef<Map<string, number>>(new Map())

  const myShare = shares.find((s) => s.user_id === user?.id)
  const access = computeScopeAccess(scope, user?.id, myShare)

  const tasks = tasksQuery.data ?? []
  const tags = tagsQuery.data ?? []
  const taskTags = taskTagsQuery.data ?? []
  const dependencies = depsQuery.data ?? []

  const selectedTagIds = useMemo(() => {
    if (!editingTask) return []
    return taskTags.filter((tt) => tt.task_id === editingTask.id).map((tt) => tt.tag_id)
  }, [editingTask, taskTags])

  const tagNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tags) m.set(t.id, t.name)
    return m
  }, [tags])

  const tagsByTaskNames = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const tt of taskTags) {
      const name = tagNameById.get(tt.tag_id)
      if (!name) continue
      const list = m.get(tt.task_id) ?? []
      list.push(name)
      m.set(tt.task_id, list)
    }
    return m
  }, [taskTags, tagNameById])

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

  /**
   * Option C: never delete GitHub issues.
   * Optionally close open linked issues first (while task_github_configs still exist), then delete tasks.
   */
  const deleteTasksWithGithubOption = useCallback(
    async (list: Task[], closeGithubIssues: boolean) => {
      if (!list.length) return
      let closed = 0
      let closeFailed = 0
      if (closeGithubIssues && ghCaps.canMutate && ghCaps.scopeIntegrated) {
        for (const task of list) {
          const link = githubByTask.get(task.id)
          if (!link?.github_issue_number || link.github_issue_state === 'closed') continue
          try {
            await closeIssueForTask(task.id)
            closed += 1
          } catch {
            closeFailed += 1
          }
        }
      }
      const ids = list.map((t) => t.id)
      if (ids.length === 1) {
        await deleteTask.mutateAsync(ids[0]!)
      } else {
        await deleteTasks.mutateAsync(ids)
      }
      await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
      const parts: string[] = []
      parts.push(ids.length === 1 ? 'Task deleted' : `Deleted ${ids.length} tasks`)
      if (closed > 0) {
        parts.push(
          closed === 1 ? 'closed 1 GitHub issue' : `closed ${closed} GitHub issues`,
        )
      }
      if (closeFailed > 0) {
        parts.push(
          closeFailed === 1
            ? '1 issue failed to close (task still removed)'
            : `${closeFailed} issues failed to close (tasks still removed)`,
        )
      }
      toast.push(parts.join(' · '), closeFailed > 0 ? 'error' : 'success')
    },
    [
      ghCaps.canMutate,
      ghCaps.scopeIntegrated,
      githubByTask,
      deleteTask,
      deleteTasks,
      qc,
      scopeId,
      toast,
    ],
  )

  const reposQuery = useQuery({
    queryKey: ['github-repos'],
    enabled: githubOpen && ghCaps.canConfigure,
    queryFn: () => listGitHubRepos(),
    retry: false,
  })

  const displayRepo = repoLabel(binding) ?? repoLabel(myScopeConfig)
  const storedRepo = getStoredRepoLabel(
    scopeGhConfigsQuery.data ?? [],
    scope?.owner_id,
    user?.id,
  )

  // Draft for GitHub modal (not live-save)
  useEffect(() => {
    if (!githubOpen) {
      setGhDraft(null)
      return
    }
    setGhDraft((prev) => {
      if (prev) return prev
      const src = myScopeConfig ?? binding
      return {
        linked: Boolean(ghCaps.scopeIntegrated),
        repoFull: displayRepo || storedRepo || '',
        milestone:
          src?.github_milestone_number != null ? String(src.github_milestone_number) : '',
        projectId: src?.github_project_id ?? '',
        label: src?.github_label_name ?? '',
        closeOnComplete: (src?.close_issue_on_complete ?? true) !== false,
      }
    })
  }, [
    githubOpen,
    ghCaps.scopeIntegrated,
    displayRepo,
    storedRepo,
    myScopeConfig,
    binding,
  ])

  const draftRepoOwner = ghDraft?.repoFull ? ghDraft.repoFull.split('/')[0] : null
  const draftRepoName = ghDraft?.repoFull ? ghDraft.repoFull.split('/')[1] : null
  const repoOwner = draftRepoOwner || binding?.github_repo_owner || myScopeConfig?.github_repo_owner || null
  const repoName = draftRepoName || binding?.github_repo_name || myScopeConfig?.github_repo_name || null

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

  const ghDraftDirty = useMemo(() => {
    if (!ghDraft) return false
    const src = myScopeConfig ?? binding
    const baseline = {
      linked: Boolean(ghCaps.scopeIntegrated),
      repoFull: displayRepo || storedRepo || '',
      milestone:
        src?.github_milestone_number != null ? String(src.github_milestone_number) : '',
      projectId: src?.github_project_id ?? '',
      label: src?.github_label_name ?? '',
      closeOnComplete: (src?.close_issue_on_complete ?? true) !== false,
    }
    return (
      ghDraft.linked !== baseline.linked ||
      ghDraft.repoFull !== baseline.repoFull ||
      ghDraft.milestone !== baseline.milestone ||
      ghDraft.projectId !== baseline.projectId ||
      ghDraft.label !== baseline.label ||
      ghDraft.closeOnComplete !== baseline.closeOnComplete
    )
  }, [
    ghDraft,
    myScopeConfig,
    binding,
    ghCaps.scopeIntegrated,
    displayRepo,
    storedRepo,
  ])

  const closeGithubModal = useCallback(async () => {
    if (ghSaving) return
    if (ghDraftDirty) {
      const ok = await confirm({
        title: 'Discard unsaved GitHub settings?',
        message: 'You have unsaved changes. Close without saving?',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      })
      if (!ok) return
    }
    setGithubOpen(false)
    setGhDraft(null)
  }, [ghSaving, ghDraftDirty, confirm])

  const saveGithubDraft = useCallback(async () => {
    if (!ghDraft || !scopeId || !user?.id || !scope) return
    if (ghDraft.linked && !ghDraft.repoFull.trim()) {
      toast.push('Select a repository to link this project', 'error')
      return
    }

    const prevLinked = ghCaps.scopeIntegrated
    const prevRepo = displayRepo || storedRepo || null
    const nextRepo = ghDraft.linked ? ghDraft.repoFull.trim() : null
    const [owner, name] = nextRepo ? nextRepo.split('/') : [null, null]

    // Confirm disable
    if (prevLinked && !ghDraft.linked) {
      const ok = await confirm({
        title: 'Disable GitHub for this project?',
        message:
          'GitHub data stays in the app as read-only. Issue links are kept, but create/sync/close stop until you link a repository again. Other members will be notified.',
        confirmLabel: 'Disable for project',
        cancelLabel: 'Cancel',
        danger: true,
      })
      if (!ok) return
    }

    // Confirm repo change while linked (or switching to a different repo on re-enable)
    if (
      ghDraft.linked &&
      prevRepo &&
      nextRepo &&
      prevRepo !== nextRepo &&
      (prevLinked || prevRepo)
    ) {
      const ok = await confirm({
        title: 'Change linked repository?',
        message: `This project was linked to ${prevRepo}. Changing it to ${nextRepo} affects all members. Existing task↔issue links still point at the old repo until recreated. Other members will be notified.`,
        confirmLabel: 'Change repository',
        cancelLabel: 'Cancel',
        danger: true,
      })
      if (!ok) return
    }

    setGhSaving(true)
    try {
      if (!ghDraft.linked) {
        if (prevLinked) {
          await disableScopeGitHubBinding(scopeId)
          try {
            await notifyGitHubBindingChange(
              scopeId,
              'GitHub unlinked on a project',
              prevRepo
                ? `GitHub was disabled for “${scope.name}” (was ${prevRepo}).`
                : `GitHub was disabled for “${scope.name}”.`,
              { scope_id: scopeId, previous_repo: prevRepo, action: 'disable' },
            )
          } catch {
            /* non-fatal if notify RPC not migrated yet */
          }
          toast.push('GitHub disabled for this project (settings kept)', 'success')
        } else {
          toast.push('No changes to save', 'success')
        }
      } else {
        const repo = reposQuery.data?.repositories.find(
          (r) => r.owner === owner && r.name === name,
        )
        const milestoneNum = ghDraft.milestone ? Number(ghDraft.milestone) : null
        const milestone = milestonesQuery.data?.milestones.find(
          (m) => m.number === milestoneNum,
        )
        const project = projectsQuery.data?.projects.find((p) => p.id === ghDraft.projectId)

        await upsertScopeGitHubConfig(scopeId, user.id, {
          github_integration_enabled: true,
          github_repo_id: repo?.id ?? myScopeConfig?.github_repo_id ?? null,
          github_repo_owner: owner ?? null,
          github_repo_name: name ?? null,
          github_milestone_number: milestoneNum,
          github_milestone_title: milestone?.title ?? null,
          github_project_id: ghDraft.projectId || null,
          github_project_name: project?.title ?? null,
          github_label_name: ghDraft.label.trim() || null,
          close_issue_on_complete: ghDraft.closeOnComplete,
        })

        try {
          if (prevLinked && prevRepo && nextRepo && prevRepo !== nextRepo) {
            await notifyGitHubBindingChange(
              scopeId,
              'GitHub repository changed',
              `“${scope.name}” is now linked to ${nextRepo} (was ${prevRepo}).`,
              {
                scope_id: scopeId,
                previous_repo: prevRepo,
                new_repo: nextRepo,
                action: 'override',
              },
            )
          } else if (!prevLinked && nextRepo) {
            await notifyGitHubBindingChange(
              scopeId,
              'GitHub linked on a project',
              `“${scope.name}” is now linked to ${nextRepo}.`,
              { scope_id: scopeId, new_repo: nextRepo, action: 'link' },
            )
          }
        } catch {
          /* ignore notify failures */
        }

        toast.push(
          prevLinked && prevRepo === nextRepo
            ? 'GitHub settings saved'
            : prevLinked
              ? `Default repository set to ${nextRepo}`
              : `Project linked to ${nextRepo}`,
          'success',
        )
      }

      await qc.invalidateQueries({ queryKey: ['scope-github-configs', scopeId] })
      await qc.invalidateQueries({ queryKey: ['scope-github-flags'] })
      setGithubOpen(false)
      setGhDraft(null)
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not save GitHub settings', 'error')
    } finally {
      setGhSaving(false)
    }
  }, [
    ghDraft,
    scopeId,
    user?.id,
    scope,
    ghCaps.scopeIntegrated,
    displayRepo,
    storedRepo,
    confirm,
    toast,
    qc,
    reposQuery.data,
    milestonesQuery.data,
    projectsQuery.data,
    myScopeConfig,
  ])

  /** Board reveals (smooth scroll + flash) via focusTaskId */
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null)
  const scrollToTask = useCallback((taskId: string) => {
    // Clear first so re-focusing the same id still triggers the board effect
    setFocusTaskId(null)
    requestAnimationFrame(() => setFocusTaskId(taskId))
  }, [])

  // Soft background sync when opening details — LWW, once per 90s per task
  const onExpandTask = useCallback(
    (task: Task) => {
      if (!ghCaps.canMutate || !ghCaps.scopeIntegrated) return
      const link = githubByTask.get(task.id)
      if (!link?.github_issue_number) return
      const now = Date.now()
      const last = lastGhSyncAt.current.get(task.id) ?? 0
      if (now - last < 90_000) return
      lastGhSyncAt.current.set(task.id, now)
      void syncTaskWithGitHub(task.id)
        .then(() => {
          qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
          qc.invalidateQueries({ queryKey: ['task-deps', scopeId] })
        })
        .then(() => qc.invalidateQueries({ queryKey: ['tasks', scopeId] }))
        .then(() => qc.invalidateQueries({ queryKey: ['task-tags', scopeId] }))
        .then(() => qc.invalidateQueries({ queryKey: ['tags', scopeId] }))
        .then(() => scrollToTask(task.id))
        .catch(() => {
          /* silent — user can still tap Refresh */
        })
    },
    [ghCaps.canMutate, ghCaps.scopeIntegrated, githubByTask, qc, scopeId, scrollToTask],
  )

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
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="project-title truncate text-2xl font-bold tracking-tight">
              {scope.name}
            </h1>
            {access.isOwner ? (
              <button
                type="button"
                className="icon-btn shrink-0"
                title="Edit project name and description"
                onClick={() => setEditProjectOpen(true)}
              >
                <Icons.Edit size="0.9em" />
              </button>
            ) : null}
          </div>
          {scope.description ? (
            <p className="mt-1 text-sm text-[var(--color-muted)]">{scope.description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            title="Import or export tasks (formats, AI backlog, copy/download)"
            onClick={() => {
              setTransferTaskIds(null)
              setTransferMode('export')
              setTransferOpen(true)
            }}
          >
            <Icons.Clipboard size={14} /> Import / Export
          </Button>
          {access.canManageShares ? (
            <Button
              variant="secondary"
              size="sm"
              className={
                shares.filter((s) => s.status === 'accepted').length > 0 ? 'btn-pressed' : undefined
              }
              title={
                shares.filter((s) => s.status === 'accepted').length > 0
                  ? `Shared with ${shares.filter((s) => s.status === 'accepted').length} member(s) — click to manage`
                  : 'Share this project'
              }
              onClick={() => setShareOpen(true)}
            >
              <Icons.Share size={14} /> Share
            </Button>
          ) : null}
          {ghCaps.canSee ? (
            <Button
              variant="secondary"
              size="sm"
              className={ghCaps.scopeIntegrated ? 'btn-pressed' : undefined}
              title={
                displayRepo
                  ? `Default for new tasks: ${displayRepo}`
                  : 'Configure GitHub for this project'
              }
              onClick={() => setGithubOpen(true)}
            >
              <Icons.Github size={14} /> GitHub
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
        defaultGithubRepo={displayRepo}
        searchInputRef={searchRef}
        quickAddRef={quickAddRef}
        viewApiRef={taskBoardViewApiRef}
        scopeId={scopeId}
        focusTaskId={focusTaskId}
        onFocusTaskHandled={() => setFocusTaskId(null)}
        onToggleComplete={async (task, completed) => {
          try {
            await toggleComplete.mutateAsync({ taskId: task.id, completed })
            // Complete → close only when project binding is ACTIVE and user can mutate.
            // Soft-disabled project (or preference off) must not call GitHub.
            const closeOnComplete = binding?.close_issue_on_complete !== false
            const link = githubByTask.get(task.id)
            if (
              completed &&
              ghCaps.scopeIntegrated &&
              ghCaps.canMutate &&
              closeOnComplete &&
              link?.github_issue_number &&
              link.github_issue_state !== 'closed'
            ) {
              try {
                await closeIssueForTask(task.id)
                await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
                toast.push(`Task completed · closed GitHub #${link.github_issue_number}`, 'success')
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
        onSetTasksCompleted={
          access.canEdit
            ? async (list, completed) => {
                const ids = list.map((t) => t.id)
                if (!ids.length) return
                await setTasksCompleted.mutateAsync({ ids, completed })
                let closed = 0
                let closeFailed = 0
                const closeOnComplete = binding?.close_issue_on_complete !== false
                if (
                  completed &&
                  closeOnComplete &&
                  ghCaps.scopeIntegrated &&
                  ghCaps.canMutate
                ) {
                  for (const task of list) {
                    const link = githubByTask.get(task.id)
                    if (
                      !link?.github_issue_number ||
                      link.github_issue_state === 'closed'
                    ) {
                      continue
                    }
                    try {
                      await closeIssueForTask(task.id)
                      closed += 1
                    } catch {
                      closeFailed += 1
                    }
                  }
                  if (closed > 0 || closeFailed > 0) {
                    await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
                  }
                }
                const parts: string[] = [
                  completed
                    ? ids.length === 1
                      ? 'Task completed'
                      : `Completed ${ids.length} tasks`
                    : ids.length === 1
                      ? 'Task marked incomplete'
                      : `Marked ${ids.length} tasks incomplete`,
                ]
                if (closed > 0) {
                  parts.push(
                    closed === 1
                      ? 'closed 1 GitHub issue'
                      : `closed ${closed} GitHub issues`,
                  )
                }
                if (closeFailed > 0) {
                  parts.push(
                    closeFailed === 1
                      ? '1 issue failed to close'
                      : `${closeFailed} issues failed to close`,
                  )
                }
                toast.push(parts.join(' · '), closeFailed > 0 ? 'error' : 'success')
              }
            : undefined
        }
        onEdit={(task) => {
          setEditingTask(task)
          setTaskModalOpen(true)
        }}
        canCloseGithubIssues={ghCaps.canMutate && ghCaps.scopeIntegrated}
        closeGithubOnComplete={binding?.close_issue_on_complete !== false}
        dependenciesEnabled={scope.dependencies_enabled !== false}
        advancedExportEnabled={scope.advanced_export_enabled !== false}
        onDelete={async (task, opts) => {
          try {
            await deleteTasksWithGithubOption([task], opts?.closeGithubIssues === true)
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
            throw e
          }
        }}
        onDeleteTasks={
          access.canEdit
            ? async (tasksToDelete, opts) => {
                await deleteTasksWithGithubOption(
                  tasksToDelete,
                  opts?.closeGithubIssues === true,
                )
              }
            : undefined
        }
        onReorder={(ids) => {
          reorderTasks.mutate(ids, {
            onError: (e) =>
              toast.push(e instanceof Error ? e.message : 'Reorder failed', 'error'),
          })
        }}
        onQuickAdd={async (input) => {
          const task = await createTask.mutateAsync({
            name: input.name,
            description: input.description,
            endDate: input.endDate,
            tagIds: input.tagIds,
          })
          if (
            input.createGithubIssue &&
            ghCaps.canMutate &&
            ghCaps.scopeIntegrated &&
            task?.id
          ) {
            try {
              const res = await createIssueForTask({
                taskId: task.id,
                title: task.name,
                body: task.description ?? undefined,
              })
              await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
              toast.push(
                res.project_added
                  ? 'Task added · GitHub issue created (on Project board)'
                  : 'Task added · GitHub issue created',
                'success',
              )
            } catch (e) {
              toast.push(
                e instanceof Error
                  ? `Task added, but GitHub issue failed: ${e.message}`
                  : 'Task added, but GitHub issue failed',
                'error',
              )
            }
            return task
          }
          toast.push('Task added', 'success')
          return task
        }}
        onEnhanceDraft={
          access.canEdit
            ? async (draft) => {
                const res = await enhanceTaskDraft({
                  scopeId: scopeId!,
                  projectName: scope.name,
                  projectPrompt: scope.assistant_prompt,
                  tags: tags.filter((t) => !isGithubSystemTag(t.name)).map((t) => t.name),
                  name: draft.name,
                  description: draft.description,
                  tagNames: draft.tagIds
                    .map((id) => tags.find((t) => t.id === id)?.name)
                    .filter((n): n is string => Boolean(n)),
                })
                const tagIds: string[] = []
                for (const raw of res.tag_names) {
                  const key = raw.toLowerCase()
                  let tag = tags.find((t) => t.name.toLowerCase() === key)
                  if (!tag) tag = await createTag.mutateAsync(raw)
                  if (!tagIds.includes(tag.id)) tagIds.push(tag.id)
                }
                return {
                  name: res.name,
                  description: res.description ?? '',
                  tagIds,
                  endDate: res.end_date,
                }
              }
            : undefined
        }
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
        onDeleteTag={async (tag) => {
          const usage = taskTags.filter((tt) => tt.tag_id === tag.id).length
          const ok = await confirm({
            title: 'Remove tag from project?',
            message:
              usage > 0
                ? `Delete #${tag.name}? It is on ${usage} task${usage === 1 ? '' : 's'} and will be removed from all of them.`
                : `Delete #${tag.name}? No tasks currently use this tag.`,
            confirmLabel: 'Delete tag',
            cancelLabel: 'Cancel',
            danger: true,
          })
          if (!ok) return
          try {
            await deleteTagMut.mutateAsync(tag.id)
            toast.push(`Tag #${tag.name} removed`, 'success')
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'Could not delete tag', 'error')
          }
        }}
        onGithubAction={async (task, action) => {
          if (!ghCaps.canMutate || !ghCaps.scopeIntegrated) {
            toast.push('Enable GitHub in Settings and link a repo for this project first', 'error')
            return
          }
          if (action === 'choose') {
            setGhChooseTask(task)
            return
          }
          if (action === 'link') {
            setIssuePicker({ mode: 'link', taskId: task.id, taskName: task.name })
            return
          }
          try {
            if (action === 'create') {
              const res = await createIssueForTask({
                taskId: task.id,
                title: task.name,
                body: task.description ?? undefined,
              })
              toast.push(
                res.project_added
                  ? 'GitHub issue created (also added to the Project board in settings)'
                  : 'GitHub issue created',
                'success',
              )
            } else {
              // Manual sync: last-write-wins (same as expand)
              const res = await syncTaskWithGitHub(task.id)
              toast.push(
                res?.mode === 'pull'
                  ? 'Synced from GitHub → app'
                  : res?.mode === 'push'
                    ? 'Synced from app → GitHub'
                    : 'Synced with GitHub',
                'success',
              )
            }
            await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
            await qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
            await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
            await qc.invalidateQueries({ queryKey: ['tags', scopeId] })
            await qc.invalidateQueries({ queryKey: ['task-deps', scopeId] })
            scrollToTask(task.id)
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'GitHub action failed', 'error')
          }
        }}
        onExpandTask={onExpandTask}
        onOpenGithubSettings={
          ghCaps.canConfigure ? () => setGithubOpen(true) : undefined
        }
        onOpenTransfer={(taskIds, mode = 'export') => {
          setTransferTaskIds(taskIds)
          setTransferMode(mode)
          setTransferOpen(true)
        }}
        onImportFromGithub={
          ghCaps.canMutate && ghCaps.scopeIntegrated && displayRepo
            ? () => setIssuePicker({ mode: 'import' })
            : undefined
        }
        dependencies={dependencies}
        onAddBlocker={
          access.canEdit
            ? async (blockedTaskId, blockerTaskId) => {
                await addDep.mutateAsync({ blockedTaskId, blockerTaskId })
              }
            : undefined
        }
        onRemoveBlocker={
          access.canEdit
            ? async (dep) => {
                await removeDep.mutateAsync({
                  id: dep.id,
                  blockedTaskId: dep.blocked_task_id,
                  blockerTaskId: dep.blocker_task_id,
                })
              }
            : undefined
        }
      />

      <TaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        initial={editingTask}
        scopeId={scopeId}
        tags={tags}
        selectedTagIds={selectedTagIds}
        onCreateTag={
          access.canEdit
            ? async (name) => {
                const tag = await createTag.mutateAsync(name)
                toast.push(`Tag #${tag.name} created`, 'success')
                return tag
              }
            : undefined
        }
        onImportFromGithub={
          !editingTask && ghCaps.canMutate && ghCaps.scopeIntegrated && displayRepo
            ? () => setIssuePicker({ mode: 'import' })
            : undefined
        }
        onEnhance={
          access.canEdit
            ? async (draft) => {
                const res = await enhanceTaskDraft({
                  scopeId: scopeId!,
                  projectName: scope.name,
                  projectPrompt: scope.assistant_prompt,
                  tags: tags.filter((t) => !isGithubSystemTag(t.name)).map((t) => t.name),
                  name: draft.name,
                  description: draft.description,
                  tagNames: draft.tagIds
                    .map((id) => tags.find((t) => t.id === id)?.name)
                    .filter((n): n is string => Boolean(n)),
                })
                const tagIds: string[] = []
                for (const raw of res.tag_names) {
                  const key = raw.toLowerCase()
                  let tag = tags.find((t) => t.name.toLowerCase() === key)
                  if (!tag) {
                    tag = await createTag.mutateAsync(raw)
                  }
                  if (!tagIds.includes(tag.id)) tagIds.push(tag.id)
                }
                return {
                  name: res.name,
                  description: res.description ?? '',
                  tagIds,
                  endDate: res.end_date,
                }
              }
            : undefined
        }
        onCreated={(id) => scrollToTask(id)}
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
            return
          }
          const task = await createTask.mutateAsync({
            name: values.name,
            description: values.description || null,
            endDate: values.endDate,
            tagIds: values.tagIds,
          })
          if (
            values.createGithubIssue &&
            ghCaps.canMutate &&
            ghCaps.scopeIntegrated &&
            task?.id
          ) {
            try {
              const res = await createIssueForTask({
                taskId: task.id,
                title: task.name,
                body: task.description ?? undefined,
              })
              await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
              toast.push(
                res.project_added
                  ? 'Task created · GitHub issue created (on Project board)'
                  : 'Task created · GitHub issue created',
                'success',
              )
            } catch (e) {
              toast.push(
                e instanceof Error
                  ? `Task created, but GitHub issue failed: ${e.message}`
                  : 'Task created, but GitHub issue failed',
                'error',
              )
            }
          } else {
            toast.push('Task created', 'success')
          }
          return task
        }}
        githubConfig={
          editingTask ? githubByTask.get(editingTask.id) ?? null : null
        }
        canCloseGithubIssues={ghCaps.canMutate && ghCaps.scopeIntegrated}
        canCreateGithubIssue={
          !editingTask && ghCaps.canMutate && ghCaps.scopeIntegrated
        }
        githubRepoLabel={displayRepo}
        onDelete={
          editingTask
            ? async (opts) => {
                await deleteTasksWithGithubOption(
                  [editingTask],
                  opts?.closeGithubIssues === true,
                )
              }
            : undefined
        }
      />

      {access.canManageShares ? (
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} scopeId={scope.id} />
      ) : null}

      <Modal
        open={Boolean(ghChooseTask)}
        onClose={() => !ghChooseBusy && setGhChooseTask(null)}
        title="GitHub for this task"
        size="md"
        footer={
          <Button
            variant="secondary"
            disabled={ghChooseBusy}
            onClick={() => setGhChooseTask(null)}
          >
            Cancel
          </Button>
        }
      >
        {ghChooseTask ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-muted)]">
              Task “<strong className="text-[var(--color-text)]">{ghChooseTask.name}</strong>” is
              not linked yet. Choose how to connect it to{' '}
              <strong className="text-[var(--color-text)]">{displayRepo ?? 'GitHub'}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                disabled={ghChooseBusy}
                onClick={async () => {
                  const task = ghChooseTask
                  setGhChooseBusy(true)
                  try {
                    const res = await createIssueForTask({
                      taskId: task.id,
                      title: task.name,
                      body: task.description ?? undefined,
                    })
                    toast.push(
                      res.project_added
                        ? 'GitHub issue created (also added to the Project board in settings)'
                        : 'GitHub issue created',
                      'success',
                    )
                    await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
                    await qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
                    await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
                    await qc.invalidateQueries({ queryKey: ['tags', scopeId] })
                    setGhChooseTask(null)
                    scrollToTask(task.id)
                  } catch (e) {
                    toast.push(e instanceof Error ? e.message : 'Create failed', 'error')
                  } finally {
                    setGhChooseBusy(false)
                  }
                }}
              >
                <Icons.Github size={14} /> Create new GitHub issue
              </Button>
              <Button
                variant="secondary"
                disabled={ghChooseBusy}
                onClick={() => {
                  const task = ghChooseTask
                  setGhChooseTask(null)
                  setIssuePicker({
                    mode: 'link',
                    taskId: task.id,
                    taskName: task.name,
                  })
                }}
              >
                <Icons.Link size={14} /> Link existing issue…
              </Button>
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              Optional: if this project’s GitHub settings name a <strong>Project board</strong>, new
              or linked issues are also added to that board on GitHub (Projects v2). You can leave
              the board empty — issue create/link still works without it.
            </p>
          </div>
        ) : null}
      </Modal>

      {issuePicker && displayRepo ? (
        <LinkIssueModal
          open={Boolean(issuePicker)}
          onClose={() => setIssuePicker(null)}
          mode={issuePicker.mode}
          owner={displayRepo.split('/')[0]!}
          repo={displayRepo.split('/')[1]!}
          taskName={issuePicker.taskName}
          onSelect={async (issue) => {
            if (issuePicker.mode === 'link' && issuePicker.taskId) {
              const res = await linkIssueToTask({
                taskId: issuePicker.taskId,
                issueNumber: issue.number,
              })
              toast.push(
                res.project_added
                  ? `Linked #${issue.number} (also added to Project board if configured)`
                  : `Linked issue #${issue.number}`,
                'success',
              )
              await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
              await qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
              await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
              await qc.invalidateQueries({ queryKey: ['tags', scopeId] })
              scrollToTask(issuePicker.taskId)
              return
            }
            if (issuePicker.mode === 'import') {
              const res = await importIssueAsTask({
                scopeId: scopeId!,
                issueNumber: issue.number,
              })
              toast.push(
                res.project_added
                  ? `Imported #${issue.number} as task (also on Project board if configured)`
                  : `Imported issue #${issue.number} as task`,
                'success',
              )
              await qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
              await qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
              await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
              await qc.invalidateQueries({ queryKey: ['tags', scopeId] })
              if (res.task?.id) scrollToTask(res.task.id)
            }
          }}
        />
      ) : null}

      {access.canEdit ? (
        <VoiceHoldFab
          scopeId={scopeId!}
          projectName={scope.name}
          tasks={tasks}
          tags={tags}
          tagsByTask={tagsByTaskNames}
          canEdit={access.canEdit}
          projectPrompt={scope.assistant_prompt}
          createTask={async (input) => {
            const task = await createTask.mutateAsync({
              name: input.name,
              description: input.description,
              endDate: input.endDate,
              tagIds: input.tagIds,
            })
            return task
          }}
          createTag={async (name) => createTag.mutateAsync(name)}
          setCompleted={async (taskId, completed) => {
            await toggleComplete.mutateAsync({ taskId, completed })
          }}
          setTaskTags={async (taskId, tagIds) => {
            await setTaskTags(taskId, tagIds)
            await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
            await qc.invalidateQueries({ queryKey: ['tags', scopeId] })
          }}
          updateTask={async (input) => {
            const task = await updateTask.mutateAsync({
              id: input.id,
              patch: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
                ...(input.endDate !== undefined ? { end_date: input.endDate } : {}),
              },
            })
            return task
          }}
          applyView={(patch) => taskBoardViewApiRef.current?.applyView(patch) ?? ['Board not ready']}
          onFocusTask={(id) => scrollToTask(id)}
          onDone={(result, meta) => {
            void qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
            void qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
            void qc.invalidateQueries({ queryKey: ['tags', scopeId] })
            // Follow-ups stay in the floating panel (history + chips) — no toast
            if (meta?.followUp || !result) return
            if (result.summaryLines.length) {
              toast.push(
                result.summaryLines.join(' · '),
                result.errors.length ? 'error' : 'success',
              )
            } else if (result.errors.length) {
              toast.push(result.errors.join(' · '), 'error')
            }
          }}
        />
      ) : null}

      <ScopeFormModal
        open={editProjectOpen}
        initial={scope}
        existingTagNames={tags.filter((t) => !isGithubSystemTag(t.name)).map((t) => t.name)}
        onClose={() => setEditProjectOpen(false)}
        onSubmit={async (values) => {
          await updateScope.mutateAsync({
            id: scope.id,
            name: values.name,
            description: values.description || null,
            dependencies_enabled: values.dependenciesEnabled,
            advanced_export_enabled: values.advancedExportEnabled,
            assistant_prompt: values.assistantPrompt || null,
          })
          toast.push('Project updated', 'success')
          await qc.invalidateQueries({ queryKey: ['scope', scopeId] })
          await qc.invalidateQueries({ queryKey: ['scopes'] })
        }}
      />

      <TaskTransferModal
        open={transferOpen}
        onClose={() => {
          setTransferOpen(false)
          setTransferTaskIds(null)
        }}
        mode={transferMode}
        projectName={scope.name}
        tasks={tasks}
        tags={tags}
        taskTags={taskTags}
        githubByTask={githubByTask}
        canImport={access.canEdit}
        initialTaskIds={transferTaskIds}
        githubRepoLabel={displayRepo}
        projectVoicePrompt={scope.assistant_prompt}
        scopeId={scopeId}
        existingTagNames={tags.filter((t) => !isGithubSystemTag(t.name)).map((t) => t.name)}
        onImportFromGithub={
          ghCaps.canMutate && ghCaps.scopeIntegrated && displayRepo
            ? () => setIssuePicker({ mode: 'import' })
            : undefined
        }
        onImport={async (parsed) => {
          const tagCache = new Map<string, string>(tags.map((t) => [t.name.toLowerCase(), t.id]))
          for (const item of parsed) {
            const tagIds: string[] = []
            for (const raw of item.tagNames ?? []) {
              const key = raw.toLowerCase()
              let id = tagCache.get(key)
              if (!id) {
                const created = await createTagApi(scopeId!, raw)
                id = created.id
                tagCache.set(key, id)
              }
              tagIds.push(id)
            }
            await createTask.mutateAsync({
              name: item.name,
              description: item.description ?? null,
              endDate: item.endDate
                ? new Date(item.endDate.length === 10 ? `${item.endDate}T12:00:00` : item.endDate).toISOString()
                : null,
              tagIds: tagIds.length ? tagIds : undefined,
              completed: item.completed,
            })
          }
          await qc.invalidateQueries({ queryKey: ['tags', scopeId] })
          await qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
        }}
      />

      <Modal
        open={githubOpen}
        onClose={() => void closeGithubModal()}
        title="GitHub for this project"
        size="lg"
        footer={
          ghCaps.canConfigure ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={ghSaving}
                onClick={() => void closeGithubModal()}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={ghSaving || !ghDraft || !ghDraftDirty}
                onClick={() => void saveGithubDraft()}
              >
                {ghSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => void closeGithubModal()}>
              Close
            </Button>
          )
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {ghCaps.scopeIntegrated && displayRepo ? (
                  <>
                    Default for new tasks:{' '}
                    <a
                      className="underline"
                      href={`https://github.com/${displayRepo}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {displayRepo}
                    </a>
                  </>
                ) : storedRepo ? (
                  <>
                    Previous repository (not linked):{' '}
                    <span className="text-[var(--color-text)]">{storedRepo}</span>
                  </>
                ) : (
                  'No default repository (new create/link is off)'
                )}
              </span>
              {ghDraftDirty ? (
                <span className="text-xs font-medium text-[var(--color-warning,var(--color-muted))]">
                  Unsaved changes
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Changes apply only when you click <strong>Save changes</strong>. Existing task↔issue
              links keep their original repo (color-coded on the list).
            </p>
            {ghCaps.readOnly ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Read-only for you. Enable GitHub under Settings (and ensure you can edit this
                project) to create/sync issues.
              </p>
            ) : null}
            {!ghCaps.scopeIntegrated &&
            [...githubByTask.values()].some((c) => c.github_issue_number) ? (
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Project GitHub is off, but some tasks still have issue links (read-only). Completing a
                task will not close those issues until you link a default repo again.
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
          ) : ghDraft ? (
            <>
              <p className="text-xs text-[var(--color-muted)]">
                One repository per project. Owner or editors can set the link; the owner’s binding
                wins if both exist. Uncheck soft-disables the link (repo fields kept for re-enable).
              </p>

              <label className="flex items-start gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={ghDraft.linked}
                  disabled={ghSaving}
                  onChange={(e) => {
                    const linked = e.target.checked
                    setGhDraft((d) => {
                      if (!d) return d
                      // Re-enable with previous repo when available — no forced re-pick
                      const repoFull =
                        d.repoFull || displayRepo || storedRepo || ''
                      return { ...d, linked, repoFull }
                    })
                  }}
                />
                <span>
                  Link this project to GitHub
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    {ghDraft.linked
                      ? ghDraft.repoFull
                        ? `Will use ${ghDraft.repoFull} as the default for new issues.`
                        : 'Pick a repository below, then save.'
                      : storedRepo || displayRepo
                        ? `Previously linked to ${storedRepo || displayRepo}. Re-check and save to restore.`
                        : 'Check this, pick a repository, then save.'}
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
                  disabled={reposQuery.isLoading || ghSaving || !ghDraft.linked}
                  value={ghDraft.repoFull}
                  onChange={(e) => {
                    const full = e.target.value
                    setGhDraft((d) =>
                      d
                        ? {
                            ...d,
                            repoFull: full,
                            // Reset milestone/project when repo changes (ids may not apply)
                            milestone: full === d.repoFull ? d.milestone : '',
                            projectId: full === d.repoFull ? d.projectId : '',
                          }
                        : d,
                    )
                  }}
                >
                  <option value="">Select a repository…</option>
                  {(reposQuery.data?.repositories ?? []).map((r) => (
                    <option key={r.id} value={`${r.owner}/${r.name}`}>
                      {r.full_name}
                    </option>
                  ))}
                  {ghDraft.repoFull &&
                  !(reposQuery.data?.repositories ?? []).some(
                    (r) => `${r.owner}/${r.name}` === ghDraft.repoFull,
                  ) ? (
                    <option value={ghDraft.repoFull}>{ghDraft.repoFull} (saved)</option>
                  ) : null}
                </select>
                {!ghDraft.linked ? (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Enable the link above to change the default repository.
                  </p>
                ) : null}
              </Field>
              {ghDraft.linked && draftRepoOwner && draftRepoName ? (
                <>
                  <Field label="Default milestone">
                    <select
                      className="field-input mt-1"
                      disabled={ghSaving}
                      value={ghDraft.milestone}
                      onChange={(e) =>
                        setGhDraft((d) => (d ? { ...d, milestone: e.target.value } : d))
                      }
                    >
                      <option value="">None</option>
                      {(milestonesQuery.data?.milestones ?? []).map((m) => (
                        <option key={m.number} value={String(m.number)}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="GitHub Project board (optional)">
                    <select
                      className="field-input mt-1"
                      disabled={ghSaving}
                      value={ghDraft.projectId}
                      onChange={(e) =>
                        setGhDraft((d) => (d ? { ...d, projectId: e.target.value } : d))
                      }
                    >
                      <option value="">None — do not add issues to a board</option>
                      {(projectsQuery.data?.projects ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      This is a <strong>GitHub Projects</strong> board (the kanban/table on GitHub),
                      not this app’s project. When set, newly <em>created</em>, <em>linked</em>, or{' '}
                      <em>imported</em> issues are also added to that board. Leave empty if you only
                      want Issues without board automation. Needs a PAT with Projects access.
                    </p>
                  </Field>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      disabled={ghSaving}
                      checked={ghDraft.closeOnComplete}
                      onChange={(e) =>
                        setGhDraft((d) =>
                          d ? { ...d, closeOnComplete: e.target.checked } : d,
                        )
                      }
                    />
                    <span>
                      When I complete a linked task, close the GitHub issue
                      <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                        On by default. Uses your PAT under Settings.
                      </span>
                    </span>
                  </label>
                </>
              ) : null}
              <Field label="Sync label (optional)">
                <Input
                  value={ghDraft.label}
                  disabled={ghSaving || !ghDraft.linked}
                  placeholder="projects-manager"
                  onChange={(e) =>
                    setGhDraft((d) => (d ? { ...d, label: e.target.value } : d))
                  }
                />
              </Field>
              <p className="text-xs text-[var(--color-muted)]">
                Use the GitHub button on a task row to create or sync an issue for that task.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">Loading settings…</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
