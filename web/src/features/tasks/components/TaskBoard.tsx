import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Tag, Task, TaskDependency, TaskGitHubConfig, TaskTag } from '@/lib/supabase/types'
import { isGithubSystemTag } from '@/features/github/systemTag'
import {
  repoAccentStyle,
  repoKey,
  summarizeLinkedRepos,
} from '@/features/github/repoAccent'
import { copyToClipboard, cn } from '@/lib/utils'
import {
  isModKey,
  isTypingTarget,
  TASK_SHORTCUTS,
} from '@/lib/keyboardShortcuts'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Icons } from '@/components/icons'
import { Textarea } from '@/components/ui/Input'
import { MarkdownView } from '@/lib/markdown'
import { TaskDependenciesModal } from '@/features/tasks/components/TaskDependenciesModal'
import { InlineTagAdd } from '@/features/tasks/components/InlineTagAdd'
import { MarkdownHelp } from '@/components/ui/MarkdownHelp'
import {
  TaskDeleteConfirm,
  type TaskDeleteMode,
} from '@/features/tasks/components/TaskDeleteConfirm'
import {
  loadLastNewTaskTagIds,
  saveLastNewTaskTagIds,
} from '@/features/tasks/lastNewTaskTags'

export type SortMode = 'rank' | 'name' | 'due' | 'created' | 'tags'

export type QuickAddPayload = {
  name: string
  description?: string | null
  endDate?: string | null
  tagIds?: string[]
  /** When true and GitHub is enabled, create a linked issue after the task. */
  createGithubIssue?: boolean
}

type Props = {
  tasks: Task[]
  tags: Tag[]
  taskTags: TaskTag[]
  githubByTask: Map<string, TaskGitHubConfig>
  /** App-level blocked_by edges for this project */
  dependencies?: TaskDependency[]
  canEdit: boolean
  /** Show GitHub badges/chrome (preference ON or scope integrated). */
  githubVisible: boolean
  /** Create/sync/close actions allowed. */
  githubEnabled: boolean
  /** Active project default repo (`owner/name`) for new issues; null if none. */
  defaultGithubRepo?: string | null
  onToggleComplete: (task: Task, completed: boolean) => void
  /** Mark many tasks complete / incomplete (e.g. whole group). */
  onSetTasksCompleted?: (tasks: Task[], completed: boolean) => void | Promise<void>
  onEdit: (task: Task) => void
  onDelete: (task: Task, opts?: { closeGithubIssues?: boolean }) => void | Promise<void>
  /** Delete every task in a group (tag or due bucket). */
  onDeleteTasks?: (
    tasks: Task[],
    opts?: { closeGithubIssues?: boolean },
  ) => void | Promise<void>
  /** Can close linked GitHub issues (preference + PAT + project linked). */
  canCloseGithubIssues?: boolean
  /** Project option: completing a task closes its open GitHub issue when allowed. */
  closeGithubOnComplete?: boolean
  /**
   * Project feature: show dependency chrome (default true).
   * When false, hide pills, manage button, and dependency drawer section.
   */
  dependenciesEnabled?: boolean
  /**
   * Project feature: copy opens full export modal (default true).
   * When false, copy pastes simple checklist text immediately.
   */
  advancedExportEnabled?: boolean
  onReorder: (orderedIds: string[]) => void
  onQuickAdd: (input: QuickAddPayload) => Promise<void>
  onOpenDetailedAdd: () => void
  onSetTaskTags: (taskId: string, tagIds: string[]) => Promise<void>
  onCreateTag: (name: string) => Promise<Tag>
  /** Remove a tag from the project (cascades off all tasks). */
  onDeleteTag?: (tag: Tag) => Promise<void>
  onGithubAction: (
    task: Task,
    action: 'create' | 'sync' | 'link' | 'choose',
  ) => Promise<void>
  /** Soft GitHub refresh when details open (optional; parent throttles). */
  onExpandTask?: (task: Task) => void
  /** Open project GitHub settings (e.g. change default repo). */
  onOpenGithubSettings?: () => void
  /** Open import/export for a subset of tasks (e.g. tag group). */
  onOpenTransfer?: (taskIds: string[], mode?: 'export' | 'import') => void
  /** Import a GitHub issue as a new task (same as From GitHub). */
  onImportFromGithub?: () => void
  /** Mark task as blocked by another task (and sync GitHub if both linked). */
  onAddBlocker?: (blockedTaskId: string, blockerTaskId: string) => Promise<void>
  onRemoveBlocker?: (dep: TaskDependency) => Promise<void>
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  quickAddRef?: React.RefObject<HTMLInputElement | null>
  /**
   * Parent-driven “go to task” (import, link, GH create, etc.).
   * Board smooth-scrolls and flashes the row (same as new-task UX).
   */
  focusTaskId?: string | null
  onFocusTaskHandled?: () => void
}

type TaskGroup = {
  key: string
  title: string
  tagId: string | null
  tasks: Task[]
}

