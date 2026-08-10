import type { Tag, Task } from '@/lib/supabase/types'
import type { TaskBoardViewPatch } from '@/features/tasks/components/TaskBoard'
import type { AssistantAction, AssistantPlan } from './api'

export type ExecuteDeps = {
  scopeId: string
  tasks: Task[]
  tags: Tag[]
  /** Existing tag names per task id (for merge on add_tags) */
  tagsByTask: Map<string, string[]>
  canEdit: boolean
  createTask: (input: {
    name: string
    description?: string | null
    endDate?: string | null
    tagIds?: string[]
  }) => Promise<Task>
  createTag: (name: string) => Promise<Tag>
  setCompleted: (taskId: string, completed: boolean) => Promise<void>
  /** Replace task tag set with these ids */
  setTaskTags: (taskId: string, tagIds: string[]) => Promise<void>
  updateTask: (input: {
    id: string
    name?: string
    description?: string | null
    endDate?: string | null
  }) => Promise<Task>
  /** Board filters/sort (voice set_view). Optional if board not mounted. */
  applyView?: (patch: TaskBoardViewPatch) => string[]
}

export type ExecuteResult = {
  summaryLines: string[]
  focusedTaskId: string | null
  ambiguous: {
    action: 'complete' | 'uncomplete' | 'add_tags' | 'update_task'
    match: string
    candidates: Task[]
    tag_names?: string[]
    pending?: Extract<AssistantAction, { type: 'update_task' }>
  }[]
  errors: string[]
}

function findByMatch(tasks: Task[], match: string, completed?: boolean): Task[] {
  const q = match.trim().toLowerCase()
  if (!q) return []
  return tasks.filter((t) => {
    if (completed === true && !t.completed) return false
    if (completed === false && t.completed) return false
    return t.name.toLowerCase().includes(q)
  })
}

