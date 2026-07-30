import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { copyToClipboard, cn } from '@/lib/utils'
import { Icons } from '@/components/icons'
import type { Tag, Task, TaskGitHubConfig, TaskTag } from '@/lib/supabase/types'
import {
  type ExportTaskRow,
  type TransferFormat,
  downloadTextFile,
  exportFileExtension,
  exportMime,
  filterExportRows,
  loadTransferPrefs,
  parseImportText,
  saveTransferPrefs,
  serializeTasks,
  slugifyFilename,
  type ParsedImportTask,
} from '@/features/tasks/transfer/formats'

type Mode = 'export' | 'import'

type Props = {
  open: boolean
  onClose: () => void
  mode?: Mode
  projectName: string
  /** Tasks to export (filtered list from parent, or all). */
  tasks: Task[]
  tags: Tag[]
  taskTags: TaskTag[]
  githubByTask?: Map<string, TaskGitHubConfig>
  canImport: boolean
  onImport: (tasks: ParsedImportTask[]) => Promise<void>
  /** Optional: open focused on a subset (e.g. one group). */
  initialTaskIds?: string[] | null
}

const FORMAT_OPTIONS: { id: TransferFormat; label: string; hint: string }[] = [
  { id: 'plain', label: 'Names only', hint: 'One title per line' },
  { id: 'checklist', label: 'Checklist', hint: 'Markdown [ ] lines + tags' },
  { id: 'ai_backlog', label: 'AI backlog', hint: 'Markdown for coding agents' },
  { id: 'json', label: 'JSON', hint: 'Structured package' },
  { id: 'csv', label: 'CSV', hint: 'Spreadsheet-friendly' },
]

