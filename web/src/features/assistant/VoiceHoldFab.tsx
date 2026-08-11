import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { Icons } from '@/components/icons'
import { cn } from '@/lib/utils'
import type { Tag, Task } from '@/lib/supabase/types'
import type { TaskBoardViewPatch } from '@/features/tasks/components/TaskBoard'
import { planAssistantActions, type AssistantPlan } from './api'
import { executeAssistantPlan, type ExecuteResult } from './executePlan'
import {
  checkSpeechEnvironment,
  collapseSpeechStutter,
  getSpeechRecognitionCtor,
  micAccessMessage,
  mergeSpeechFinals,
  prefersNonContinuousSpeech,
  releaseCountdownMs,
  speechRecognitionLang,
  speechUnsupportedMessage,
  transcriptFromSpeechEvent,
  type SpeechRecognitionLike,
} from './speech'
import { eventMatchesBinding, formatBinding } from '@/lib/keyboardPrefs'
import { isTypingTarget } from '@/lib/keyboardShortcuts'
import { HelpHint, HelpSlugs } from '@/features/help'

export type VoiceHoldFabProps = {
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
  /** Per-project AI instructions */
  projectPrompt?: string | null
  onFocusTask?: (taskId: string) => void
  /** followUp: keep panel open — parent should refresh data but skip success toasts */
  onDone?: (result?: ExecuteResult, meta?: { followUp?: boolean }) => void
  /** Hide when the full Voice modal is open */
  hidden?: boolean
}

type Phase =
  | 'idle'
  | 'holding'
  | 'locked'
  /** Waiting for Web Speech onend after release (iPad delivers text late) */
  | 'finalizing'
  | 'countdown'
  | 'editing'
  | 'busy'
  /** Success needs user input (ambiguity / clarification); mic ready for next hold */
  | 'followup'

type HistoryEntry = {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
}

const LOCK_SLIDE_PX = 56

function needsFollowUp(
  plan: AssistantPlan | null,
  executed: ExecuteResult | null,
  runError: string | null,
): boolean {
  if (runError) return true
  if (!executed) return false
  // Pick-a-task chips
  if (executed.ambiguous.length > 0) return true
  // LLM asked a question (often also copied into summaryLines by executePlan)
  if (plan?.needs_clarification) return true
  // Nothing actually applied — stay open so the user can rephrase
  const actionCount = plan?.actions?.length ?? 0
  if (actionCount === 0 && !executed.focusedTaskId) return true
  // Soft failures with no successful lines
  if (executed.errors.length > 0 && executed.summaryLines.length === 0) return true
  return false
}

function assistantHistoryText(plan: AssistantPlan | null, executed: ExecuteResult): string {
  const parts: string[] = []
  if (executed.summaryLines.length) {
    parts.push(...executed.summaryLines)
  } else if (plan?.needs_clarification) {
    parts.push(plan.needs_clarification)
  }
  if (executed.ambiguous.length) {
    for (const a of executed.ambiguous) {
      // Avoid duplicating if summary already asked
      const line = `Which task for “${a.match}”?`
      if (!parts.some((p) => p.includes(a.match))) parts.push(line)
    }
  }
  if (executed.errors.length) parts.push(...executed.errors)
  return parts.join('\n') || 'OK'
}