async function resolveTagIds(
  names: string[],
  tagByName: Map<string, Tag>,
  createTag: (name: string) => Promise<Tag>,
): Promise<{ ids: string[]; labels: string[] }> {
  const ids: string[] = []
  const labels: string[] = []
  for (const raw of names) {
    const name = raw.replace(/^#/, '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    let tag = tagByName.get(key)
    if (!tag) {
      tag = await createTag(name)
      tagByName.set(tag.name.toLowerCase(), tag)
    }
    if (!ids.includes(tag.id)) {
      ids.push(tag.id)
      labels.push(tag.name)
    }
  }
  return { ids, labels }
}

function resolveTaskId(
  action: { task_id?: string; match?: string },
  deps: ExecuteDeps,
  opts?: { preferIncomplete?: boolean },
): { taskId: string } | { ambiguous: Task[]; match: string } | { error: string } {
  if (action.task_id) {
    const existing = deps.tasks.find((t) => t.id === action.task_id)
    if (!existing) return { error: 'Task not found' }
    return { taskId: action.task_id }
  }
  if (action.match) {
    const prefer = opts?.preferIncomplete
    const candidates = prefer
      ? findByMatch(deps.tasks, action.match, false)
      : findByMatch(deps.tasks, action.match)
    const fallback = findByMatch(deps.tasks, action.match)
    const list = candidates.length ? candidates : fallback
    if (list.length === 0) return { error: `No task matching “${action.match}”` }
    if (list.length > 1) return { ambiguous: list.slice(0, 8), match: action.match }
    return { taskId: list[0]!.id }
  }
  return { error: 'Missing task target' }
}

/**
 * Apply a planned assistant action list using existing app APIs.
 */
export async function executeAssistantPlan(
  plan: AssistantPlan,
  deps: ExecuteDeps,
): Promise<ExecuteResult> {
  const lines: string[] = []
  const errors: string[] = []
  const ambiguous: ExecuteResult['ambiguous'] = []
  let focusedTaskId: string | null = null

  if (plan.needs_clarification && !(plan.actions?.length > 0)) {
    return {
      summaryLines: [plan.needs_clarification],
      focusedTaskId: null,
      ambiguous: [],
      errors: [],
    }
  }

  const tagByName = new Map(deps.tags.map((t) => [t.name.toLowerCase(), t]))
  // Mutable copy of per-task tag names for merge within this batch
  const tagsByTask = new Map(deps.tagsByTask)

  for (const action of plan.actions ?? []) {
    try {
      if (action.type === 'set_view') {
        if (!deps.applyView) {
          errors.push('Board view is not available')
          continue
        }
        const viewLines = deps.applyView({
          search: action.search,
          sort_by: action.sort_by,
          show_completed: action.show_completed,
          tag_names: action.tag_names,
          clear_filters: action.clear_filters,
        })
        lines.push(...viewLines)
        continue
      }

      // Mutations require edit access
      if (!deps.canEdit) {
        errors.push('You need edit access to change tasks with the assistant.')
        break
      }

      if (action.type === 'create_task') {
        const { ids: tagIds, labels } = await resolveTagIds(
          action.tag_names ?? [],
          tagByName,
          deps.createTag,
        )
        const task = await deps.createTask({
          name: action.name,
          description: action.description ?? null,
          endDate: action.end_date
            ? new Date(`${action.end_date}T12:00:00`).toISOString()
            : null,
          tagIds: tagIds.length ? tagIds : undefined,
        })
        focusedTaskId = task.id
        if (labels.length) tagsByTask.set(task.id, labels)
        const tagNote = labels.length ? ` (${labels.map((t) => `#${t}`).join(' ')})` : ''
        lines.push(`Added “${task.name}”${tagNote}`)
        continue
      }

      if (action.type === 'add_tags') {
        const resolved = resolveTaskId(action, deps)
        if ('error' in resolved) {
          errors.push(resolved.error)
          continue
        }
        if ('ambiguous' in resolved) {
          ambiguous.push({
            action: 'add_tags',
            match: resolved.match,
            candidates: resolved.ambiguous,
            tag_names: action.tag_names,
          })
          continue
        }
        const { ids: newIds, labels } = await resolveTagIds(
          action.tag_names ?? [],
          tagByName,
          deps.createTag,
        )
        if (!newIds.length) {
          errors.push('No tags to add')
          continue
        }
        const existingNames = tagsByTask.get(resolved.taskId) ?? []
        const existingIds = existingNames
          .map((n) => tagByName.get(n.toLowerCase())?.id)
          .filter((id): id is string => Boolean(id))
        const merged = [...existingIds]
        for (const id of newIds) {
          if (!merged.includes(id)) merged.push(id)
        }
        await deps.setTaskTags(resolved.taskId, merged)
        const mergedNames = [
          ...new Set([...existingNames, ...labels].map((n) => n.replace(/^#/, ''))),
        ]
        tagsByTask.set(resolved.taskId, mergedNames)
        focusedTaskId = resolved.taskId
        const existing = deps.tasks.find((t) => t.id === resolved.taskId)
        lines.push(
          `Tagged “${existing?.name ?? 'task'}” with ${labels.map((t) => `#${t}`).join(' ')}`,
        )
        continue
      }

      if (action.type === 'update_task') {
        const resolved = resolveTaskId(action, deps)
        if ('error' in resolved) {
          errors.push(resolved.error)
          continue
        }
        if ('ambiguous' in resolved) {
          ambiguous.push({
            action: 'update_task',
            match: resolved.match,
            candidates: resolved.ambiguous,
            pending: action,
          })
          continue
        }
        const patch: {
          id: string
          name?: string
          description?: string | null
          endDate?: string | null
        } = { id: resolved.taskId }
        const notes: string[] = []
        if (action.name?.trim()) {
          patch.name = action.name.trim()
          notes.push(`renamed to “${patch.name}”`)
        }
        if (action.description !== undefined) {
          patch.description = action.description
          notes.push('updated description')
        }
        if (action.end_date !== undefined) {
          patch.endDate = action.end_date
            ? new Date(`${action.end_date}T12:00:00`).toISOString()
            : null
          notes.push(action.end_date ? `due ${action.end_date}` : 'cleared due date')
        }
        if (patch.name || patch.description !== undefined || patch.endDate !== undefined) {
          await deps.updateTask(patch)
        }
        if (action.tag_names?.length) {
          const { ids: newIds, labels } = await resolveTagIds(
            action.tag_names,
            tagByName,
            deps.createTag,
          )
          const existingNames = tagsByTask.get(resolved.taskId) ?? []
          const existingIds = existingNames
            .map((n) => tagByName.get(n.toLowerCase())?.id)
            .filter((id): id is string => Boolean(id))
          const merged = [...existingIds]
          for (const id of newIds) {
            if (!merged.includes(id)) merged.push(id)
          }
          await deps.setTaskTags(resolved.taskId, merged)
          tagsByTask.set(resolved.taskId, [
            ...new Set([...existingNames, ...labels].map((n) => n.replace(/^#/, ''))),
          ])
          notes.push(`tags ${labels.map((t) => `#${t}`).join(' ')}`)
        }
        focusedTaskId = resolved.taskId
        const existing = deps.tasks.find((t) => t.id === resolved.taskId)
        lines.push(
          notes.length
            ? `Updated “${existing?.name ?? 'task'}”: ${notes.join(', ')}`
            : `Updated “${existing?.name ?? 'task'}”`,
        )
        continue
      }

      const wantComplete = action.type === 'complete_task'
      if (action.type !== 'complete_task' && action.type !== 'uncomplete_task') {
        continue
      }

      const resolved = resolveTaskId(action, deps, {
        preferIncomplete: wantComplete,
      })
      if ('error' in resolved) {
        errors.push(resolved.error)
        continue
      }
      if ('ambiguous' in resolved) {
        ambiguous.push({
          action: wantComplete ? 'complete' : 'uncomplete',
          match: resolved.match,
          candidates: resolved.ambiguous,
        })
        continue
      }

      const existing = deps.tasks.find((t) => t.id === resolved.taskId)
      await deps.setCompleted(resolved.taskId, wantComplete)
      focusedTaskId = resolved.taskId
      lines.push(
        wantComplete
          ? `Completed “${existing?.name ?? 'task'}”`
          : `Reopened “${existing?.name ?? 'task'}”`,
      )
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Action failed')
    }
  }

  if (plan.summary && lines.length === 0 && ambiguous.length === 0 && errors.length === 0) {
    lines.push(plan.summary)
  }

  return { summaryLines: lines, focusedTaskId, ambiguous, errors }
}
