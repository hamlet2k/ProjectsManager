import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '@/app/providers/AuthProvider'
import {
  useCreateScope,
  useDeleteScope,
  useScopes,
  useUpdateScope,
} from '@/features/scopes/hooks'
import { exportScopeTasksText, reorderScopes } from '@/features/scopes/api'
import { fetchGitHubFlagsForScopes } from '@/features/github/api'
import { ScopeFormModal } from '@/features/scopes/components/ScopeFormModal'
import { ShareModal } from '@/features/scopes/components/ShareModal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageLoader } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { Scope } from '@/lib/supabase/types'
import { copyToClipboard, cn } from '@/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icons } from '@/components/icons'

type ScopeCard = Scope & { role: 'owner' | 'viewer' | 'editor'; share_status?: string }

export function DashboardPage() {
  const { profile, user } = useAuth()
  const { data: scopes = [], isLoading, error } = useScopes()
  const createScope = useCreateScope()
  const updateScope = useUpdateScope()
  const deleteScope = useDeleteScope()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Scope | null>(null)
  const [shareScopeId, setShareScopeId] = useState<string | null>(null)

  const ownedIds = useMemo(
    () => scopes.filter((s) => s.role === 'owner').map((s) => s.id),
    [scopes],
  )

  const scopeIds = useMemo(() => scopes.map((s) => s.id), [scopes])
  const ghFlagsQuery = useQuery({
    queryKey: ['scope-github-flags', user?.id, scopeIds.join(',')],
    enabled: Boolean(user?.id && scopeIds.length),
    queryFn: () => fetchGitHubFlagsForScopes(scopeIds),
    staleTime: 30_000,
  })
  const githubIntegratedIds = ghFlagsQuery.data?.integratedIds ?? new Set<string>()

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => reorderScopes(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scopes', user?.id] }),
    onError: (e) => toast.push(e instanceof Error ? e.message : 'Reorder failed', 'error'),
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = scopes.map((s) => s.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    // Only persist order among owned scopes; keep shared ones interleaved visually
    const next = arrayMove(ids, oldIndex, newIndex)
    const ownedOrder = next.filter((id) => ownedIds.includes(id))
    if (ownedOrder.length) reorderMut.mutate(ownedOrder)
    // optimistic local sort via cache
    const byId = new Map(scopes.map((s) => [s.id, s]))
    const reordered = next.map((id) => byId.get(id)!).filter(Boolean)
    qc.setQueryData(['scopes', user?.id], reordered)
  }

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Select a project to view and manage its tasks.
            {profile?.name ? ` — Hi ${profile.name}` : null}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
        >
          <Icons.Plus size={16} /> Add project
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-danger)]">
          Failed to load projects: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      ) : null}

      {scopes.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project, then add tasks and invite family with a link."
          action={
            <Button
              onClick={() => {
                setEditing(null)
                setModalOpen(true)
              }}
            >
              Create your first project
            </Button>
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={scopes.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {scopes.map((scope) => (
                <SortableScopeCard
                  key={scope.id}
                  scope={scope as ScopeCard}
                  githubIntegrated={githubIntegratedIds.has(scope.id)}
                  onEdit={() => {
                    setEditing(scope)
                    setModalOpen(true)
                  }}
                  onShare={() => setShareScopeId(scope.id)}
                  onDelete={async () => {
                    const ok = await confirm({
                      title: 'Delete project?',
                      message: `Delete “${scope.name}” and all of its tasks? This cannot be undone.`,
                      confirmLabel: 'Delete project',
                      cancelLabel: 'Cancel',
                      danger: true,
                    })
                    if (!ok) return
                    try {
                      await deleteScope.mutateAsync(scope.id)
                      toast.push('Project deleted', 'success')
                    } catch (e) {
                      toast.push(e instanceof Error ? e.message : 'Delete failed', 'error')
                    }
                  }}
                  onCopy={async () => {
                    try {
                      const text = await exportScopeTasksText(scope.id)
                      const ok = await copyToClipboard(text || `(no tasks) ${scope.name}`)
                      toast.push(ok ? 'Tasks copied' : 'Copy failed', ok ? 'success' : 'error')
                    } catch (e) {
                      toast.push(e instanceof Error ? e.message : 'Copy failed', 'error')
                    }
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <ScopeFormModal
        open={modalOpen}
        initial={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={async (values) => {
          try {
            if (editing) {
              await updateScope.mutateAsync({
                id: editing.id,
                name: values.name,
                description: values.description || null,
              })
              toast.push('Project updated', 'success')
            } else {
              await createScope.mutateAsync(values)
              toast.push('Project created', 'success')
            }
          } catch (e) {
            toast.push(e instanceof Error ? e.message : 'Save failed', 'error')
            throw e
          }
        }}
      />

      {shareScopeId ? (
        <ShareModal
          open
          onClose={() => setShareScopeId(null)}
          scopeId={shareScopeId}
        />
      ) : null}
    </div>
  )
}

function SortableScopeCard({
  scope,
  githubIntegrated,
  onEdit,
  onShare,
  onDelete,
  onCopy,
}: {
  scope: ScopeCard
  githubIntegrated: boolean
  onEdit: () => void
  onShare: () => void
  onDelete: () => void
  onCopy: () => void
}) {
  const isOwner = scope.role === 'owner'
  const isShared = scope.role !== 'owner'
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scope.id,
    disabled: !isOwner,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={cn('scope-card', isDragging && 'opacity-90 shadow-lg')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn('grip', !isOwner && 'opacity-30')}
            title={isOwner ? 'Drag to reorder' : 'Only owners can reorder'}
            {...(isOwner ? { ...attributes, ...listeners } : {})}
          >
            <Icons.Grip />
          </button>
          {githubIntegrated ? (
            <span className="pill-badge" title="Linked to a GitHub repository">
              <Icons.Github size={12} /> GitHub
            </span>
          ) : null}
          {isShared ? (
            <span className="pill-badge" title={`Shared with you as ${scope.role}`}>
              Shared
            </span>
          ) : null}
        </div>
        <div className="flex gap-1">
          <button type="button" className="icon-btn" title="Copy tasks" onClick={onCopy}>
            <Icons.Clipboard />
          </button>
          {isOwner ? (
            <button type="button" className="icon-btn" title="Share" onClick={onShare}>
              <Icons.Share />
            </button>
          ) : null}
          {isOwner ? (
            <button type="button" className="icon-btn" title="Settings" onClick={onEdit}>
              <Icons.Settings />
            </button>
          ) : null}
          {isOwner ? (
            <button type="button" className="icon-btn danger" title="Delete" onClick={onDelete}>
              <Icons.Trash />
            </button>
          ) : null}
        </div>
      </div>

      <Link to={`/projects/${scope.id}`} className="mt-1 block min-w-0">
        <h2 className="project-title truncate text-lg font-bold hover:underline">{scope.name}</h2>
        {scope.description ? (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted)]">{scope.description}</p>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-muted)] opacity-60">No description</p>
        )}
      </Link>
    </article>
  )
}
