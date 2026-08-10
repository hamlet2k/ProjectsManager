import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { Tag, Task } from '@/lib/supabase/types'
import type { TaskBoardViewPatch } from '@/features/tasks/components/TaskBoard'
import { planAssistantActions, transcribeAudio, type AssistantPlan } from './api'
import { executeAssistantPlan, type ExecuteResult } from './executePlan'
import {
  blobToBase64,
  canUseVoiceInput,
  checkSpeechEnvironment,
  collapseSpeechStutter,
  extensionForAudioMime,
  getSpeechRecognitionCtor,
  isAndroidBrowser,
  micAccessMessage,
  mergeSpeechFinals,
  shouldUseServerStt,
  speechUnsupportedMessage,
  startAudioCapture,
  type AudioCaptureSession,
  type SpeechRecognitionLike,
} from './speech'

export type VoiceAssistantProps = {
  open: boolean
  onClose: () => void
  scopeId: string
  projectName: string
  tasks: Task[]
  tags: Tag[]
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
  setTaskTags: (taskId: string, tagIds: string[]) => Promise<void>
  updateTask: (input: {
    id: string
    name?: string
    description?: string | null
    endDate?: string | null
  }) => Promise<Task>
  applyView?: (patch: TaskBoardViewPatch) => string[]
  projectPrompt?: string | null
  onFocusTask?: (taskId: string) => void
  /** Called after a plan is executed (or an ambiguous pick is resolved). */
  onDone?: (result?: ExecuteResult) => void
}