export function TaskTransferModal({
  open,
  onClose,
  mode: initialMode = 'export',
  projectName,
  tasks,
  tags,
  taskTags,
  githubByTask,
  canImport,
  onImport,
  initialTaskIds = null,
}: Props) {
  const toast = useToast()
  const prefs = useMemo(() => loadTransferPrefs(), [open])

  const [mode, setMode] = useState<Mode>(initialMode)
  const [format, setFormat] = useState<TransferFormat>(prefs.format)
  const [fullMetadata, setFullMetadata] = useState(prefs.fullMetadata)
  const [includeCompleted, setIncludeCompleted] = useState(true)
  const [aiInstructions, setAiInstructions] = useState(prefs.aiInstructions)
  const [busy, setBusy] = useState(false)

  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<ParsedImportTask[]>([])
  const [importFormat, setImportFormat] = useState<string>('unknown')
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    const p = loadTransferPrefs()
    setMode(initialMode)
    setFormat(p.format)
    setFullMetadata(p.fullMetadata)
    setAiInstructions(p.aiInstructions)
    setIncludeCompleted(true)
    setImportText('')
    setImportPreview([])
    setImportFormat('unknown')
    setImportWarnings([])
  }, [open, initialMode])

  const tagNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const t of tags) m.set(t.id, t.name)
    return m
  }, [tags])

  const tagsByTask = useMemo(() => {
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

  const exportRows: ExportTaskRow[] = useMemo(() => {
    let list = tasks
    if (initialTaskIds?.length) {
      const set = new Set(initialTaskIds)
      list = list.filter((t) => set.has(t.id))
    }
    // Parent already passes filtered or full; useFilteredOnly only matters if parent passed all
    // and we re-filter completed via includeCompleted.
    return list.map((task) => ({
      task,
      tagNames: tagsByTask.get(task.id) ?? [],
      github: githubByTask?.get(task.id) ?? null,
    }))
  }, [tasks, initialTaskIds, tagsByTask, githubByTask])

  const exportText = useMemo(
    () =>
      serializeTasks(exportRows, {
        format,
        fullMetadata,
        includeCompleted,
        projectName,
        aiInstructions,
      }),
    [exportRows, format, fullMetadata, includeCompleted, projectName, aiInstructions],
  )

  const exportCount = filterExportRows(exportRows, includeCompleted).length

  useEffect(() => {
    if (mode !== 'import') return
    if (!importText.trim()) {
      setImportPreview([])
      setImportFormat('unknown')
      setImportWarnings([])
      return
    }
    const result = parseImportText(importText)
    setImportPreview(result.tasks)
    setImportFormat(result.format)
    setImportWarnings(result.warnings)
  }, [importText, mode])

  const persistOptions = () => {
    saveTransferPrefs({ format, fullMetadata, aiInstructions })
  }

  const handleCopy = async () => {
    persistOptions()
    const ok = await copyToClipboard(exportText)
    toast.push(
      ok ? `Copied ${exportCount} task(s) (${formatLabel(format)})` : 'Copy failed',
      ok ? 'success' : 'error',
    )
  }

  const handleDownload = () => {
    persistOptions()
    const base = slugifyFilename(projectName)
    const name = `${base}-tasks.${exportFileExtension(format)}`
    downloadTextFile(name, exportText, exportMime(format))
    toast.push(`Downloaded ${name}`, 'success')
  }

  const handleImport = async () => {
    if (!canImport || !importPreview.length) return
    setBusy(true)
    try {
      await onImport(importPreview)
      toast.push(`Imported ${importPreview.length} task(s)`, 'success')
      setImportText('')
      onClose()
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | null) => {
    if (!file) return
    const text = await file.text()
    setImportText(text)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import / Export tasks"
      size="lg"
      footer={
        mode === 'export' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="secondary" onClick={() => void handleDownload()} disabled={!exportCount}>
              <Icons.Save size={14} /> Download
            </Button>
            <Button onClick={() => void handleCopy()} disabled={!exportCount}>
              <Icons.Clipboard size={14} /> Copy
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy || !canImport || importPreview.length === 0}
              onClick={() => void handleImport()}
            >
              {busy ? 'Importing…' : `Import ${importPreview.length || ''}`.trim()}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium',
              mode === 'export'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                : 'border-[var(--color-border)]',
            )}
            onClick={() => setMode('export')}
          >
            Export
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium',
              mode === 'import'
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-fg)]'
                : 'border-[var(--color-border)]',
              !canImport && 'opacity-50',
            )}
            disabled={!canImport}
            onClick={() => canImport && setMode('import')}
            title={canImport ? 'Import tasks' : 'You need edit access to import'}
          >
            Import
          </button>
        </div>

        {mode === 'export' ? (
          <>
            <div>
              <p className="mb-2 text-sm font-medium">Format</p>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-left text-sm',
                      format === f.id
                        ? 'border-[var(--color-primary)] bg-[var(--color-surface-2)] font-semibold'
                        : 'border-[var(--color-border)]',
                    )}
                    onClick={() => setFormat(f.id)}
                    title={f.hint}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={fullMetadata}
                  onChange={(e) => setFullMetadata(e.target.checked)}
                />
                <span>
                  Full task metadata
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    Due dates, tags, descriptions, GitHub issue refs, rank
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeCompleted}
                  onChange={(e) => setIncludeCompleted(e.target.checked)}
                />
                <span>Include completed tasks</span>
              </label>
              {initialTaskIds?.length ? (
                <p className="text-xs text-[var(--color-muted)]">
                  Exporting {initialTaskIds.length} selected task
                  {initialTaskIds.length === 1 ? '' : 's'} (e.g. tag group).
                </p>
              ) : (
                <p className="text-xs text-[var(--color-muted)]">
                  Exports all tasks in this project. Use board filters first if you only want a
                  subset visible, then open Import / Export from a tag group header for group-only
                  export.
                </p>
              )}
            </div>

            {format === 'ai_backlog' ? (
              <Field label="Instructions for the AI">
                <Textarea
                  className="min-h-[88px]"
                  value={aiInstructions}
                  onChange={(e) => setAiInstructions(e.target.value)}
                  placeholder="What should an AI coding agent do with this backlog?"
                />
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Included under <strong>Instructions for the AI</strong> in the markdown export.
                  Paste into Cursor, Codex, Claude, etc.
                </p>
              </Field>
            ) : null}

            <Field label={`Preview (${exportCount} task${exportCount === 1 ? '' : 's'})`}>
              <textarea
                className="field-input min-h-[200px] font-mono text-xs"
                readOnly
                value={exportText}
              />
            </Field>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-muted)]">
              Paste a list, checklist, AI backlog markdown, JSON package, or CSV. Format is detected
              automatically. Leading bullets and <code>[ ]</code> markers are stripped for plain
              lists.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface-2)]">
                <Icons.Paste size={14} />
                Upload file
                <input
                  type="file"
                  accept=".txt,.md,.json,.csv,text/plain,text/markdown,application/json,text/csv"
                  className="hidden"
                  onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {importFormat !== 'unknown' && importText.trim() ? (
                <span className="text-xs text-[var(--color-muted)]">
                  Detected: <strong className="text-[var(--color-text)]">{importFormat}</strong>
                </span>
              ) : null}
            </div>
            <textarea
              className="field-input min-h-[160px] font-mono text-sm"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'Buy milk\nCall plumber\n- Fix fence'}
              disabled={busy}
            />
            {importWarnings.length ? (
              <ul className="text-xs text-[var(--color-muted)]">
                {importWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
            {importPreview.length > 0 ? (
              <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Preview ({importPreview.length})
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {importPreview.slice(0, 40).map((t, i) => (
                    <li key={`${t.name}-${i}`} className="truncate">
                      {t.completed ? '✓ ' : ''}
                      {t.name}
                      {t.tagNames?.length ? (
                        <span className="text-[var(--color-muted)]">
                          {' '}
                          {t.tagNames.map((n) => `#${n}`).join(' ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                  {importPreview.length > 40 ? (
                    <li className="text-[var(--color-muted)]">
                      …and {importPreview.length - 40} more
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Modal>
  )
}

function formatLabel(f: TransferFormat): string {
  return FORMAT_OPTIONS.find((x) => x.id === f)?.label ?? f
}