export function TaskBoard({
  tasks,
  tags,
  taskTags,
  githubByTask,
  dependencies = [],
  canEdit,
  githubVisible,
  githubEnabled,
  defaultGithubRepo = null,
  onToggleComplete,
  onSetTasksCompleted,
  onEdit,
  onDelete,
  onDeleteTasks,
  canCloseGithubIssues = false,
  closeGithubOnComplete = true,
  dependenciesEnabled = true,
  advancedExportEnabled = true,
  onReorder,
  onQuickAdd,
  onOpenDetailedAdd,
  onSetTaskTags,
  onCreateTag,
  onDeleteTag,
  onGithubAction,
  onExpandTask,
  onOpenGithubSettings,
  onOpenTransfer,
  onImportFromGithub,
  onAddBlocker,
  onRemoveBlocker,
  searchInputRef,
  quickAddRef,
  focusTaskId = null,
  onFocusTaskHandled,
}: Props) {
  const toast = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState(() => localStorage.getItem('pm-task-search') ?? '')
  const [sortBy, setSortBy] = useState<SortMode>(
    () => (localStorage.getItem('pm-task-sort') as SortMode) || 'rank',
  )
  const [showCompleted, setShowCompleted] = useState(
    () => localStorage.getItem('pm-show-completed') === 'true',
  )
  /** Filter tasks by linked issue repo (`owner/name`), null = all */
  const [githubRepoFilter, setGithubRepoFilter] = useState<string | null>(null)
  const [activeTagIds, setActiveTagIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('pm-active-tags') || '[]') as string[]
    } catch {
      return []
    }
  })

  // Sticky panels: visible open state + preferred state when returning to top
  const isMobile = useMediaQuery('(max-width: 767.98px)')
  const [filtersOpen, setFiltersOpen] = useState(() => !isMobile)
  const [addOpen, setAddOpen] = useState(() => !isMobile)
  /** User preference when at page top (survives scroll collapse). */
  const wantFiltersAtTop = useRef(!isMobile)
  const wantAddAtTop = useRef(!isMobile)
  const wasAtTop = useRef(true)
  // #4 Quick-add details accordion
  const [quickDetails, setQuickDetails] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickDescription, setQuickDescription] = useState('')
  const [quickEndDate, setQuickEndDate] = useState('')
  const [quickTagIds, setQuickTagIds] = useState<string[]>(() => loadLastNewTaskTagIds())
  const [savingQuick, setSavingQuick] = useState(false)
  /** Persist “also create GitHub issue” (default off; remember last choice). */
  const [createGithubOnAdd, setCreateGithubOnAdd] = useState(
    () => localStorage.getItem('pm-create-gh-on-add') === 'true',
  )

  useEffect(() => {
    localStorage.setItem('pm-create-gh-on-add', String(createGithubOnAdd))
  }, [createGithubOnAdd])

  const [tagEditTaskId, setTagEditTaskId] = useState<string | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [depsModal, setDepsModal] = useState<{
    task: Task
    tab: 'blocked_by' | 'blocks'
  } | null>(null)
  const [deletePending, setDeletePending] = useState<{
    tasks: Task[]
    groupTitle?: string | null
    /** Tag id to drop from active filters after successful group delete */
    clearTagId?: string | null
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  /** Temporary highlight after create / navigate / tag move */
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null)
  /** Bump to re-run CSS flash when the same task is revealed again */
  const [flashNonce, setFlashNonce] = useState(0)
  const flashClearTimer = useRef<number | null>(null)
  const knownTaskIds = useRef<Set<string> | null>(null)

  const localSearchRef = useRef<HTMLInputElement>(null)
  const localQuickRef = useRef<HTMLInputElement>(null)
  const searchRef = searchInputRef ?? localSearchRef
  const quickRef = quickAddRef ?? localQuickRef

  const openFilters = () => {
    wantFiltersAtTop.current = true
    setFiltersOpen(true)
  }
  const closeFilters = () => {
    wantFiltersAtTop.current = false
    setFiltersOpen(false)
  }
  const openAdd = () => {
    wantAddAtTop.current = true
    setAddOpen(true)
  }
  const closeAdd = () => {
    wantAddAtTop.current = false
    setAddOpen(false)
  }

  useEffect(() => {
    localStorage.setItem('pm-task-search', search)
  }, [search])
  useEffect(() => {
    localStorage.setItem('pm-task-sort', sortBy)
  }, [sortBy])
  useEffect(() => {
    localStorage.setItem('pm-show-completed', String(showCompleted))
  }, [showCompleted])
  useEffect(() => {
    localStorage.setItem('pm-active-tags', JSON.stringify(activeTagIds))
  }, [activeTagIds])

  /*
   * Scroll expand/collapse with hysteresis + cooldown.
   * Expanding panels grow document height; collapsing shrinks it and can
   * pull scrollY under a single threshold → infinite open/close thrash
   * (especially near the bottom of a short list). Use separate thresholds
   * and ignore scroll briefly after we change panel state.
   */
  const scrollLockUntil = useRef(0)
  useEffect(() => {
    // Collapse only after scrolling clearly away from the top
    const COLLAPSE_Y = 140
    // Expand only when truly back near the top
    const EXPAND_Y = 20
    const COOLDOWN_MS = 200

    const lock = () => {
      scrollLockUntil.current = performance.now() + COOLDOWN_MS
    }

    const onScroll = () => {
      if (performance.now() < scrollLockUntil.current) return

      const y = window.scrollY

      if (wasAtTop.current) {
        if (y >= COLLAPSE_Y) {
          wasAtTop.current = false
          // Auto-collapse UI only (keep want* for restore)
          setFiltersOpen(false)
          setAddOpen(false)
          lock()
        }
      } else if (y <= EXPAND_Y) {
        wasAtTop.current = true
        setFiltersOpen(wantFiltersAtTop.current)
        setAddOpen(wantAddAtTop.current)
        lock()
      }
    }

    wasAtTop.current = window.scrollY < COLLAPSE_Y
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const clearAllFilters = useCallback(() => {
    setSearch('')
    setActiveTagIds([])
    setSortBy('rank')
    setShowCompleted(false)
    setGithubRepoFilter(null)
    localStorage.setItem('pm-task-search', '')
    localStorage.setItem('pm-task-sort', 'rank')
    localStorage.setItem('pm-show-completed', 'false')
    localStorage.setItem('pm-active-tags', '[]')
  }, [])

  /**
   * Smooth-scroll to a task row and play the same flash as new-task create.
   * Optionally expands the row and ensures completed tasks are visible.
   */
  const revealTask = useCallback(
    (taskId: string, opts?: { expand?: boolean; delayMs?: number }) => {
      const target = tasks.find((t) => t.id === taskId)
      const unhidingCompleted = Boolean(target?.completed && !showCompleted)
      if (unhidingCompleted) {
        setShowCompleted(true)
      }
      if (opts?.expand) {
        setExpandedTaskId(taskId)
        setTagEditTaskId(null)
      }

      // Extra delay when the row may not exist yet (just re-enabled “show completed”, or tag regroup)
      const delayMs = opts?.delayMs ?? (unhidingCompleted ? 140 : 60)

      if (flashClearTimer.current != null) {
        window.clearTimeout(flashClearTimer.current)
        flashClearTimer.current = null
      }

      // Clear then re-set so CSS animation restarts when targeting the same row again
      setFlashTaskId(null)
      window.setTimeout(() => {
        setFlashTaskId(taskId)
        setFlashNonce((n) => n + 1)
        window.setTimeout(() => {
          document
            .getElementById(`task-row-${taskId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, delayMs)
        flashClearTimer.current = window.setTimeout(() => {
          setFlashTaskId(null)
          flashClearTimer.current = null
        }, 2200 + delayMs)
      }, 0)
    },
    [tasks, showCompleted],
  )

  // Scroll to + flash newly created tasks (quick-add or modal)
  useEffect(() => {
    const ids = new Set(tasks.map((t) => t.id))
    if (knownTaskIds.current == null) {
      knownTaskIds.current = ids
      return
    }
    const added = tasks.filter((t) => !knownTaskIds.current!.has(t.id))
    knownTaskIds.current = ids
    if (added.length === 0) return
    // Prefer the newest by created_at when several appear
    const newest = [...added].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0]!
    revealTask(newest.id, { delayMs: 50 })
  }, [tasks, revealTask])

  // Parent-requested focus (import, link issue, create from GH, …)
  useEffect(() => {
    if (!focusTaskId) return
    revealTask(focusTaskId, { delayMs: 80 })
    onFocusTaskHandled?.()
  }, [focusTaskId, revealTask, onFocusTaskHandled])

  const tagsByTask = useMemo(() => {
    const m = new Map<string, Tag[]>()
    const tagMap = new Map(tags.map((t) => [t.id, t]))
    for (const tt of taskTags) {
      const tag = tagMap.get(tt.tag_id)
      if (!tag) continue
      const list = m.get(tt.task_id) ?? []
      list.push(tag)
      m.set(tt.task_id, list)
    }
    return m
  }, [tags, taskTags])

  /** taskId → tasks that block it (app deps) */
  const blockersByTask = useMemo(() => {
    const m = new Map<string, { dep: TaskDependency; task: Task }[]>()
    const byId = new Map(tasks.map((t) => [t.id, t]))
    for (const d of dependencies) {
      const blocker = byId.get(d.blocker_task_id)
      if (!blocker) continue
      const list = m.get(d.blocked_task_id) ?? []
      list.push({ dep: d, task: blocker })
      m.set(d.blocked_task_id, list)
    }
    return m
  }, [dependencies, tasks])

  /** taskId → tasks this one blocks */
  const blockingByTask = useMemo(() => {
    const m = new Map<string, { dep: TaskDependency; task: Task }[]>()
    const byId = new Map(tasks.map((t) => [t.id, t]))
    for (const d of dependencies) {
      const blocked = byId.get(d.blocked_task_id)
      if (!blocked) continue
      const list = m.get(d.blocker_task_id) ?? []
      list.push({ dep: d, task: blocked })
      m.set(d.blocker_task_id, list)
    }
    return m
  }, [dependencies, tasks])

  /** User tags only — legacy #github system tag is hidden (no longer maintained). */
  const filterTags = useMemo(
    () => tags.filter((t) => !isGithubSystemTag(t.name)),
    [tags],
  )

  /** Virtual filter chips from linked issue repos (not DB tags). */
  const linkedRepoUsage = useMemo(
    () => (githubVisible ? summarizeLinkedRepos(githubByTask.values(), defaultGithubRepo) : []),
    [githubVisible, githubByTask, defaultGithubRepo],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const qDigits = q.replace(/^#/, '').replace(/\D/g, '')
    let list = tasks.filter((t) => {
      if (!showCompleted && t.completed) return false
      if (q) {
        const gh = githubVisible ? githubByTask.get(t.id) : undefined
        const issueStr = gh?.github_issue_number != null ? String(gh.github_issue_number) : ''
        const mile = (gh?.github_milestone_title ?? '').toLowerCase()
        const hay = `${t.name}\n${t.description ?? ''}\n#${issueStr}\n${issueStr}\n${mile}`.toLowerCase()
        const textMatch = hay.includes(q)
        const issueMatch =
          Boolean(qDigits) &&
          issueStr.length > 0 &&
          (issueStr === qDigits || issueStr.includes(qDigits) || q.includes(`#${issueStr}`))
        if (!textMatch && !issueMatch) return false
      }
      if (activeTagIds.length > 0) {
        const ids = new Set((tagsByTask.get(t.id) ?? []).map((x) => x.id))
        if (!activeTagIds.every((id) => ids.has(id))) return false
      }
      if (githubRepoFilter) {
        const gh = githubByTask.get(t.id)
        const key = repoKey(gh?.github_repo_owner, gh?.github_repo_name)
        if (key !== githubRepoFilter) return false
      }
      return true
    })

    list = [...list]
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name) || a.rank - b.rank)
    } else if (sortBy === 'due') {
      list.sort((a, b) => {
        const ad = a.end_date ? new Date(a.end_date).getTime() : Number.POSITIVE_INFINITY
        const bd = b.end_date ? new Date(b.end_date).getTime() : Number.POSITIVE_INFINITY
        return ad - bd || a.rank - b.rank
      })
    } else if (sortBy === 'created') {
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.rank - b.rank,
      )
    } else if (sortBy === 'tags') {
      // grouping handled separately; keep stable rank within group
      list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    } else {
      list.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    }
    return list
  }, [
    tasks,
    search,
    showCompleted,
    activeTagIds,
    tagsByTask,
    sortBy,
    githubVisible,
    githubByTask,
    githubRepoFilter,
  ])

  // Tag groups, due-date buckets (classic parity), or flat list
  const groups: TaskGroup[] = useMemo(() => {
    if (sortBy === 'due') {
      const buckets: { key: string; title: string; tasks: Task[] }[] = [
        { key: 'today', title: 'Today', tasks: [] },
        { key: 'tomorrow', title: 'Tomorrow', tasks: [] },
        { key: 'next_week', title: 'Next week', tasks: [] },
        { key: 'next_month', title: 'Next month', tasks: [] },
        { key: 'future', title: 'Future', tasks: [] },
        { key: 'without_due', title: 'Without due date', tasks: [] },
      ]
      const byKey = new Map(buckets.map((b) => [b.key, b]))
      for (const task of filtered) {
        const day = task.end_date?.slice(0, 10) ?? null
        if (!day) {
          byKey.get('without_due')!.tasks.push(task)
          continue
        }
        const delta = daysFromTodayLocal(day)
        // Overdue + today share "Today" (classic app parity)
        if (delta <= 0) byKey.get('today')!.tasks.push(task)
        else if (delta === 1) byKey.get('tomorrow')!.tasks.push(task)
        else if (delta <= 7) byKey.get('next_week')!.tasks.push(task)
        else if (delta <= 30) byKey.get('next_month')!.tasks.push(task)
        else byKey.get('future')!.tasks.push(task)
      }
      const result = buckets
        .filter((b) => b.tasks.length > 0)
        .map((b) => ({ key: b.key, title: b.title, tagId: null, tasks: b.tasks }))
      return result.length
        ? result
        : [{ key: 'empty', title: 'Tasks', tagId: null, tasks: [] }]
    }

    if (sortBy !== 'tags') {
      return [{ key: 'all', title: 'Tasks', tagId: null, tasks: filtered }]
    }

    const byTag = new Map<string, Task[]>()
    const untagged: Task[] = []

    // Prefer active tag filters as group order; else all scope tags (skip legacy #github)
    const tagOrder =
      activeTagIds.length > 0
        ? tags.filter((t) => activeTagIds.includes(t.id) && !isGithubSystemTag(t.name))
        : [...tags]
            .filter((t) => !isGithubSystemTag(t.name))
            .sort((a, b) => a.name.localeCompare(b.name))

    for (const tag of tagOrder) byTag.set(tag.id, [])

    for (const task of filtered) {
      const ttags = tagsByTask.get(task.id) ?? []
      if (ttags.length === 0) {
        untagged.push(task)
        continue
      }
      // Put task in first matching group only (classic-ish single membership for display)
      let placed = false
      for (const tag of tagOrder) {
        if (ttags.some((x) => x.id === tag.id)) {
          byTag.get(tag.id)!.push(task)
          placed = true
          break
        }
      }
      if (!placed) untagged.push(task)
    }

    const result: TaskGroup[] = []
    for (const tag of tagOrder) {
      const list = byTag.get(tag.id) ?? []
      if (list.length === 0) continue
      result.push({ key: tag.id, title: `#${tag.name}`, tagId: tag.id, tasks: list })
    }
    if (untagged.length > 0) {
      result.push({ key: 'untagged', title: 'Untagged', tagId: null, tasks: untagged })
    }
    if (result.length === 0) {
      result.push({ key: 'empty', title: 'Tasks', tagId: null, tasks: [] })
    }
    return result
  }, [filtered, sortBy, tags, tagsByTask, activeTagIds])

  const sensors = useSensors(
    // Slightly higher distance so clicks (complete / expand) don't start a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /** Flat Rank view: full-list drag (no search / tag filters). */
  const canDragRank =
    canEdit && sortBy === 'rank' && !search.trim() && activeTagIds.length === 0

  /**
   * Tags (groups): drag only within a single group.
   * Search off so we reorder the full group membership (completed still
   * follows show-completed, same as Rank with hidden completed).
   */
  const canDragInTagGroups = canEdit && sortBy === 'tags' && !search.trim()

  const canDrag = canDragRank || canDragInTagGroups

  const onDragEnd = (event: DragEndEvent) => {
    if (!canDrag) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)

    // --- Within-tag-group reorder (global rank, model B) ---
    if (canDragInTagGroups) {
      const group = groups.find((g) => g.tasks.some((t) => t.id === activeId))
      if (!group) return
      // No cross-group drops
      if (!group.tasks.some((t) => t.id === overId)) return

      const groupIds = group.tasks.map((t) => t.id)
      const oldIndex = groupIds.indexOf(activeId)
      const newIndex = groupIds.indexOf(overId)
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return

      const newGroupOrder = arrayMove(groupIds, oldIndex, newIndex)
      const groupSet = new Set(groupIds)

      // Full project order by current rank; replace group-member slots with newGroupOrder
      const global = tasks
        .slice()
        .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
        .map((t) => t.id)

      const queue = [...newGroupOrder]
      const result: string[] = []
      for (const id of global) {
        if (groupSet.has(id)) {
          const next = queue.shift()
          if (next) result.push(next)
        } else {
          result.push(id)
        }
      }
      // Any leftover (shouldn’t happen) append to preserve ids
      while (queue.length) result.push(queue.shift()!)

      onReorder(result)
      return
    }

    // --- Flat Rank reorder ---
    // Reorder within the currently visible ranked list, then append hidden tasks
    // (e.g. completed when "show completed" is off) preserving their relative order.
    const visibleIds = filtered.map((t) => t.id)
    const oldIndex = visibleIds.indexOf(activeId)
    const newIndex = visibleIds.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0) return
    const nextVisible = arrayMove(visibleIds, oldIndex, newIndex)
    const hiddenIds = tasks
      .slice()
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .map((t) => t.id)
      .filter((id) => !nextVisible.includes(id))
    onReorder([...nextVisible, ...hiddenIds])
  }

  const collapseFiltersIfMobile = () => {
    if (isMobile && filtersOpen) closeFilters()
  }

  const toggleTag = (id: string) => {
    setActiveTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    collapseFiltersIfMobile()
  }

  const resetQuick = (opts?: { keepTags?: boolean }) => {
    setQuickName('')
    setQuickDescription('')
    setQuickEndDate('')
    if (!opts?.keepTags) {
      // Restore remembered tags (valid for this project)
      setQuickTagIds(loadLastNewTaskTagIds(tags.map((t) => t.id)))
    }
    setQuickDetails(false)
  }

  // Drop remembered tags that no longer exist on this project
  useEffect(() => {
    const valid = new Set(tags.map((t) => t.id))
    setQuickTagIds((prev) => {
      const next = prev.filter((id) => valid.has(id))
      return next.length === prev.length ? prev : next
    })
  }, [tags])

  const submitQuick = async () => {
    const name = quickName.trim()
    if (!name) return
    setSavingQuick(true)
    try {
      saveLastNewTaskTagIds(quickTagIds)
      await onQuickAdd({
        name,
        description: quickDescription.trim() || null,
        endDate: quickEndDate ? new Date(quickEndDate).toISOString() : null,
        tagIds: quickTagIds,
        createGithubIssue: Boolean(githubEnabled && createGithubOnAdd),
      })
      // Keep last tags for the next task; clear the rest of the form
      resetQuick({ keepTags: true })
      quickRef.current?.focus()
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not add task', 'error')
    } finally {
      setSavingQuick(false)
    }
  }

  // Global / contextual shortcuts for the task board (see lib/keyboardShortcuts.ts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = isTypingTarget(target)
      const inSearch = target === searchRef.current
      const inQuick =
        target === quickRef.current ||
        Boolean(target?.closest?.('[data-quick-add-panel]'))

      // Esc: layered dismiss (modals handle their own Esc)
      if (e.key === 'Escape') {
        if (tagEditTaskId) {
          e.preventDefault()
          setTagEditTaskId(null)
          return
        }
        if (expandedTaskId) {
          e.preventDefault()
          setExpandedTaskId(null)
          return
        }
        if (inSearch && search) {
          e.preventDefault()
          setSearch('')
          return
        }
        if (inQuick && (quickName || quickDetails)) {
          e.preventDefault()
          resetQuick()
          return
        }
        return
      }

      if (!isModKey(e)) return

      // Ctrl/Cmd+Backspace — clear all filters
      if (e.key === 'Backspace') {
        if (typing && !inSearch) return
        e.preventDefault()
        clearAllFilters()
        openFilters()
        searchRef.current?.focus()
        return
      }

      // Ctrl/Cmd+↑ — focus quick-add
      if (e.key === 'ArrowUp') {
        if (typing && !inQuick && !inSearch) return
        e.preventDefault()
        openAdd()
        setQuickDetails(false)
        queueMicrotask(() => quickRef.current?.focus())
        return
      }

      // Ctrl/Cmd+↓ — quick-add details, or toggle expand first visible task
      if (e.key === 'ArrowDown') {
        if (document.activeElement === quickRef.current || inQuick) {
          e.preventDefault()
          setQuickDetails(true)
          return
        }
        if (!typing && filtered.length > 0) {
          e.preventDefault()
          const first = filtered[0]!
          const willExpand = expandedTaskId !== first.id
          if (willExpand) {
            setExpandedTaskId(first.id)
            onExpandTask?.(first)
          } else {
            setExpandedTaskId(null)
          }
          revealTask(first.id, { delayMs: 40 })
        }
        return
      }

      // Ctrl/Cmd+Enter — save quick-add
      if (e.key === 'Enter' && inQuick && canEdit) {
        if (!quickName.trim() || savingQuick) return
        e.preventDefault()
        void submitQuick()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [
    search,
    searchRef,
    quickRef,
    tagEditTaskId,
    expandedTaskId,
    quickName,
    quickDetails,
    clearAllFilters,
    filtered,
    onExpandTask,
    canEdit,
    savingQuick,
    revealTask,
  ])

  const stickySolid = filtersOpen || addOpen
  const showingPills = !filtersOpen || !addOpen
  const chromeMode =
    filtersOpen && addOpen ? 'panels' : showingPills && !stickySolid ? 'pills' : 'mixed'

  return (
    <div className="scope-task-layout space-y-4" data-chrome={chromeMode}>
      {/* Sticky header + floating pills */}
      <div
        className={cn(
          'sticky-task-chrome sticky z-20 -mx-1 px-1 py-2 transition-colors',
          stickySolid
            ? 'is-expanded bg-[var(--color-bg)]/95 backdrop-blur-md'
            : 'pointer-events-none bg-transparent',
        )}
      >
        {/* Floating pills when a panel is collapsed — elevated bubble style */}
        {showingPills ? (
          <div className="pointer-events-auto sticky-pill-bar mb-3 flex items-center justify-between gap-3">
            <div className="flex gap-3">
              {canEdit && !addOpen ? (
                <button
                  type="button"
                  className="sticky-pill sticky-pill-bubble"
                  title={`${TASK_SHORTCUTS.focusAdd.description} (${TASK_SHORTCUTS.focusAdd.combo()})`}
                  aria-keyshortcuts="Control+ArrowUp Meta+ArrowUp"
                  onClick={() => {
                    openAdd()
                    queueMicrotask(() => quickRef.current?.focus())
                  }}
                >
                  <Icons.Plus size="1.25em" />
                  <span>Add</span>
                </button>
              ) : (
                <span />
              )}
            </div>
            <div className="flex gap-3">
              {!filtersOpen ? (
                <button
                  type="button"
                  className="sticky-pill sticky-pill-bubble"
                  title="Filters"
                  onClick={() => openFilters()}
                >
                  <Icons.Filter size="1.2em" />
                  <span>Filters</span>
                  {activeTagIds.length > 0 ||
                  search ||
                  sortBy !== 'rank' ||
                  showCompleted ||
                  githubRepoFilter ? (
                    <span className="sticky-pill-dot" />
                  ) : null}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="pointer-events-auto space-y-3">
          {filtersOpen ? (
            <section className="notebook-panel floating-elevated space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">Filters</span>
                <div className="flex items-center gap-1">
                  {(search ||
                    activeTagIds.length > 0 ||
                    sortBy !== 'rank' ||
                    showCompleted ||
                    githubRepoFilter) && (
                    <button
                      type="button"
                      className="rounded-md px-2 py-1 text-xs font-medium text-[var(--color-muted)] underline decoration-wavy hover:text-[var(--color-text)]"
                      title={`${TASK_SHORTCUTS.clearAllFilters.description} (${TASK_SHORTCUTS.clearAllFilters.combo()})`}
                      aria-keyshortcuts="Control+Backspace Meta+Backspace"
                      onClick={() => clearAllFilters()}
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn !h-8 !w-8"
                    title="Collapse filters"
                    onClick={() => closeFilters()}
                  >
                    <Icons.X size="0.85em" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="block min-w-0 flex-1 text-sm">
                  <span className="mb-1 block font-medium text-[var(--color-muted)]">
                    Search tasks
                  </span>
                  <div className="field-input-wrap">
                    <input
                      ref={searchRef}
                      className="field-input !pr-9"
                      placeholder={
                        githubVisible
                          ? 'Search name, description, #issue…'
                          : 'Search by name or description'
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && search) {
                          e.preventDefault()
                          setSearch('')
                        }
                        if (e.key === 'Enter') {
                          collapseFiltersIfMobile()
                        }
                      }}
                    />
                    {search ? (
                      <button
                        type="button"
                        className="field-input-clear"
                        title={`${TASK_SHORTCUTS.clearSearch.description} (${TASK_SHORTCUTS.clearSearch.combo()})`}
                        onClick={() => {
                          setSearch('')
                          searchRef.current?.focus()
                        }}
                      >
                        <Icons.X size="0.85em" />
                      </button>
                    ) : null}
                  </div>
                </label>
                <label className="block w-full text-sm md:w-44">
                  <span className="mb-1 block font-medium text-[var(--color-muted)]">Sort by</span>
                  <select
                    className="field-input"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as SortMode)
                      collapseFiltersIfMobile()
                    }}
                  >
                    <option value="rank">Rank</option>
                    <option value="name">Name</option>
                    <option value="due">Due date (groups)</option>
                    <option value="created">Created</option>
                    <option value="tags">Tags (groups)</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-muted)]">
                  <input
                    type="checkbox"
                    className="h-4 w-8 accent-[var(--color-primary)]"
                    checked={showCompleted}
                    onChange={(e) => {
                      setShowCompleted(e.target.checked)
                      collapseFiltersIfMobile()
                    }}
                  />
                  Show completed
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    <Icons.Tag size="0.9em" />
                    <span>Tags</span>
                    {activeTagIds.length > 0 ? (
                      <button
                        type="button"
                        className="normal-case tracking-normal underline decoration-wavy"
                        onClick={() => setActiveTagIds([])}
                      >
                        Clear tags
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {filterTags.map((tag) => {
                      const active = activeTagIds.includes(tag.id)
                      const usage = taskTags.filter((tt) => tt.tag_id === tag.id).length
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          className={cn('tag-chip', active && 'active')}
                          onClick={() => toggleTag(tag.id)}
                          title={
                            canEdit && onDeleteTag
                              ? `Filter by #${tag.name} · trash removes it from the project${usage ? ` (${usage} task${usage === 1 ? '' : 's'})` : ''}`
                              : `Filter by #${tag.name}`
                          }
                        >
                          #{tag.name}
                          {canEdit && onDeleteTag ? (
                            <span
                              role="button"
                              tabIndex={0}
                              className="tag-chip-remove"
                              title={
                                usage > 0
                                  ? `Delete #${tag.name} from project (used on ${usage} task${usage === 1 ? '' : 's'})`
                                  : `Delete #${tag.name} from project`
                              }
                              onClick={(e) => {
                                e.stopPropagation()
                                void (async () => {
                                  await onDeleteTag(tag)
                                  setActiveTagIds((ids) => ids.filter((id) => id !== tag.id))
                                })()
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  void (async () => {
                                    await onDeleteTag(tag)
                                    setActiveTagIds((ids) => ids.filter((id) => id !== tag.id))
                                  })()
                                }
                              }}
                            >
                              <Icons.Trash size="0.7em" />
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                    {canEdit ? (
                      <InlineTagAdd
                        onCreate={async (name) => {
                          try {
                            const tag = await onCreateTag(name)
                            setActiveTagIds((ids) =>
                              ids.includes(tag.id) ? ids : [...ids, tag.id],
                            )
                            toast.push(`Tag #${tag.name} created`, 'success')
                          } catch (e) {
                            toast.push(
                              e instanceof Error ? e.message : 'Could not create tag',
                              'error',
                            )
                            throw e
                          }
                        }}
                      />
                    ) : filterTags.length === 0 ? (
                      <span className="text-sm text-[var(--color-muted)]">No tags yet.</span>
                    ) : null}
                  </div>
                </div>

                {githubVisible && linkedRepoUsage.length > 0 ? (
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                      <Icons.Github size="0.9em" />
                      <span>Repositories</span>
                      {githubRepoFilter ? (
                        <button
                          type="button"
                          className="normal-case tracking-normal underline decoration-wavy"
                          onClick={() => setGithubRepoFilter(null)}
                        >
                          Clear repo
                        </button>
                      ) : null}
                      {linkedRepoUsage.length > 1 && onOpenGithubSettings ? (
                        <button
                          type="button"
                          className="normal-case tracking-normal underline decoration-wavy"
                          onClick={onOpenGithubSettings}
                          title="Change default repository for new issues"
                        >
                          Change default…
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {linkedRepoUsage.map((u) => {
                        const active = githubRepoFilter === u.key
                        return (
                          <button
                            key={u.key}
                            type="button"
                            className={cn(
                              'tag-chip tag-chip-repo',
                              active && 'active',
                              u.isDefault && 'tag-chip-repo-default',
                            )}
                            style={active ? undefined : repoAccentStyle(u.owner, u.name)}
                            title={
                              active
                                ? `Clear filter: ${u.key}`
                                : `Filter tasks linked to ${u.key} (${u.count})`
                            }
                            onClick={() => {
                              setGithubRepoFilter(active ? null : u.key)
                              collapseFiltersIfMobile()
                            }}
                          >
                            <Icons.Github size="0.85em" className="tag-chip-repo-icon" />
                            <span className="tag-chip-repo-name">{u.name}</span>
                            <span className="tag-chip-repo-count opacity-70">×{u.count}</span>
                            {u.isDefault ? (
                              <span className="tag-chip-repo-default-mark">default</span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Repo chips filter by the issue’s linked repository (not a task tag). User tags
                      still sync as GitHub labels.
                    </p>
                  </div>
                ) : null}

                {sortBy === 'tags' ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Grouped by tag. Drag the ⋮⋮ handle <strong>within a group</strong> to change
                    priority (updates project rank). Clear search to reorder. Cross-group drag is
                    off.
                  </p>
                ) : sortBy === 'due' ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Grouped by due date (today, tomorrow, next week…). Overdue tasks appear under{' '}
                    <strong>Today</strong>. Drag reorder is off — use <strong>Rank</strong> or{' '}
                    <strong>Tags</strong> to prioritize.
                  </p>
                ) : !canDrag && canEdit ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Drag reorder: sort <strong>Rank</strong> (full list) or <strong>Tags</strong>{' '}
                    (within a group). Clear search / tag filters for Rank drag.
                  </p>
                ) : canDragRank ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Drag the ⋮⋮ handle to change task priority order.
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* #4 Quick add + details accordion */}
          {canEdit && addOpen ? (
            <section
              className="notebook-panel floating-elevated !py-2 space-y-2"
              data-quick-add-panel
            >
              <div className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-sm font-semibold">Add task</span>
                <button
                  type="button"
                  className="icon-btn !h-8 !w-8"
                  title="Collapse"
                  onClick={() => closeAdd()}
                >
                  <Icons.X size="0.85em" />
                </button>
              </div>
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault()
                  await submitQuick()
                }}
              >
                <div className="quick-add">
                  <button
                    type="button"
                    className="px-3 text-[var(--color-muted)] hover:text-[var(--color-text)]"
                    title={
                      quickDetails
                        ? 'Hide details'
                        : `${TASK_SHORTCUTS.quickDetails.description} (${TASK_SHORTCUTS.quickDetails.combo()})`
                    }
                    aria-keyshortcuts="Control+ArrowDown Meta+ArrowDown"
                    onClick={() => setQuickDetails((v) => !v)}
                  >
                    {quickDetails ? <Icons.ChevronDown /> : <Icons.ChevronRight />}
                  </button>
                  <input
                    ref={quickRef}
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Add new task…"
                    disabled={savingQuick}
                    aria-keyshortcuts="Control+ArrowUp Meta+ArrowUp"
                    title={`${TASK_SHORTCUTS.focusAdd.description} (${TASK_SHORTCUTS.focusAdd.combo()})`}
                  />
                  <div className="quick-side">
                    {quickName ? (
                      <button
                        type="button"
                        className="icon-btn"
                        title={`Clear (${TASK_SHORTCUTS.collapseEsc.combo()} when focused here)`}
                        onClick={() => resetQuick()}
                      >
                        <Icons.X />
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      className="icon-btn"
                      title={`${TASK_SHORTCUTS.saveQuick.description} (${TASK_SHORTCUTS.saveQuick.combo()})`}
                      aria-keyshortcuts="Control+Enter Meta+Enter"
                      disabled={savingQuick || !quickName.trim()}
                    >
                      <Icons.Save />
                    </button>
                  </div>
                </div>

                {quickDetails ? (
                  <div className="space-y-2 rounded-[var(--radius-sketch-sm)] border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3">
                    {githubEnabled ? (
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={createGithubOnAdd}
                          onChange={(e) => setCreateGithubOnAdd(e.target.checked)}
                          disabled={savingQuick}
                        />
                        <span>
                          Create GitHub issue
                          <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                            Opens a new issue on{' '}
                            <strong className="text-[var(--color-text)]">
                              {defaultGithubRepo ?? 'the linked repo'}
                            </strong>{' '}
                            and links it to this task
                            {onImportFromGithub ? (
                              <>
                                {' · '}
                                <button
                                  type="button"
                                  className="underline decoration-wavy"
                                  onClick={() => onImportFromGithub()}
                                >
                                  or import an existing issue
                                </button>
                              </>
                            ) : null}
                          </span>
                        </span>
                      </label>
                    ) : null}
                    <label className="block text-sm">
                      <span className="mb-1 flex items-center justify-between gap-2 text-[var(--color-muted)]">
                        Description
                        <MarkdownHelp />
                      </span>
                      <Textarea
                        className="min-h-[72px] bg-[var(--color-surface)]"
                        value={quickDescription}
                        onChange={(e) => setQuickDescription(e.target.value)}
                        placeholder="Optional details (Markdown)…"
                      />
                    </label>
                    <label className="block text-sm sm:max-w-xs">
                      <span className="mb-1 block text-[var(--color-muted)]">Due date</span>
                      <input
                        type="date"
                        className="field-input"
                        value={quickEndDate}
                        onChange={(e) => setQuickEndDate(e.target.value)}
                      />
                    </label>
                    <div>
                      <span className="mb-1 block text-sm text-[var(--color-muted)]">Tags</span>
                      <div className="flex flex-wrap gap-1.5">
                        {tags
                          .filter((t) => !isGithubSystemTag(t.name))
                          .map((tag) => {
                            const on = quickTagIds.includes(tag.id)
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                className={cn('tag-chip', on && 'active')}
                                onClick={() =>
                                  setQuickTagIds((prev) =>
                                    on ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                                  )
                                }
                              >
                                #{tag.name}
                              </button>
                            )
                          })}
                        <InlineTagAdd
                          onCreate={async (name) => {
                            try {
                              const tag = await onCreateTag(name)
                              setQuickTagIds((prev) =>
                                prev.includes(tag.id) ? prev : [...prev, tag.id],
                              )
                              toast.push(`Tag #${tag.name} created`, 'success')
                            } catch (e) {
                              toast.push(
                                e instanceof Error ? e.message : 'Could not create tag',
                                'error',
                              )
                              throw e
                            }
                          }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-[var(--color-muted)]">
                      Or open the full editor:{' '}
                      <button
                        type="button"
                        className="underline decoration-wavy"
                        onClick={onOpenDetailedAdd}
                      >
                        detailed form
                      </button>
                    </p>
                  </div>
                ) : (
                  <p className="px-1 text-xs text-[var(--color-muted)]">
                    <span className="kbd">{TASK_SHORTCUTS.quickDetails.combo()}</span> details ·{' '}
                    <span className="kbd">{TASK_SHORTCUTS.focusAdd.combo()}</span> focus add ·{' '}
                    <span className="kbd">{TASK_SHORTCUTS.saveQuick.combo()}</span> save ·{' '}
                    <span className="kbd">{TASK_SHORTCUTS.clearAllFilters.combo()}</span> clear
                    filters
                  </p>
                )}
              </form>
            </section>
          ) : null}
        </div>
      </div>

      {/* Task list — flat or tag groups */}
      <section className="space-y-4">
        {canEdit && sortBy === 'due' ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
            Sorted by <strong>Due date</strong> groups — drag reorder is off. Use{' '}
            <strong>Rank</strong> or <strong>Tags</strong> to rearrange priority.
          </p>
        ) : canEdit && sortBy === 'tags' && canDragInTagGroups ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
            Sorted by <strong>Tags</strong> — drag the ⋮⋮ handle <strong>inside a group</strong> to
            reorder (project-wide rank). Dropping into another group is not supported.
          </p>
        ) : canEdit && sortBy === 'tags' && !canDragInTagGroups ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-xs text-[var(--color-muted)]">
            Sorted by <strong>Tags</strong> — clear search to drag-reorder within groups.
          </p>
        ) : null}
        {filtered.length === 0 ? (
          <div className="notebook-panel py-10 text-center text-sm text-[var(--color-muted)]">
            No tasks match these filters.
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key} className="space-y-2">
              {sortBy === 'tags' || sortBy === 'due' ? (
                <div className="task-group-header sticky z-10 flex flex-wrap items-center gap-2 bg-[var(--color-bg)]/95 py-1.5 backdrop-blur-sm">
                  <h3 className="task-group-title text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {group.title}
                  </h3>
                  <span className="text-xs text-[var(--color-muted)]">({group.tasks.length})</span>
                  {/* Same order as task row actions: complete · copy · (group extras) · delete */}
                  <div className="flex gap-1">
                    {canEdit && onSetTasksCompleted && group.tasks.length > 0 ? (
                      <button
                        type="button"
                        className="icon-btn !h-7 !w-7"
                        title={
                          group.tasks.every((t) => t.completed)
                            ? `Mark all ${group.tasks.length} task${group.tasks.length === 1 ? '' : 's'} incomplete`
                            : `Complete all open tasks in ${group.title}`
                        }
                        onClick={() => {
                          void (async () => {
                            const openOnes = group.tasks.filter((t) => !t.completed)
                            const allDone = openOnes.length === 0
                            const targets = allDone ? group.tasks : openOnes
                            const n = targets.length

                            // Only warn about GitHub when completing tasks that have open issue links
                            // and the project will actually try to close them.
                            let ghCloseCount = 0
                            if (
                              !allDone &&
                              githubVisible &&
                              canCloseGithubIssues &&
                              closeGithubOnComplete
                            ) {
                              for (const t of openOnes) {
                                const gh = githubByTask.get(t.id)
                                if (
                                  gh?.github_issue_number &&
                                  gh.github_issue_state !== 'closed'
                                ) {
                                  ghCloseCount += 1
                                }
                              }
                            }

                            let message = allDone
                              ? `Mark all ${n} task${n === 1 ? '' : 's'} in ${group.title} as not done?`
                              : `Mark ${n} open task${n === 1 ? '' : 's'} in ${group.title} as completed?`
                            if (ghCloseCount > 0) {
                              message +=
                                ghCloseCount === 1
                                  ? ' 1 linked open GitHub issue will also be closed.'
                                  : ` ${ghCloseCount} linked open GitHub issues will also be closed.`
                            }

                            const ok = await confirm({
                              title: allDone
                                ? 'Mark group incomplete?'
                                : 'Complete entire group?',
                              message,
                              confirmLabel: allDone
                                ? n === 1
                                  ? 'Mark incomplete'
                                  : `Mark ${n} incomplete`
                                : n === 1
                                  ? 'Complete task'
                                  : `Complete ${n} tasks`,
                              cancelLabel: 'Cancel',
                            })
                            if (!ok) return
                            try {
                              await onSetTasksCompleted(targets, !allDone)
                            } catch (e) {
                              toast.push(
                                e instanceof Error ? e.message : 'Could not update group',
                                'error',
                              )
                            }
                          })()
                        }}
                      >
                        <Icons.Check size="0.85em" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn !h-7 !w-7"
                      title={
                        advancedExportEnabled && onOpenTransfer
                          ? 'Export group tasks'
                          : 'Copy group as checklist text'
                      }
                      onClick={async () => {
                        if (advancedExportEnabled && onOpenTransfer) {
                          onOpenTransfer(
                            group.tasks.map((t) => t.id),
                            'export',
                          )
                          return
                        }
                        const text = group.tasks
                          .map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.name}`)
                          .join('\n')
                        const ok = await copyToClipboard(text)
                        toast.push(
                          ok
                            ? `Copied ${group.tasks.length} task(s) as text`
                            : 'Copy failed',
                          ok ? 'success' : 'error',
                        )
                      }}
                    >
                      <Icons.Copy size="0.85em" />
                    </button>
                    {canEdit && group.tagId ? (
                      <button
                        type="button"
                        className="icon-btn !h-7 !w-7"
                        title="Add task with this tag"
                        onClick={() => {
                          openAdd()
                          setQuickDetails(true)
                          // Group launch overrides remembered tags
                          setQuickTagIds([group.tagId!])
                          queueMicrotask(() => quickRef.current?.focus())
                        }}
                      >
                        <Icons.Plus size="0.85em" />
                      </button>
                    ) : null}
                    {canEdit && onDeleteTasks && group.tasks.length > 0 ? (
                      <button
                        type="button"
                        className="icon-btn danger !h-7 !w-7"
                        title={`Delete all ${group.tasks.length} task${group.tasks.length === 1 ? '' : 's'} in this group`}
                        onClick={() => {
                          setDeletePending({
                            tasks: group.tasks,
                            groupTitle: group.title,
                            clearTagId: group.tagId,
                          })
                        }}
                      >
                        <Icons.Trash size="0.85em" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={group.tasks.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {group.tasks.map((task) => (
                    <SortableTaskRow
                      key={task.id}
                      task={task}
                      tags={tagsByTask.get(task.id) ?? []}
                      allTags={tags}
                      github={githubVisible ? githubByTask.get(task.id) : undefined}
                      appBlockers={blockersByTask.get(task.id) ?? []}
                      appBlocking={blockingByTask.get(task.id) ?? []}
                      canEdit={canEdit}
                      canDrag={canDrag}
                      githubVisible={githubVisible}
                      githubEnabled={githubEnabled}
                      defaultGithubRepo={defaultGithubRepo}
                      expanded={expandedTaskId === task.id}
                      flash={flashTaskId === task.id}
                      flashNonce={flashNonce}
                      tagEditOpen={tagEditTaskId === task.id}
                      dependenciesEnabled={dependenciesEnabled}
                      onRevealTask={revealTask}
                      onToggleExpand={() => {
                        setExpandedTaskId((id) => {
                          const next = id === task.id ? null : task.id
                          if (next === task.id) onExpandTask?.(task)
                          return next
                        })
                      }}
                      onToggleComplete={onToggleComplete}
                      onEdit={onEdit}
                      onOpenDependencies={
                        dependenciesEnabled && canEdit && onAddBlocker && onRemoveBlocker
                          ? (tab) => setDepsModal({ task, tab })
                          : undefined
                      }
                      onConfirmDelete={(task) => {
                        setDeletePending({ tasks: [task] })
                      }}
                      onCopy={() => {
                        if (advancedExportEnabled && onOpenTransfer) {
                          onOpenTransfer([task.id], 'export')
                          return
                        }
                        void (async () => {
                          const line = `${task.completed ? '[x]' : '[ ]'} ${task.name}`
                          const ok = await copyToClipboard(line)
                          toast.push(
                            ok ? 'Task copied as text' : 'Copy failed',
                            ok ? 'success' : 'error',
                          )
                        })()
                      }}
                      onGithub={async (action) => {
                        try {
                          await onGithubAction(task, action)
                        } catch (e) {
                          toast.push(
                            e instanceof Error ? e.message : 'GitHub action failed',
                            'error',
                          )
                        }
                      }}
                      onToggleTagEdit={() => {
                        setExpandedTaskId(task.id)
                        setTagEditTaskId((id) => (id === task.id ? null : task.id))
                      }}
                      onSetTags={async (ids) => {
                        try {
                          await onSetTaskTags(task.id, ids)
                          // After list re-groups (tags / due), scroll + flash like new task
                          revealTask(task.id, { delayMs: 100 })
                        } catch (e) {
                          toast.push(
                            e instanceof Error ? e.message : 'Tag update failed',
                            'error',
                          )
                        }
                      }}
                      onCreateTag={async (name) => {
                        try {
                          const tag = await onCreateTag(name)
                          const current = (tagsByTask.get(task.id) ?? [])
                            .filter((t) => !isGithubSystemTag(t.name))
                            .map((t) => t.id)
                          const next = current.includes(tag.id) ? current : [...current, tag.id]
                          await onSetTaskTags(task.id, next)
                          revealTask(task.id, { delayMs: 100 })
                          return tag
                        } catch (e) {
                          toast.push(
                            e instanceof Error ? e.message : 'Create tag failed',
                            'error',
                          )
                          throw e
                        }
                      }}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          ))
        )}
      </section>

      {depsModal && onAddBlocker && onRemoveBlocker ? (
        <TaskDependenciesModal
          open={Boolean(depsModal)}
          onClose={() => setDepsModal(null)}
          task={depsModal.task}
          allTasks={tasks}
          dependencies={dependencies}
          initialTab={depsModal.tab}
          onAddBlocker={onAddBlocker}
          onRemoveBlocker={onRemoveBlocker}
        />
      ) : null}

      <TaskDeleteConfirm
        open={Boolean(deletePending?.tasks.length)}
        tasks={deletePending?.tasks ?? []}
        githubByTask={githubVisible ? githubByTask : undefined}
        canCloseGithub={canCloseGithubIssues}
        groupTitle={deletePending?.groupTitle}
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setDeletePending(null)
        }}
        onConfirm={(mode: TaskDeleteMode) => {
          void (async () => {
            if (!deletePending?.tasks.length) return
            setDeleteBusy(true)
            const list = deletePending.tasks
            const clearTagId = deletePending.clearTagId
            const opts = { closeGithubIssues: mode === 'close' }
            try {
              if (list.length === 1 && !deletePending.groupTitle) {
                await onDelete(list[0]!, opts)
              } else if (onDeleteTasks) {
                await onDeleteTasks(list, opts)
              } else {
                for (const t of list) await onDelete(t, opts)
              }
              if (clearTagId) {
                setActiveTagIds((ids) => ids.filter((id) => id !== clearTagId))
              }
              setDeletePending(null)
            } catch (e) {
              toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
            } finally {
              setDeleteBusy(false)
            }
          })()
        }}
      />
    </div>
  )
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const fn = () => setMatches(mq.matches)
    fn()
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [query])
  return matches
}

/** Calendar-day delta from local today for YYYY-MM-DD (negative = overdue). */
function daysFromTodayLocal(isoDay: string): number {
  const now = new Date()
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const parts = isoDay.split('-').map((x) => Number(x))
  const y = parts[0]
  const m = parts[1]
  const d = parts[2]
  if (!y || !m || !d) return 0
  const dueUtc = Date.UTC(y, m - 1, d)
  return Math.round((dueUtc - todayUtc) / 86_400_000)
}

function SortableTaskRow({
  task,
  tags,
  allTags,
  github,
  appBlockers,
  appBlocking,
  canEdit,
  canDrag,
  githubVisible,
  githubEnabled,
  defaultGithubRepo,
  expanded,
  flash,
  flashNonce,
  tagEditOpen,
  dependenciesEnabled = true,
  onRevealTask,
  onToggleExpand,
  onToggleComplete,
  onEdit,
  onConfirmDelete,
  onCopy,
  onGithub,
  onToggleTagEdit,
  onSetTags,
  onCreateTag,
  onOpenDependencies,
}: {
  task: Task
  tags: Tag[]
  allTags: Tag[]
  github?: TaskGitHubConfig
  appBlockers: { dep: TaskDependency; task: Task }[]
  appBlocking: { dep: TaskDependency; task: Task }[]
  canEdit: boolean
  canDrag: boolean
  githubVisible: boolean
  githubEnabled: boolean
  defaultGithubRepo: string | null
  expanded: boolean
  flash: boolean
  flashNonce: number
  tagEditOpen: boolean
  dependenciesEnabled?: boolean
  onRevealTask: (taskId: string, opts?: { expand?: boolean; delayMs?: number }) => void
  onToggleExpand: () => void
  onToggleComplete: (task: Task, completed: boolean) => void
  onEdit: (task: Task) => void
  onConfirmDelete: (task: Task) => void
  onCopy: () => void
  onGithub: (action: 'create' | 'sync' | 'link' | 'choose') => Promise<void>
  onToggleTagEdit: () => void
  onSetTags: (ids: string[]) => Promise<void>
  onOpenDependencies?: (tab: 'blocked_by' | 'blocks') => void
  onCreateTag: (name: string) => Promise<Tag>
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !canDrag,
  })
  const [ghBusy, setGhBusy] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Keep dragging item above neighbors / expand panels
    zIndex: isDragging ? 25 : undefined,
    position: 'relative' as const,
  }

  const selected = new Set(tags.map((t) => t.id))
  const hasDetails = Boolean(
    task.description?.trim() ||
      task.end_date ||
      tags.length > 0 ||
      github?.github_issue_number ||
      appBlockers.length > 0 ||
      appBlocking.length > 0,
  )

  const openAppBlockers = appBlockers.filter((b) => !b.task.completed)
  const openAppBlocking = appBlocking.filter((b) => !b.task.completed)

  const cardOpen = expanded || tagEditOpen
  const taskRepo = repoKey(github?.github_repo_owner, github?.github_repo_name)
  const isLegacyRepo = Boolean(
    taskRepo && defaultGithubRepo && taskRepo !== defaultGithubRepo,
  )
  const isOrphanRepo = Boolean(taskRepo && !defaultGithubRepo)

  return (
    <div
      id={`task-row-${task.id}`}
      className={cn('task-sortable', isDragging && 'is-dragging')}
      ref={setNodeRef}
      style={style}
    >
      <div
        className={cn(
          'task-card',
          cardOpen && 'is-open',
          isDragging && 'is-dragging',
          flash && 'flash-new',
        )}
        data-flash-nonce={flash ? flashNonce : undefined}
      >
        <div className={cn('task-row', task.completed && 'completed', isDragging && 'dragging')}>
          <div className="task-row-main">
            <button
              type="button"
              ref={canDrag ? setActivatorNodeRef : undefined}
              className={cn('grip', !canDrag && 'opacity-30', isDragging && 'is-active')}
              title={
                canDrag
                  ? 'Drag to reorder'
                  : 'Reorder when sorted by Rank, or by Tags within a group'
              }
              aria-label={canDrag ? 'Drag to reorder task' : 'Reordering disabled'}
              aria-disabled={!canDrag}
              {...(canDrag ? { ...attributes, ...listeners } : {})}
            >
              <Icons.Grip className="pointer-events-none" />
            </button>

            <button
              type="button"
              className="task-title"
              title={hasDetails ? (expanded ? 'Collapse details' : 'Show details') : task.name}
              onClick={onToggleExpand}
              onPointerDown={(e) => {
                e.stopPropagation()
              }}
            >
              {task.name}
            </button>

            {/* App: this task is blocked by others */}
            {dependenciesEnabled
              ? openAppBlockers.slice(0, 3).map(({ task: b }) => (
                  <button
                    key={`app-block-${b.id}`}
                    type="button"
                    className="pill-badge gh-blocked-by"
                    title={`Blocked by: ${b.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRevealTask(b.id)
                    }}
                  >
                    <span className="pill-badge-label" aria-hidden>
                      ⛔
                    </span>
                    <span className="pill-badge-text">{b.name}</span>
                  </button>
                ))
              : null}

            {/* App: this task blocks others */}
            {dependenciesEnabled
              ? openAppBlocking.slice(0, 2).map(({ task: b }) => (
                  <button
                    key={`app-blocking-${b.id}`}
                    type="button"
                    className="pill-badge gh-blocking"
                    title={`Blocks: ${b.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRevealTask(b.id)
                    }}
                  >
                    <span className="pill-badge-label" aria-hidden>
                      🔒
                    </span>
                    <span className="pill-badge-text">{b.name}</span>
                  </button>
                ))
              : null}

            {/* GitHub-only blockers (issue # without an app task edge) */}
            {githubVisible &&
            github?.github_issue_number &&
            Array.isArray(github.github_blocked_by) &&
            github.github_blocked_by.some((b) => b.state === 'open')
              ? github.github_blocked_by
                  .filter((b) => b.state === 'open')
                  .slice(0, 3)
                  .map((b) => (
                    <a
                      key={`block-${b.number}-${b.html_url}`}
                      className="pill-badge gh-blocked-by"
                      href={b.html_url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Blocked by GitHub #${b.number}: ${b.title}${b.repo ? ` (${b.repo})` : ''}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="pill-badge-label" aria-hidden>
                        ⛔
                      </span>
                      <span className="pill-badge-text">#{b.number}</span>
                    </a>
                  ))
              : null}

            {githubVisible && github?.github_issue_number ? (
              <a
                className={cn(
                  'pill-badge gh-repo-pill',
                  !githubEnabled && 'opacity-70',
                  isLegacyRepo && 'gh-repo-legacy',
                  isOrphanRepo && 'gh-repo-orphan',
                )}
                href={github.github_issue_url ?? undefined}
                target="_blank"
                rel="noreferrer"
                style={repoAccentStyle(github.github_repo_owner, github.github_repo_name)}
                title={
                  [
                    taskRepo,
                    isLegacyRepo
                      ? 'Not the project default repo (legacy link)'
                      : isOrphanRepo
                        ? 'Project GitHub is off — link is read-only'
                        : null,
                    githubEnabled ? 'Open issue' : 'Read-only',
                    Array.isArray(github.github_blocked_by) &&
                    github.github_blocked_by.some((b) => b.state === 'open')
                      ? `Blocked by ${github.github_blocked_by
                          .filter((b) => b.state === 'open')
                          .map((b) => `#${b.number}`)
                          .join(', ')}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }
                onClick={(e) => e.stopPropagation()}
              >
                <Icons.Github />
                <span className="gh-repo-short">
                  {github.github_repo_name ? `${github.github_repo_name}` : 'repo'}
                </span>
                #{github.github_issue_number}
                {isLegacyRepo ? <span className="gh-legacy-dot" aria-hidden /> : null}
              </a>
            ) : null}

            {githubVisible && github?.github_milestone_title ? (
              <span className="pill-badge" title="Milestone">
                <Icons.Flag /> {github.github_milestone_title}
              </span>
            ) : null}

            {tags
              .filter((t) => !isGithubSystemTag(t.name))
              .slice(0, 2)
              .map((t) => (
                <span key={t.id} className="pill-badge">
                  #{t.name}
                </span>
              ))}
          </div>

          <div className="task-row-actions">
            <button
              type="button"
              className="icon-btn"
              title={task.completed ? 'Mark incomplete' : 'Complete'}
              disabled={!canEdit}
              onClick={() => onToggleComplete(task, !task.completed)}
            >
              <Icons.Check />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Copy task"
              onClick={onCopy}
            >
              <Icons.Copy />
            </button>
            {githubVisible && githubEnabled && canEdit && !github?.github_issue_number ? (
              <button
                type="button"
                className="icon-btn"
                title="GitHub: create issue or link existing"
                disabled={ghBusy}
                onClick={() => void onGithub('choose')}
              >
                {ghBusy ? (
                  <span
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                ) : (
                  <Icons.Github />
                )}
              </button>
            ) : null}
            {githubVisible && github?.github_issue_number && githubEnabled && canEdit ? (
              <button
                type="button"
                className={cn('icon-btn', ghBusy && 'opacity-70')}
                title={`Sync with GitHub #${github.github_issue_number}`}
                disabled={ghBusy}
                onClick={async () => {
                  setGhBusy(true)
                  try {
                    await onGithub('sync')
                  } finally {
                    setGhBusy(false)
                  }
                }}
              >
                {ghBusy ? (
                  <span
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden
                  />
                ) : (
                  <Icons.Refresh />
                )}
              </button>
            ) : null}
            {canEdit && onOpenDependencies ? (
              <button
                type="button"
                className={cn(
                  'icon-btn dep-status-btn',
                  openAppBlockers.length > 0 ||
                    (githubVisible &&
                      Array.isArray(github?.github_blocked_by) &&
                      github.github_blocked_by.some((b) => b.state === 'open'))
                    ? 'dep-status-blocked'
                    : openAppBlocking.length > 0
                      ? 'dep-status-blocking'
                      : 'dep-status-none',
                )}
                title={
                  openAppBlockers.length > 0
                    ? `Blocked by ${openAppBlockers.length} task(s) — manage dependencies`
                    : openAppBlocking.length > 0
                      ? `Blocks ${openAppBlocking.length} task(s) — manage dependencies`
                      : 'Manage dependencies'
                }
                onClick={() => onOpenDependencies('blocked_by')}
              >
                <Icons.Dependencies />
              </button>
            ) : null}
            <button type="button" className="icon-btn" title="Edit" onClick={() => onEdit(task)}>
              <Icons.Edit />
            </button>
            <button
              type="button"
              className="icon-btn danger"
              title="Delete"
              disabled={!canEdit}
              onClick={() => onConfirmDelete(task)}
            >
              <Icons.Trash />
            </button>
          </div>
        </div>

        {/* Details drawer: tags (+ editor) first, then due/issue/description */}
        <div className={cn('task-drawer', expanded && 'open')} aria-hidden={!expanded}>
          <div className="task-drawer-inner">
            <div className="task-drawer-body space-y-3">
              {/* Dependencies summary (manage via row diagram icon) */}
              {dependenciesEnabled && (appBlockers.length > 0 || appBlocking.length > 0) ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Dependencies
                    {canEdit && onOpenDependencies ? (
                      <button
                        type="button"
                        className="ml-2 normal-case tracking-normal font-medium underline decoration-wavy"
                        onClick={() => onOpenDependencies('blocked_by')}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                  {appBlockers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="w-full text-[10px] font-semibold uppercase text-[var(--color-muted)]">
                        Blocked by
                      </span>
                      {appBlockers.map(({ task: b }) => (
                        <button
                          key={b.id}
                          type="button"
                          className="pill-badge gh-blocked-by"
                          title={`Blocked by: ${b.name}${b.completed ? ' (done)' : ''}`}
                          onClick={() => onRevealTask(b.id)}
                        >
                          <span className="pill-badge-label" aria-hidden>
                            ⛔
                          </span>
                          <span className="pill-badge-text">
                            {b.name}
                            {b.completed ? ' ✓' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {appBlocking.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="w-full text-[10px] font-semibold uppercase text-[var(--color-muted)]">
                        Blocks
                      </span>
                      {appBlocking.map(({ task: b }) => (
                        <button
                          key={b.id}
                          type="button"
                          className="pill-badge gh-blocking"
                          title={`Blocks: ${b.name}${b.completed ? ' (done)' : ''}`}
                          onClick={() => onRevealTask(b.id)}
                        >
                          <span className="pill-badge-label" aria-hidden>
                            🔒
                          </span>
                          <span className="pill-badge-text">
                            {b.name}
                            {b.completed ? ' ✓' : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/*
                Tags: view mode = tags on this task (legacy #github hidden).
                Edit mode = project tags as toggle pills.
              */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {!tagEditOpen ? (
                    <>
                      {tags
                        .filter((t) => !isGithubSystemTag(t.name))
                        .map((t) => (
                          <span key={t.id} className="pill-badge" title={`#${t.name}`}>
                            #{t.name}
                          </span>
                        ))}
                      {canEdit ? (
                        <button
                          type="button"
                          className="icon-btn !h-7 !w-7"
                          title="Edit tags"
                          aria-expanded={false}
                          onClick={onToggleTagEdit}
                        >
                          <Icons.Tag size="0.85em" />
                        </button>
                      ) : null}
                      {!canEdit && tags.filter((t) => !isGithubSystemTag(t.name)).length === 0 ? (
                        <span className="text-xs text-[var(--color-muted)]">No tags</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {allTags.filter((t) => !isGithubSystemTag(t.name)).length === 0 ? (
                        <p className="text-xs text-[var(--color-muted)]">
                          No tags yet — create one below.
                        </p>
                      ) : (
                        allTags
                          .filter((t) => !isGithubSystemTag(t.name))
                          .map((tag) => {
                            const on = selected.has(tag.id)
                            return (
                              <button
                                key={tag.id}
                                type="button"
                                className={cn('pill-badge is-toggle', on && 'is-selected')}
                                title={on ? `Remove #${tag.name}` : `Add #${tag.name}`}
                                onClick={() => {
                                  const base = tags
                                    .filter((t) => !isGithubSystemTag(t.name))
                                    .map((t) => t.id)
                                  const next = on
                                    ? base.filter((id) => id !== tag.id)
                                    : [...base, tag.id]
                                  void onSetTags(next)
                                }}
                              >
                                #{tag.name}
                              </button>
                            )
                          })
                      )}
                      {canEdit ? (
                        <InlineTagAdd
                          variant="pill"
                          onCreate={async (name) => {
                            await onCreateTag(name)
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="icon-btn !h-7 !w-7 btn-pressed"
                        title="Done editing tags"
                        aria-expanded
                        onClick={onToggleTagEdit}
                      >
                        <Icons.Tag size="0.85em" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {task.end_date ? (
                <p className="text-sm text-[var(--color-muted)]">
                  Due{' '}
                  <strong className="text-[var(--color-text)]">
                    {new Date(task.end_date).toLocaleDateString()}
                  </strong>
                </p>
              ) : null}
              {github?.github_issue_url ? (
                <div className="space-y-1 text-sm">
                  <a
                    className="inline-flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 no-underline"
                    href={github.github_issue_url}
                    target="_blank"
                    rel="noreferrer"
                    style={repoAccentStyle(github.github_repo_owner, github.github_repo_name)}
                  >
                    <Icons.Github />
                    {taskRepo ? <span className="font-semibold">{taskRepo}</span> : null}
                    <span>
                      #{github.github_issue_number}
                      {github.github_issue_state ? ` · ${github.github_issue_state}` : ''}
                    </span>
                  </a>
                  {isLegacyRepo ? (
                    <p className="text-xs text-[var(--color-muted)]">
                      Legacy link — not the project default (
                      <strong className="text-[var(--color-text)]">{defaultGithubRepo}</strong>
                      ). Sync/close still use this issue’s original repo.
                    </p>
                  ) : null}
                  {isOrphanRepo ? (
                    <p className="text-xs text-[var(--color-muted)]">
                      Project GitHub is off. Issue stays open on GitHub; complete will not close it
                      until you link a default repo again.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {task.description?.trim() ? (
                <MarkdownView source={task.description} />
              ) : (
                <p className="text-sm text-[var(--color-muted)]">No description.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