export function VoiceAssistant({
  open,
  onClose,
  scopeId,
  projectName,
  tasks,
  tags,
  tagsByTask,
  canEdit,
  createTask,
  createTag,
  setCompleted,
  setTaskTags,
  updateTask,
  applyView,
  projectPrompt = null,
  onFocusTask,
  onDone,
}: VoiceAssistantProps) {
  const [transcript, setTranscript] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<AssistantPlan | null>(null)
  const [result, setResult] = useState<ExecuteResult | null>(null)
  const [sttSupported, setSttSupported] = useState(() => canUseVoiceInput())
  const [serverStt, setServerStt] = useState(
    () => (typeof window !== 'undefined' ? shouldUseServerStt() : false),
  )
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaSessionRef = useRef<AudioCaptureSession | null>(null)
  /** Text that existed before the current Listen session (typed / prior takes). */
  const preListenRef = useRef('')
  const androidStt = typeof navigator !== 'undefined' && isAndroidBrowser()

  const stopListening = useCallback((opts?: { hard?: boolean }) => {
    const media = mediaSessionRef.current
    mediaSessionRef.current = null
    if (media) {
      try {
        if (opts?.hard) media.cancel()
        else void media.stop()
      } catch {
        /* ignore */
      }
    }
    const rec = recRef.current
    recRef.current = null
    if (rec) {
      try {
        if (opts?.hard) rec.abort()
        else rec.stop()
      } catch {
        try {
          rec.abort()
        } catch {
          /* ignore */
        }
      }
    }
    setListening(false)
  }, [])

  useEffect(() => {
    if (!open) {
      stopListening({ hard: true })
      setTranscript('')
      setError(null)
      setPlan(null)
      setResult(null)
      setBusy(false)
      preListenRef.current = ''
    }
  }, [open, stopListening])

  useEffect(() => {
    setServerStt(shouldUseServerStt())
    setSttSupported(canUseVoiceInput())
  }, [])

  const startListening = async () => {
    setError(null)
    setResult(null)
    setPlan(null)

    if (serverStt || shouldUseServerStt()) {
      setServerStt(true)
      stopListening({ hard: true })
      preListenRef.current = transcript.trim()
      const started = await startAudioCapture()
      if (!started.ok) {
        setError(micAccessMessage(started.reason))
        if (started.reason === 'denied' || started.reason === 'unsupported') {
          setSttSupported(false)
        }
        return
      }
      mediaSessionRef.current = started.session
      setSttSupported(true)
      setListening(true)
      return
    }

    const env = checkSpeechEnvironment()
    if (env !== 'ok') {
      if (env === 'unsupported') setSttSupported(false)
      setError(micAccessMessage(env))
      return
    }

    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSttSupported(false)
      setError(speechUnsupportedMessage())
      return
    }
    setSttSupported(true)
    stopListening()
    preListenRef.current = transcript.trim()
    const rec = new Ctor()
    // Android Chrome: continuous + interim often emits progressive "finals"
    rec.continuous = !androidStt
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.lang = navigator.language || 'en-US'
    rec.onresult = (ev) => {
      const finals: string[] = []
      let interim = ''
      for (let i = 0; i < ev.results.length; i++) {
        const piece = ev.results[i]![0]!.transcript ?? ''
        if (ev.results[i]!.isFinal) finals.push(piece)
        else interim += piece
      }
      const sessionFinal = collapseSpeechStutter(mergeSpeechFinals(finals))
      const sessionInterim = interim.replace(/\s+/g, ' ').trim()
      const display = [preListenRef.current, sessionFinal, sessionInterim]
        .filter(Boolean)
        .join(' ')
      setTranscript(collapseSpeechStutter(display))
    }
    rec.onerror = (ev) => {
      if (ev.error === 'aborted' || ev.error === 'no-speech') return
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setError(micAccessMessage('denied'))
        setListening(false)
        setSttSupported(false)
        return
      }
      if (ev.error === 'network') {
        setError('Speech service network error. Check connection or type instead.')
        setListening(false)
        return
      }
      setError(`Speech error: ${ev.error ?? 'unknown'}`)
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
      setTranscript((t) => collapseSpeechStutter(t))
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('Could not start the microphone. Try again or type instead.')
      setListening(false)
    }
  }

  const stopAndTranscribe = async () => {
    const session = mediaSessionRef.current
    mediaSessionRef.current = null
    setListening(false)
    if (!session) return
    setBusy(true)
    setError(null)
    try {
      const blob = await session.stop()
      if (!blob || blob.size < 200) {
        setError('Recording too short — hold Listen and speak a bit longer.')
        return
      }
      const mime = blob.type || 'audio/webm'
      const audioBase64 = await blobToBase64(blob)
      const lang = (navigator.language || 'en').slice(0, 2)
      const { text: raw } = await transcribeAudio({
        scopeId,
        audioBase64,
        mimeType: mime,
        fileName: `voice.${extensionForAudioMime(mime)}`,
        language: lang,
      })
      const piece = collapseSpeechStutter(raw.trim())
      if (!piece) {
        setError('Heard nothing — speak clearly and try again, or type below.')
        return
      }
      setTranscript(
        collapseSpeechStutter([preListenRef.current, piece].filter(Boolean).join(' ')),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transcription failed')
    } finally {
      setBusy(false)
    }
  }

  const runAssistant = async () => {
    const text = collapseSpeechStutter(transcript.trim())
    if (!text || busy) return
    if (text !== transcript.trim()) setTranscript(text)
    stopListening()
    setBusy(true)
    setError(null)
    setResult(null)
    setPlan(null)
    try {
      const taskBriefs = tasks.map((t) => ({
        id: t.id,
        name: t.name,
        completed: t.completed,
        tags: tagsByTask.get(t.id) ?? [],
      }))
      const planned = await planAssistantActions({
        scopeId,
        projectName,
        transcript: text,
        tasks: taskBriefs,
        tags: tags.map((t) => t.name),
        projectPrompt,
      })
      setPlan(planned)

      const deps = {
        scopeId,
        tasks,
        tags,
        tagsByTask,
        canEdit,
        createTask,
        createTag,
        setCompleted,
        setTaskTags,
        updateTask,
        applyView,
      }
      const executed = await executeAssistantPlan(planned, deps)
      setResult(executed)
      if (executed.focusedTaskId) onFocusTask?.(executed.focusedTaskId)
      onDone?.(executed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assistant failed')
    } finally {
      setBusy(false)
    }
  }

  const resolveAmbiguous = async (
    task: Task,
    amb: NonNullable<ExecuteResult['ambiguous']>[number],
  ) => {
    setBusy(true)
    setError(null)
    try {
      const deps = {
        scopeId,
        tasks,
        tags,
        tagsByTask,
        canEdit,
        createTask,
        createTag,
        setCompleted,
        setTaskTags,
        updateTask,
        applyView,
      }
      let lines: string[] = []
      if (amb.action === 'complete' || amb.action === 'uncomplete') {
        await setCompleted(task.id, amb.action === 'complete')
        lines = [
          amb.action === 'complete'
            ? `Completed “${task.name}”`
            : `Reopened “${task.name}”`,
        ]
      } else if (amb.action === 'add_tags' && amb.tag_names?.length) {
        const executed = await executeAssistantPlan(
          {
            summary: '',
            actions: [{ type: 'add_tags', task_id: task.id, tag_names: amb.tag_names }],
          },
          deps,
        )
        lines = executed.summaryLines
        if (executed.errors.length) throw new Error(executed.errors.join(' · '))
      } else if (amb.action === 'update_task' && amb.pending) {
        const { match: _m, ...rest } = amb.pending
        const executed = await executeAssistantPlan(
          {
            summary: '',
            actions: [{ ...rest, type: 'update_task', task_id: task.id }],
          },
          deps,
        )
        lines = executed.summaryLines
        if (executed.errors.length) throw new Error(executed.errors.join(' · '))
      }
      onFocusTask?.(task.id)
      const resolved: ExecuteResult = {
        summaryLines: lines,
        focusedTaskId: task.id,
        ambiguous: (result?.ambiguous ?? []).filter(
          (a) => !(a.match === amb.match && a.action === amb.action),
        ),
        errors: result?.errors ?? [],
      }
      setResult((prev) => ({
        summaryLines: [...(prev?.summaryLines ?? []), ...resolved.summaryLines],
        focusedTaskId: task.id,
        ambiguous: resolved.ambiguous,
        errors: prev?.errors ?? [],
      }))
      onDone?.(resolved)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return
        stopListening()
        onClose()
      }}
      title="Voice assistant"
      size="md"
      footer={
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              stopListening()
              onClose()
            }}
          >
            Close
          </Button>
          <Button
            disabled={busy || !transcript.trim() || !canEdit}
            onClick={() => void runAssistant()}
          >
            {busy ? 'Working…' : 'Do it'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">
          Speak or type casually for project <strong className="text-[var(--color-text)]">{projectName}</strong>.
          Examples: “add buy milk and eggs”, “mark the fence task done”, “add call plumber under #home
          for tomorrow”. Tip: hold the floating mic for hands-free push-to-talk.
        </p>

        {!canEdit ? (
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
            View-only access — the assistant cannot change tasks.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={listening ? 'danger' : 'secondary'}
            disabled={busy || !canEdit || !sttSupported}
            onClick={() => {
              if (listening) {
                if (serverStt || mediaSessionRef.current) void stopAndTranscribe()
                else stopListening()
              } else void startListening()
            }}
            title={sttSupported ? (listening ? 'Stop listening' : 'Start microphone') : 'Mic not supported'}
          >
            <Icons.Mic className={cn(listening && 'animate-pulse')} />
            {listening ? 'Stop' : 'Listen'}
          </Button>
          {!sttSupported ? (
            <span className="text-xs text-[var(--color-muted)]">
              Mic unavailable here — type below (Chrome/Edge work best).
            </span>
          ) : (
            <span className="text-xs text-[var(--color-muted)]">
              {listening
                ? serverStt
                  ? 'Recording… tap Stop when done (text appears after)'
                  : androidStt
                    ? 'Listening… speak, then pause (tap Listen again if needed)'
                    : 'Listening… speak naturally'
                : serverStt
                  ? 'Tap Listen, speak, Stop → text, then Do it (iOS)'
                  : androidStt
                    ? 'Tap Listen, speak one phrase, then Do it'
                    : 'Tap Listen, then Do it'}
            </span>
          )}
        </div>

        <Textarea
          className="min-h-[100px]"
          value={transcript}
          disabled={busy}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Or type what you want done…"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              void runAssistant()
            }
          }}
        />

        {error ? (
          <p className="text-sm text-[var(--color-danger,#b91c1c)]" role="alert">
            {error}
          </p>
        ) : null}

        {plan?.needs_clarification && result && result.summaryLines.length === 0 ? (
          <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm">
            {plan.needs_clarification}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
            {result.summaryLines.length ? (
              <ul className="list-inside list-disc text-sm">
                {result.summaryLines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : null}
            {result.errors.map((e) => (
              <p key={e} className="text-sm text-[var(--color-danger,#b91c1c)]">
                {e}
              </p>
            ))}
            {result.ambiguous.map((a) => (
              <div key={`${a.action}-${a.match}`} className="space-y-1.5">
                <p className="text-sm font-medium">
                  {a.action === 'add_tags'
                    ? `Tag which task “${a.match}”?`
                    : a.action === 'update_task'
                      ? `Update which task “${a.match}”?`
                      : `Which task for “${a.match}”?`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.candidates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="tag-chip active"
                      disabled={busy}
                      onClick={() => void resolveAmbiguous(t, a)}
                    >
                      {t.name}
                      {t.completed ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