export function VoiceHoldFab({
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
  hidden,
}: VoiceHoldFabProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExecuteResult | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [countdownMs, setCountdownMs] = useState(0)
  const [lockHint, setLockHint] = useState(false)
  const [sttOk, setSttOk] = useState(() => Boolean(getSpeechRecognitionCtor()))

  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const preListenRef = useRef('')
  const phaseRef = useRef<Phase>('idle')
  const transcriptRef = useRef('')
  const pointerIdRef = useRef<number | null>(null)
  const startXRef = useRef(0)
  const lockedRef = useRef(false)
  /** True while finger/key is down — Sprites holdingRef pattern */
  const holdingRef = useRef(false)
  /** After release: wait for onend before reading transcript (iPad late finals) */
  const pendingFinalizeRef = useRef(false)
  const finalizeTimerRef = useRef<number | null>(null)
  const countdownTimerRef = useRef<number | null>(null)
  const countdownEndRef = useRef(0)
  const runIdRef = useRef(0)
  const histIdRef = useRef(0)
  /** Android only: continuous=false. iOS/iPad/desktop: continuous=true like Sprites. */
  const nonContinuousStt =
    typeof navigator !== 'undefined' && prefersNonContinuousSpeech()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const historyEndRef = useRef<HTMLDivElement | null>(null)

  const execDeps = useCallback(
    () => ({
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
    }),
    [
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
    ],
  )

  useEffect(() => {
    if (history.length === 0 && !result?.ambiguous?.length) return
    // Scroll panel to latest history / chips after render
    requestAnimationFrame(() => {
      historyEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      const panel = panelRef.current
      if (panel) panel.scrollTop = panel.scrollHeight
    })
  }, [history, result?.ambiguous, phase, transcript])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])
  useEffect(() => {
    setSttOk(Boolean(getSpeechRecognitionCtor()))
  }, [])

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current != null) {
      window.clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    setCountdownMs(0)
  }, [])

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current != null) {
      window.clearTimeout(finalizeTimerRef.current)
      finalizeTimerRef.current = null
    }
  }, [])

  const stopListening = useCallback((opts?: { hard?: boolean }) => {
    const rec = recRef.current
    recRef.current = null
    if (!rec) return
    try {
      // Prefer stop() — abort() can leave Android engines in a bad state
      if (opts?.hard) rec.abort()
      else rec.stop()
    } catch {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const resetSession = useCallback(() => {
    clearCountdown()
    clearFinalizeTimer()
    holdingRef.current = false
    pendingFinalizeRef.current = false
    stopListening({ hard: true })
    lockedRef.current = false
    pointerIdRef.current = null
    setPhase('idle')
    setTranscript('')
    setError(null)
    setResult(null)
    setHistory([])
    setLockHint(false)
    preListenRef.current = ''
    runIdRef.current += 1
  }, [clearCountdown, clearFinalizeTimer, stopListening])

  useEffect(() => {
    return () => {
      clearCountdown()
      clearFinalizeTimer()
      stopListening({ hard: true })
    }
  }, [clearCountdown, clearFinalizeTimer, stopListening])

  /** Set after beginCountdown is defined — onend finalizes through this. */
  const beginCountdownRef = useRef<(forcedText?: string) => void>(() => {})

  const startListening = useCallback(
    (opts?: { append?: boolean; keepFeedback?: boolean }): boolean => {
      setError(null)

      const env = checkSpeechEnvironment()
      if (env !== 'ok') {
        if (env === 'unsupported') setSttOk(false)
        setError(micAccessMessage(env))
        return false
      }

      const Ctor = getSpeechRecognitionCtor()
      if (!Ctor) {
        setSttOk(false)
        setError(speechUnsupportedMessage())
        return false
      }

      setSttOk(true)
      // Abort prior engine only (Sprites pattern)
      try {
        recRef.current?.abort()
      } catch {
        /* ignore */
      }
      recRef.current = null

      if (!opts?.append) {
        preListenRef.current = ''
        setTranscript('')
        transcriptRef.current = ''
      } else {
        preListenRef.current = transcriptRef.current.trim()
      }
      setError(null)

      const rec = new Ctor()
      // Android: continuous=false + restart. iOS/iPad/desktop: continuous=true (Sprites).
      rec.continuous = !nonContinuousStt
      rec.interimResults = true
      rec.maxAlternatives = nonContinuousStt ? 1 : 3
      rec.lang = speechRecognitionLang()

      rec.onresult = (ev) => {
        const { finals, interim, all } = transcriptFromSpeechEvent(ev)
        if (nonContinuousStt) {
          const sessionFinal = collapseSpeechStutter(mergeSpeechFinals(finals))
          const sessionInterim = interim
          const display = collapseSpeechStutter(
            [preListenRef.current, sessionFinal, sessionInterim].filter(Boolean).join(' '),
          )
          transcriptRef.current = display
          setTranscript(display)
          return
        }
        // iOS / desktop: full concat like Sprites
        const display = collapseSpeechStutter(
          [preListenRef.current, all].filter(Boolean).join(' '),
        )
        transcriptRef.current = display
        setTranscript(display)
      }

      rec.onerror = (ev) => {
        if (ev.error === 'aborted' || ev.error === 'no-speech') return
        // iOS sometimes fires network spuriously while still returning results later
        if (ev.error === 'network' && !nonContinuousStt) return
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setError(micAccessMessage('denied'))
          setSttOk(false)
          holdingRef.current = false
          return
        }
        if (ev.error === 'network') {
          setError('Speech service network error. Check connection and try again, or type instead.')
          return
        }
        setError(`Speech error: ${ev.error ?? 'unknown'}`)
      }

      rec.onend = () => {
        recRef.current = null

        // Still holding → restart engine (Sprites / Android)
        if (holdingRef.current) {
          const restart = () => {
            if (holdingRef.current) startListening({ append: true, keepFeedback: true })
          }
          if (nonContinuousStt) window.setTimeout(restart, 120)
          else {
            try {
              restart()
            } catch {
              window.setTimeout(restart, 80)
            }
          }
          return
        }

        // Released: onend runs AFTER late finals (critical for iPad) — then countdown
        if (pendingFinalizeRef.current) {
          pendingFinalizeRef.current = false
          clearFinalizeTimer()
          beginCountdownRef.current(transcriptRef.current)
          return
        }

        setTranscript((t) => collapseSpeechStutter(t))
      }

      recRef.current = rec
      try {
        rec.start()
        return true
      } catch {
        setError('Could not start the microphone. Tap again or type with Voice.')
        return false
      }
    },
    [clearFinalizeTimer, nonContinuousStt],
  )

  const pushHistory = useCallback((role: HistoryEntry['role'], text: string) => {
    const t = text.trim()
    if (!t) return
    histIdRef.current += 1
    setHistory((h) => [...h, { id: `h-${histIdRef.current}`, role, text: t }])
  }, [])

  const runAssistant = useCallback(
    async (textIn?: string) => {
      const text = collapseSpeechStutter((textIn ?? transcriptRef.current).trim())
      if (!text || !canEdit) return
      clearCountdown()
      stopListening()
      lockedRef.current = false
      setTranscript(text)
      setPhase('busy')
      setError(null)
      const myRun = ++runIdRef.current
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
        if (myRun !== runIdRef.current) return

        const executed = await executeAssistantPlan(planned, execDeps())
        if (myRun !== runIdRef.current) return

        if (executed.focusedTaskId) onFocusTask?.(executed.focusedTaskId)

        if (needsFollowUp(planned, executed, null)) {
          // Keep panel + history; refresh board if anything ran, but no success toast
          onDone?.(executed, { followUp: true })
          pushHistory('user', text)
          pushHistory('assistant', assistantHistoryText(planned, executed))
          setResult(executed)
          setTranscript('')
          transcriptRef.current = ''
          preListenRef.current = ''
          setPhase('followup')
          return
        }

        // Success — toast via onDone, then close panel
        onDone?.(executed, { followUp: false })
        resetSession()
      } catch (e) {
        if (myRun !== runIdRef.current) return
        const msg = e instanceof Error ? e.message : 'Assistant failed'
        setError(msg)
        pushHistory('user', text)
        pushHistory('error', msg)
        setTranscript('')
        transcriptRef.current = ''
        setPhase('followup')
      }
    },
    [
      canEdit,
      clearCountdown,
      execDeps,
      onDone,
      onFocusTask,
      projectName,
      projectPrompt,
      pushHistory,
      resetSession,
      scopeId,
      stopListening,
      tags,
      tagsByTask,
      tasks,
    ],
  )

  const beginCountdown = useCallback(
    (forcedText?: string) => {
      const text = collapseSpeechStutter((forcedText ?? transcriptRef.current).trim())
      if (!text) {
        // No speech: if we were in a follow-up session, return to followup; else close
        if (history.length > 0 || result?.ambiguous?.length) {
          setPhase('followup')
          phaseRef.current = 'followup'
          setTranscript('')
          setError('No speech heard — hold the mic longer and speak clearly.')
          return
        }
        resetSession()
        return
      }
      transcriptRef.current = text
      setTranscript(text)
      const total = releaseCountdownMs(text)
      countdownEndRef.current = performance.now() + total
      setCountdownMs(total)
      phaseRef.current = 'countdown'
      setPhase('countdown')
      clearCountdown()
      countdownTimerRef.current = window.setInterval(() => {
        const left = Math.max(0, countdownEndRef.current - performance.now())
        setCountdownMs(left)
        if (left <= 0) {
          clearCountdown()
          void runAssistant(text)
        }
      }, 50)
    },
    [clearCountdown, history.length, resetSession, result?.ambiguous?.length, runAssistant],
  )
  beginCountdownRef.current = beginCountdown

  /**
   * Release / unlock — Sprites pattern:
   * stop() then wait for onend before reading transcript.
   * iPad often only delivers text after stop, so reading immediately loses it.
   */
  const finishAfterListen = useCallback(() => {
    lockedRef.current = false
    holdingRef.current = false
    clearFinalizeTimer()

    // Already no active recognition — finalize what we have
    if (!recRef.current) {
      pendingFinalizeRef.current = false
      beginCountdown(transcriptRef.current)
      return
    }

    pendingFinalizeRef.current = true
    phaseRef.current = 'finalizing'
    setPhase('finalizing')
    setError(null)

    try {
      recRef.current.stop()
    } catch {
      try {
        recRef.current.abort()
      } catch {
        /* ignore */
      }
    }

    // Safety if onend never fires
    finalizeTimerRef.current = window.setTimeout(() => {
      if (!pendingFinalizeRef.current) return
      pendingFinalizeRef.current = false
      recRef.current = null
      beginCountdown(transcriptRef.current)
    }, 900)
  }, [beginCountdown, clearFinalizeTimer])

  const enterEditMode = useCallback(() => {
    clearCountdown()
    clearFinalizeTimer()
    holdingRef.current = false
    pendingFinalizeRef.current = false
    stopListening({ hard: true })
    lockedRef.current = false
    setPhase('editing')
    setTranscript((t) => collapseSpeechStutter(t))
  }, [clearCountdown, clearFinalizeTimer, stopListening])

  const resolveAmbiguous = async (
    task: Task,
    amb: NonNullable<ExecuteResult['ambiguous']>[number],
  ) => {
    setPhase('busy')
    setError(null)
    try {
      let line = ''
      if (amb.action === 'complete' || amb.action === 'uncomplete') {
        await setCompleted(task.id, amb.action === 'complete')
        line =
          amb.action === 'complete'
            ? `Completed “${task.name}”`
            : `Reopened “${task.name}”`
      } else if (amb.action === 'add_tags' && amb.tag_names?.length) {
        const executed = await executeAssistantPlan(
          {
            summary: '',
            actions: [{ type: 'add_tags', task_id: task.id, tag_names: amb.tag_names }],
          },
          execDeps(),
        )
        line = executed.summaryLines.join(' · ') || `Tagged “${task.name}”`
        if (executed.errors.length) throw new Error(executed.errors.join(' · '))
      } else if (amb.action === 'update_task' && amb.pending) {
        const { match: _m, ...rest } = amb.pending
        const executed = await executeAssistantPlan(
          {
            summary: '',
            actions: [{ ...rest, type: 'update_task', task_id: task.id }],
          },
          execDeps(),
        )
        line = executed.summaryLines.join(' · ') || `Updated “${task.name}”`
        if (executed.errors.length) throw new Error(executed.errors.join(' · '))
      } else {
        throw new Error('Could not resolve that choice')
      }

      onFocusTask?.(task.id)
      const nextAmb = (result?.ambiguous ?? []).filter(
        (a) => !(a.match === amb.match && a.action === amb.action),
      )
      const resolved: ExecuteResult = {
        summaryLines: [line],
        focusedTaskId: task.id,
        ambiguous: nextAmb,
        errors: result?.errors ?? [],
      }
      if (nextAmb.length > 0) {
        onDone?.(resolved, { followUp: true })
        setResult((prev) => ({
          summaryLines: [...(prev?.summaryLines ?? []), line],
          focusedTaskId: task.id,
          ambiguous: nextAmb,
          errors: prev?.errors ?? [],
        }))
        pushHistory('assistant', line)
        setTranscript('')
        setPhase('followup')
        return
      }

      onDone?.(resolved, { followUp: false })
      resetSession()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Update failed'
      setError(msg)
      pushHistory('error', msg)
      setPhase('followup')
    }
  }

  const stopLocked = useCallback(() => {
    finishAfterListen()
  }, [finishAfterListen])

  const beginHold = useCallback(
    (fromKey = false) => {
      if (!canEdit || phaseRef.current === 'busy' || phaseRef.current === 'finalizing') return
      if (phaseRef.current === 'locked') {
        stopLocked()
        return
      }
      if (
        phaseRef.current === 'editing' ||
        phaseRef.current === 'countdown' ||
        phaseRef.current === 'holding'
      ) {
        return
      }
      lockedRef.current = false
      holdingRef.current = true
      pendingFinalizeRef.current = false
      clearFinalizeTimer()
      setLockHint(false)
      const keepFeedback = phaseRef.current === 'followup' || history.length > 0
      setPhase('holding')
      phaseRef.current = 'holding'
      setError(null)
      clearCountdown()
      if (!keepFeedback) setResult(null)
      const ok = startListening({ append: false, keepFeedback })
      if (!ok) {
        holdingRef.current = false
        // Permission denied / unsupported — leave panel open with error
        if (phaseRef.current === 'holding' || phaseRef.current === 'locked') {
          setPhase(keepFeedback ? 'followup' : 'editing')
          phaseRef.current = keepFeedback ? 'followup' : 'editing'
        }
      }
      if (fromKey) setLockHint(false)
    },
    [canEdit, clearCountdown, clearFinalizeTimer, history.length, startListening, stopLocked],
  )

  // Keyboard push-to-talk (Settings → Keyboard)
  useEffect(() => {
    if (hidden || !canEdit) return
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (isTypingTarget(e.target)) return
      if (!eventMatchesBinding(e, 'pushToTalk')) return
      e.preventDefault()
      beginHold(true)
    }
    const onUp = (e: KeyboardEvent) => {
      if (!eventMatchesBinding(e, 'pushToTalk')) return
      if (phaseRef.current !== 'holding' && phaseRef.current !== 'locked') return
      e.preventDefault()
      if (phaseRef.current === 'locked') return
      finishAfterListen()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [hidden, canEdit, beginHold, finishAfterListen])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canEdit || phase === 'busy' || phase === 'finalizing') return
    if (phase === 'locked') {
      e.preventDefault()
      stopLocked()
      return
    }
    // New hold allowed from idle or after follow-up
    if (phase === 'editing' || phase === 'countdown' || phase === 'holding') {
      return
    }
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerIdRef.current = e.pointerId
    startXRef.current = e.clientX
    beginHold(false)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== e.pointerId) return
    if (phaseRef.current !== 'holding' && phaseRef.current !== 'locked') return
    const dx = e.clientX - startXRef.current
    if (dx >= LOCK_SLIDE_PX && !lockedRef.current) {
      lockedRef.current = true
      setPhase('locked')
      setLockHint(true)
    } else if (!lockedRef.current && dx > 12) {
      setLockHint(true)
    }
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== e.pointerId) return
    pointerIdRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    if (lockedRef.current && phaseRef.current === 'locked') {
      return
    }

    finishAfterListen()
  }

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== e.pointerId) return
    pointerIdRef.current = null
    if (lockedRef.current) return
    finishAfterListen()
  }

  const panelOpen = phase !== 'idle'
  const countdownSec = Math.ceil(countdownMs / 1000)
  const listening = phase === 'holding' || phase === 'locked'

  if (hidden || !canEdit) return null

  return (
    <>
      {panelOpen ? (
        <button
          type="button"
          className="voice-hold-scrim fixed inset-0 z-[34] border-0 bg-black/40 p-0 backdrop-blur-[2px] transition-opacity duration-200"
          aria-label="Dismiss voice panel"
          onClick={() => resetSession()}
        />
      ) : null}

      <div
        className={cn(
          'voice-hold-fab fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[35] flex flex-col items-center pointer-events-none',
        )}
      >
        {panelOpen ? (
          <div
            ref={panelRef}
            className={cn(
              'pointer-events-auto mb-3 w-[min(100%-1.5rem,22rem)] rounded-[var(--radius-sketch)]',
              'border border-[var(--color-border-strong)] bg-[var(--color-surface)]',
              'shadow-[0_12px_40px_rgba(15,23,42,0.22),var(--shadow-sketch)]',
              'px-3 py-3 space-y-2 max-h-[min(60vh,28rem)] overflow-y-auto',
            )}
            role="dialog"
            aria-label="Voice command"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-sm font-semibold">
                {phase === 'holding' && 'Listening…'}
                {phase === 'locked' && 'Locked · keep talking'}
                {phase === 'finalizing' && 'Getting speech…'}
                {phase === 'countdown' && `Sending in ${countdownSec}s`}
                {phase === 'editing' && 'Edit command'}
                {phase === 'busy' && 'Working…'}
                {phase === 'followup' && 'Follow-up'}
                {phase === 'holding' ||
                phase === 'countdown' ||
                phase === 'editing' ||
                phase === 'followup' ? (
                  <HelpHint
                    slug={HelpSlugs.voice}
                    label="Voice assistant help and troubleshooting"
                    className="!h-6 !w-6"
                  />
                ) : null}
              </span>
              {phase !== 'busy' ? (
                <button
                  type="button"
                  className="icon-btn !h-8 !w-8"
                  title="Close"
                  onClick={() => resetSession()}
                >
                  <Icons.X size="0.85em" />
                </button>
              ) : null}
            </div>

            {history.length > 0 ? (
              <div className="space-y-1.5 border-b border-[var(--color-border)] pb-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-sm whitespace-pre-wrap break-words',
                      h.role === 'user' &&
                        'bg-[var(--color-surface-2)] text-[var(--color-text)]',
                      h.role === 'assistant' &&
                        'border border-[var(--color-border)] bg-[var(--color-bg)]',
                      h.role === 'error' &&
                        'text-[var(--color-danger,#b91c1c)] border border-[var(--color-border)]',
                    )}
                  >
                    {h.role === 'user' ? (
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                        You
                      </span>
                    ) : null}
                    {h.role === 'assistant' ? (
                      <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                        Assistant
                      </span>
                    ) : null}
                    {h.text}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Live ambiguity chips (not only in history) */}
            {result?.ambiguous && result.ambiguous.length > 0 ? (
              <div className="space-y-1.5">
                {result.ambiguous.map((a) => (
                  <div key={`${a.action}-${a.match}`} className="space-y-1">
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
                          disabled={phase === 'busy'}
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

            <div ref={historyEndRef} className="h-0 w-full" aria-hidden />

            {phase === 'holding' || phase === 'locked' ? (
              <p className="text-xs text-[var(--color-muted)]">
                {phase === 'locked'
                  ? 'Locked — keep talking, then tap ✓ to send'
                  : lockHint
                    ? 'Slide right to lock for longer dictation'
                    : 'Hold to speak · release to send · slide right to lock'}
              </p>
            ) : null}

            {phase === 'countdown' ? (
              <p className="text-xs text-[var(--color-muted)]">
                Tap the text to edit before it sends.
              </p>
            ) : null}

            {phase === 'followup' ? (
              <p className="text-xs text-[var(--color-muted)]">
                Hold the mic to continue, or pick a task above.
              </p>
            ) : null}

            {phase === 'countdown' ||
            phase === 'holding' ||
            phase === 'locked' ||
            phase === 'finalizing' ? (
              <button
                type="button"
                className={cn(
                  'w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/60',
                  'px-3 py-2.5 text-left text-sm min-h-[3rem]',
                  phase === 'countdown' && 'ring-2 ring-[var(--color-primary)]/30',
                )}
                onClick={() => {
                  if (
                    phase === 'countdown' ||
                    phase === 'holding' ||
                    phase === 'locked' ||
                    phase === 'finalizing'
                  ) {
                    enterEditMode()
                  }
                }}
              >
                {transcript.trim() ? (
                  <span className="whitespace-pre-wrap break-words">{transcript}</span>
                ) : (
                  <span className="text-[var(--color-muted)]">
                    {phase === 'finalizing'
                      ? 'Finishing speech…'
                      : listening
                        ? 'Speak now…'
                        : 'No speech captured'}
                  </span>
                )}
              </button>
            ) : null}

            {phase === 'editing' || phase === 'busy' ? (
              <Textarea
                className="min-h-[72px] text-sm"
                value={transcript}
                disabled={phase === 'busy'}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="What should we do?"
              />
            ) : null}

            {phase === 'countdown' ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-75 ease-linear"
                  style={{
                    width: `${Math.min(100, (countdownMs / Math.max(1, releaseCountdownMs(transcript))) * 100)}%`,
                  }}
                />
              </div>
            ) : null}

            {error && phase !== 'followup' ? (
              <p className="text-sm text-[var(--color-danger,#b91c1c)]" role="alert">
                {error}
              </p>
            ) : null}

            {phase === 'editing' ? (
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (history.length > 0 || result?.ambiguous?.length) {
                      setTranscript('')
                      setPhase('followup')
                    } else {
                      resetSession()
                    }
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={!transcript.trim()}
                  onClick={() => void runAssistant()}
                >
                  Do it
                </Button>
              </div>
            ) : null}

            {!sttOk ? (
              <p className="text-xs text-[var(--color-muted)]">
                Mic unavailable — use the Voice button in the header to type.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-auto relative flex items-center justify-center">
          {(phase === 'holding' || phase === 'locked') && (
            <div
              className={cn(
                'absolute left-1/2 top-1/2 -translate-y-1/2 h-12 rounded-full border border-dashed border-[var(--color-border-strong)]',
                'bg-[var(--color-surface)]/80 text-[10px] text-[var(--color-muted)]',
                'flex items-center pl-14 pr-3 pointer-events-none transition-opacity',
                phase === 'locked' ? 'opacity-100 w-36' : 'opacity-70 w-28',
              )}
              aria-hidden
            >
              {phase === 'locked' ? 'Locked' : '→ lock'}
            </div>
          )}

          <button
            type="button"
            className={cn(
              'voice-hold-mic relative z-[1] flex h-14 w-14 items-center justify-center rounded-full',
              'border-2 border-[var(--color-border-strong)] bg-[var(--color-primary)] text-white',
              'shadow-[0_8px_24px_rgba(15,23,42,0.28),var(--shadow-sketch)]',
              'touch-none select-none active:scale-95 transition-transform',
              listening && 'animate-pulse ring-4 ring-[var(--color-primary)]/35',
              phase === 'locked' && 'ring-4 ring-amber-400/50',
              phase === 'countdown' && 'bg-[var(--color-surface)] text-[var(--color-text)]',
              phase === 'busy' && 'opacity-70',
              (phase === 'editing' || phase === 'followup') &&
                'bg-[var(--color-primary)] text-white',
            )}
            aria-label={
              phase === 'locked'
                ? 'Tap to finish and send'
                : phase === 'idle' || phase === 'followup'
                  ? `Hold to speak (${formatBinding('pushToTalk')})`
                  : 'Voice control'
            }
            disabled={phase === 'busy' || !sttOk}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {phase === 'countdown' ? (
              <span className="text-lg font-bold tabular-nums">{countdownSec}</span>
            ) : phase === 'busy' ? (
              <span className="text-xs font-bold">…</span>
            ) : phase === 'locked' ? (
              <Icons.Check size="1.45em" className="scale-110" />
            ) : (
              <Icons.Mic size="1.35em" className={cn(listening && 'scale-110')} />
            )}
          </button>
        </div>
      </div>
    </>
  )
}
