import { getSupabase } from '@/lib/supabase/client'
import type { Tag, Task, TaskDependency, TaskGitHubConfig, TaskTag } from '@/lib/supabase/types'

export async function fetchTasks(scopeId: string) {
  const { data, error } = await getSupabase()
    .from('tasks')
    .select('*')
    .eq('scope_id', scopeId)
    .order('rank', { ascending: true })
  if (error) throw error
  return data as Task[]
}

export async function fetchTags(scopeId: string) {
  const { data, error } = await getSupabase()
    .from('tags')
    .select('*')
    .eq('scope_id', scopeId)
    .order('name')
  if (error) throw error
  return data as Tag[]
}

export async function fetchTaskTags(scopeId: string) {
  const supabase = getSupabase()
  const { data: tasks, error: tErr } = await supabase.from('tasks').select('id').eq('scope_id', scopeId)
  if (tErr) throw tErr
  const ids = (tasks ?? []).map((t) => (t as { id: string }).id)
  if (ids.length === 0) return [] as TaskTag[]
  const { data, error } = await supabase.from('task_tags').select('*').in('task_id', ids)
  if (error) throw error
  return data as TaskTag[]
}

export async function createTask(input: {
  scopeId: string
  name: string
  description?: string | null
  ownerId?: string | null
  endDate?: string | null
}) {
  const supabase = getSupabase()
  const { data: maxRank } = await supabase
    .from('tasks')
    .select('rank')
    .eq('scope_id', input.scopeId)
    .order('rank', { ascending: false })
    .limit(1)
    .maybeSingle()

  const rank = ((maxRank as { rank: number } | null)?.rank ?? -1) + 1

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      scope_id: input.scopeId,
      name: input.name,
      description: input.description ?? null,
      parent_task_id: null,
      owner_id: input.ownerId ?? null,
      end_date: input.endDate ?? null,
      rank,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<
      Task,
      | 'name'
      | 'description'
      | 'rank'
      | 'completed'
      | 'completed_date'
      | 'start_date'
      | 'end_date'
    >
  >,
) {
  const { data, error } = await getSupabase()
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Task
}

/** Complete/uncomplete a single task (no subtask cascade — hierarchy removed). */
export async function setTaskCompleted(taskId: string, completed: boolean) {
  const completed_date = completed ? new Date().toISOString() : null
  const { error } = await getSupabase()
    .from('tasks')
    .update({ completed, completed_date })
    .eq('id', taskId)
  if (error) throw error
  return [taskId]
}

export async function deleteTask(id: string) {
  const { error } = await getSupabase().from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function createTag(scopeId: string, name: string) {
  const { data, error } = await getSupabase()
    .from('tags')
    .insert({ scope_id: scopeId, name })
    .select('*')
    .single()
  if (error) throw error
  return data as Tag
}

export async function deleteTag(id: string) {
  const { error } = await getSupabase().from('tags').delete().eq('id', id)
  if (error) throw error
}

export async function setTaskTags(taskId: string, tagIds: string[]) {
  const supabase = getSupabase()
  const { error: delErr } = await supabase.from('task_tags').delete().eq('task_id', taskId)
  if (delErr) throw delErr
  if (tagIds.length === 0) return
  const { error } = await supabase
    .from('task_tags')
    .insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })))
  if (error) throw error
}

export async function fetchMyTaskGitHubConfigs(taskIds: string[], userId: string) {
  if (taskIds.length === 0) return [] as TaskGitHubConfig[]
  const { data, error } = await getSupabase()
    .from('task_github_configs')
    .select('*')
    .eq('user_id', userId)
    .in('task_id', taskIds)
  if (error) throw error
  return data as TaskGitHubConfig[]
}

/** Persist a full rank order for a set of task ids (0..n-1). */
export async function reorderTasks(orderedIds: string[]) {
  const supabase = getSupabase()
  const updates = orderedIds.map((id, index) =>
    supabase.from('tasks').update({ rank: index }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export async function reorderScopes(orderedIds: string[]) {
  const supabase = getSupabase()
  const updates = orderedIds.map((id, index) =>
    supabase.from('scopes').update({ rank: index + 1 }).eq('id', id),
  )
  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}

export function exportTasksAsText(
  tasks: Task[],
  tagsByTask: Map<string, string[]>,
): string {
  const lines: string[] = []
  for (const t of tasks) {
    const mark = t.completed ? '[x]' : '[ ]'
    const tagStr = (tagsByTask.get(t.id) ?? []).map((n) => `#${n}`).join(' ')
    lines.push(`${mark} ${t.name}${tagStr ? ` ${tagStr}` : ''}`)
    if (t.description?.trim()) {
      for (const d of t.description.trim().split('\n')) {
        lines.push(`    ${d}`)
      }
    }
  }
  return lines.join('\n')
}

// task_dependencies is not yet in generated Database types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function depsTable() {
  return (getSupabase() as any).from('task_dependencies')
}

/** All blocker relationships in a project. */
export async function fetchTaskDependencies(scopeId: string) {
  const { data, error } = await depsTable().select('*').eq('scope_id', scopeId)
  if (error) throw error
  return (data ?? []) as TaskDependency[]
}

/**
 * Mark blockedTaskId as blocked by blockerTaskId.
 * Caller may push to GitHub when both tasks have issues.
 */
export async function addTaskDependency(input: {
  scopeId: string
  blockedTaskId: string
  blockerTaskId: string
  createdBy?: string | null
}) {
  if (input.blockedTaskId === input.blockerTaskId) {
    throw new Error('A task cannot block itself')
  }
  const { data, error } = await depsTable()
    .upsert(
      {
        scope_id: input.scopeId,
        blocked_task_id: input.blockedTaskId,
        blocker_task_id: input.blockerTaskId,
        created_by: input.createdBy ?? null,
      },
      { onConflict: 'blocked_task_id,blocker_task_id' },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as TaskDependency
}

export async function removeTaskDependency(id: string) {
  const { error } = await depsTable().delete().eq('id', id)
  if (error) throw error
}

export async function removeTaskDependencyPair(blockedTaskId: string, blockerTaskId: string) {
  const { error } = await depsTable()
    .delete()
    .eq('blocked_task_id', blockedTaskId)
    .eq('blocker_task_id', blockerTaskId)
  if (error) throw error
}
