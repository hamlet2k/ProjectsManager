import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getSupabase } from '@/lib/supabase/client'
import { useAuth } from '@/app/providers/AuthProvider'
import {
  addTaskDependency,
  createTag,
  createTask,
  deleteTag,
  deleteTask,
  deleteTasks,
  fetchTags,
  fetchTaskDependencies,
  fetchTaskTags,
  fetchTasks,
  removeTaskDependency,
  reorderTasks,
  setTaskCompleted,
  setTasksCompleted,
  setTaskTags,
  updateTask,
} from './api'
import { syncTaskDependencyOnGitHub } from '@/features/github/api'
import type { Task } from '@/lib/supabase/types'

export function useScopeTasks(
  scopeId: string | undefined,
  opts?: {
    /**
     * When true (e.g. task edit modal open), stop background polling so mobile
     * focus churn / 12s refetch does not thrash the board while typing.
     * Realtime still delivers collaborator updates.
     */
    pausePolling?: boolean
  },
) {
  const qc = useQueryClient()
  const pausePolling = Boolean(opts?.pausePolling)

  // Shared projects: refetch periodically + on focus so collaborators see updates
  // even if Realtime is slow/unavailable. Realtime invalidates sooner when it works.
  const pollMs = 12_000
  const refetchInterval = pausePolling ? false : pollMs
  const refetchOnWindowFocus = !pausePolling

  const tasksQuery = useQuery({
    queryKey: ['tasks', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchTasks(scopeId!),
    refetchInterval,
    refetchOnWindowFocus,
  })

  const tagsQuery = useQuery({
    queryKey: ['tags', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchTags(scopeId!),
    refetchInterval,
    refetchOnWindowFocus,
  })

  const taskTagsQuery = useQuery({
    queryKey: ['task-tags', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchTaskTags(scopeId!),
    refetchInterval,
    refetchOnWindowFocus,
  })

  const depsQuery = useQuery({
    queryKey: ['task-deps', scopeId],
    enabled: Boolean(scopeId),
    queryFn: () => fetchTaskDependencies(scopeId!),
    refetchInterval,
    refetchOnWindowFocus,
  })

  useEffect(() => {
    if (!scopeId) return
    const supabase = getSupabase()
    const invalidateAll = () => {
      void qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      void qc.invalidateQueries({ queryKey: ['tags', scopeId] })
      void qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
      void qc.invalidateQueries({ queryKey: ['task-deps', scopeId] })
    }
    const channel = supabase
      .channel(`scope-data:${scopeId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `scope_id=eq.${scopeId}` },
        invalidateAll,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tags', filter: `scope_id=eq.${scopeId}` },
        invalidateAll,
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_tags' }, () => {
        void qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_dependencies',
          filter: `scope_id=eq.${scopeId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ['task-deps', scopeId] }),
      )
      .subscribe((status) => {
        // If Realtime fails silently, polling above still keeps data fresh
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[realtime] scope channel', status)
        }
      })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [scopeId, qc])

  return { tasksQuery, tagsQuery, taskTagsQuery, depsQuery }
}

export function useAddTaskDependency(scopeId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { blockedTaskId: string; blockerTaskId: string }) => {
      const row = await addTaskDependency({
        scopeId,
        blockedTaskId: input.blockedTaskId,
        blockerTaskId: input.blockerTaskId,
        createdBy: user?.id,
      })
      let github: { github_synced: boolean; reason?: string | null } | null = null
      try {
        github = await syncTaskDependencyOnGitHub({
          blockedTaskId: input.blockedTaskId,
          blockerTaskId: input.blockerTaskId,
          mode: 'add',
        })
      } catch {
        github = { github_synced: false, reason: 'GitHub sync failed' }
      }
      return { row, github }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-deps', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
    },
  })
}

export function useRemoveTaskDependency(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      blockedTaskId: string
      blockerTaskId: string
    }) => {
      await removeTaskDependency(input.id)
      let github: { github_synced: boolean; reason?: string | null } | null = null
      try {
        github = await syncTaskDependencyOnGitHub({
          blockedTaskId: input.blockedTaskId,
          blockerTaskId: input.blockerTaskId,
          mode: 'remove',
        })
      } catch {
        github = { github_synced: false, reason: 'GitHub sync failed' }
      }
      return { github }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-deps', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
    },
  })
}

export function useCreateTask(scopeId: string) {
  const { user } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: {
      name: string
      description?: string | null
      endDate?: string | null
      tagIds?: string[]
      completed?: boolean
    }) =>
      createTask({
        scopeId,
        name: input.name,
        description: input.description,
        ownerId: user?.id,
        endDate: input.endDate,
      }).then(async (task) => {
        if (input.tagIds?.length) await setTaskTags(task.id, input.tagIds)
        if (input.completed) {
          await setTaskCompleted(task.id, true)
        }
        return task
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
    },
  })
}

export function useUpdateTask(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      patch: Partial<Pick<Task, 'name' | 'description' | 'rank' | 'start_date' | 'end_date'>>
      tagIds?: string[]
    }) => {
      const task = await updateTask(input.id, input.patch)
      if (input.tagIds) await setTaskTags(input.id, input.tagIds)
      return task
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
    },
  })
}

export function useToggleTaskComplete(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { taskId: string; completed: boolean }) =>
      setTaskCompleted(input.taskId, input.completed),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', scopeId] }),
  })
}

export function useSetTasksCompleted(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { ids: string[]; completed: boolean }) =>
      setTasksCompleted(input.ids, input.completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
    },
  })
}

export function useDeleteTask(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
    },
  })
}

export function useDeleteTasks(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => deleteTasks(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-deps', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-github', scopeId] })
    },
  })
}

export function useCreateTag(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createTag(scopeId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tags', scopeId] }),
  })
}

export function useDeleteTag(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tags', scopeId] })
      qc.invalidateQueries({ queryKey: ['task-tags', scopeId] })
    },
  })
}

export function useReorderTasks(scopeId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderTasks(orderedIds),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ['tasks', scopeId] })
      const prev = qc.getQueryData<Task[]>(['tasks', scopeId])
      if (prev) {
        const byId = new Map(prev.map((t) => [t.id, t]))
        const next = orderedIds
          .map((id, rank) => {
            const t = byId.get(id)
            return t ? { ...t, rank } : null
          })
          .filter(Boolean) as Task[]
        // keep tasks not in ordered list (e.g. filtered out) with their ranks
        for (const t of prev) {
          if (!orderedIds.includes(t.id)) next.push(t)
        }
        qc.setQueryData(['tasks', scopeId], next)
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks', scopeId], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', scopeId] }),
  })
}
