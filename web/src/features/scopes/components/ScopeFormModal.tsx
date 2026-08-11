import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import type { Scope } from '@/lib/supabase/types'
import { generateProjectPrompt } from '@/features/assistant/api'
import { Icons } from '@/components/icons'
import { HelpHint, HelpSlugs } from '@/features/help'

export type ScopeFormValues = {
  name: string
  description: string
  /** Project UX: dependency tools (default on). */
  dependenciesEnabled: boolean
  /** Project UX: full export modal from copy (default on). */
  advancedExportEnabled: boolean
  /** Project AI instructions for the voice assistant. */
  assistantPrompt: string
}

export type ScopeFormGithubProps = {
  visible: boolean
  integrated: boolean
  repoLabel: string | null
  canConfigure: boolean
  preferenceOn: boolean
  onConfigure: () => void
}

type Props = {
  open: boolean
  onClose: () => void
  initial?: Scope | null
  /** Existing tag names — helps the LLM generate a better project prompt. */
  existingTagNames?: string[]
  /** Optional GitHub block (edit project only). Null/omit for create or no access. */
  github?: ScopeFormGithubProps | null
  onSubmit: (values: ScopeFormValues) => Promise<void>
}

export function ScopeFormModal({
  open,
  onClose,
  initial,
  existingTagNames = [],
  github = null,
  onSubmit,
}: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dependenciesEnabled, setDependenciesEnabled] = useState(true)
  const [advancedExportEnabled, setAdvancedExportEnabled] = useState(true)
  const [assistantPrompt, setAssistantPrompt] = useState('')
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [githubOpen, setGithubOpen] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setDependenciesEnabled(initial?.dependencies_enabled !== false)
      setAdvancedExportEnabled(initial?.advanced_export_enabled !== false)
      setAssistantPrompt(initial?.assistant_prompt ?? '')
      setError(null)
      // Expand GitHub section when already linked so status is visible; collapse when unused
      setGithubOpen(Boolean(github?.integrated))
    }
  }, [open, initial, github?.integrated])

  /**
   * Uses the project description as the source brief:
   * generates a polished voice-assistant prompt and optionally cleans up the description.
   */
  const runGenerate = async () => {
    const brief = description.trim() || name.trim()
    if (!brief || !initial?.id) {
      setError(
        initial?.id
          ? 'Write a project description first (what the project is about, tags, terminology).'
          : 'Save the project first, then edit it to generate an AI prompt.',
      )
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await generateProjectPrompt({
        scopeId: initial.id,
        projectName: name.trim() || initial.name,
        userBrief: brief,
        tags: existingTagNames,
      })
      setAssistantPrompt(res.prompt)
      // If the model also returned a cleaned description, prefer it
      if (res.formatted_description?.trim()) {
        setDescription(res.formatted_description.trim())
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate prompt')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit project' : 'New project'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving || generating}>
            Cancel
          </Button>
          <Button
            disabled={saving || generating || !name.trim()}
            onClick={async () => {
              setSaving(true)
              setError(null)
              try {
                await onSubmit({
                  name: name.trim(),
                  description: description.trim(),
                  dependenciesEnabled,
                  advancedExportEnabled,
                  assistantPrompt: assistantPrompt.trim(),
                })
                onClose()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to save')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="scope-name" error={error ?? undefined}>
          <Input
            id="scope-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home renovations"
            autoFocus
          />
        </Field>
        <Field label="Description" htmlFor="scope-desc">
          <Textarea
            id="scope-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this project is about — used as the source for the AI voice prompt (e.g. shopping list; tags are store names)."
            className="min-h-[100px]"
            disabled={generating || saving}
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            This description is the brief for “Generate AI prompt” (terminology, tags, how you work).
          </p>
        </Field>

        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
            Project tools
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={dependenciesEnabled}
              onChange={(e) => setDependenciesEnabled(e.target.checked)}
            />
            <span>
              Task dependencies
              <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                Blocked-by / blocks pills and manage button.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={advancedExportEnabled}
              onChange={(e) => setAdvancedExportEnabled(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="inline-flex items-center gap-1">
                Advanced export on copy
                <HelpHint
                  slug={HelpSlugs.importExport}
                  label="Import and export help"
                  className="!h-5 !w-5"
                />
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                When on, copy opens Import / Export. When off, copy pastes a simple checklist.
              </span>
            </span>
          </label>
        </div>

        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50 p-3">
          <div className="flex items-center gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              AI / voice prompt
            </p>
            <HelpHint
              slug={HelpSlugs.voice}
              label="Voice assistant and AI prompt help"
              className="!h-5 !w-5"
            />
          </div>
          <p className="text-xs text-[var(--color-muted)]">
            Generate a tuned assistant prompt from the project description, refine it, then Save.
            Voice and “enhance task” use this prompt.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={generating || saving || !initial?.id || !description.trim()}
              onClick={() => void runGenerate()}
              title={
                !initial?.id
                  ? 'Save the project once, then edit to generate'
                  : !description.trim()
                    ? 'Add a description first'
                    : 'Format description into a voice-assistant prompt'
              }
            >
              <Icons.Sparkles size={14} />
              {generating ? 'Generating…' : 'Generate AI prompt'}
            </Button>
          </div>
          <Field label="Saved AI prompt (used by voice)" htmlFor="scope-ai-prompt">
            <Textarea
              id="scope-ai-prompt"
              value={assistantPrompt}
              onChange={(e) => setAssistantPrompt(e.target.value)}
              placeholder="Generated or hand-written instructions for the voice assistant…"
              className="min-h-[120px]"
              disabled={generating || saving}
            />
          </Field>
        </div>

        {github?.visible && initial?.id ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/50">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
              onClick={() => setGithubOpen((v) => !v)}
              aria-expanded={githubOpen}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Icons.Github size={14} className="shrink-0" />
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  GitHub
                </span>
                {github.integrated && github.repoLabel ? (
                  <span className="truncate text-xs font-normal normal-case tracking-normal text-[var(--color-text)]">
                    · {github.repoLabel}
                  </span>
                ) : (
                  <span className="text-xs font-normal normal-case tracking-normal text-[var(--color-muted)]">
                    · optional
                  </span>
                )}
              </span>
              <Icons.ChevronDown
                size={14}
                className={githubOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
              />
            </button>
            {githubOpen ? (
              <div className="space-y-3 border-t border-[var(--color-border)] px-3 py-3">
                <div className="flex items-start gap-1">
                  <p className="min-w-0 flex-1 text-xs text-[var(--color-muted)]">
                    Link one repository for create/sync of issues on this board. Not required for
                    normal task tracking.
                  </p>
                  <HelpHint
                    slug={HelpSlugs.githubProject}
                    label="How to link this project to GitHub"
                    className="!h-5 !w-5 shrink-0"
                  />
                </div>
                {github.integrated ? (
                  <p className="text-sm text-[var(--color-text)]">
                    Linked to{' '}
                    <strong className="font-medium">{github.repoLabel ?? 'a repository'}</strong>.
                  </p>
                ) : github.preferenceOn ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    No repository linked for this project yet.
                  </p>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">
                    Enable GitHub integration and save a token under Settings, then return here to
                    link a repository.
                  </p>
                )}
                {github.canConfigure ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={generating || saving}
                    onClick={() => github.onConfigure()}
                  >
                    <Icons.Github size={14} />
                    {github.integrated ? 'Configure GitHub…' : 'Link GitHub repository…'}
                  </Button>
                ) : (
                  <p className="text-xs text-[var(--color-muted)]">
                    You can view this project’s GitHub link but need editor access to change it.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
