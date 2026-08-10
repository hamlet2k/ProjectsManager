/** Browser SpeechRecognition helpers (shared by modal + hold-to-talk FAB). */

export type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives?: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
}

export type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Android Chrome STT often marks progressive partials as final. */
export function isAndroidBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export type MicAccessResult = 'ok' | 'denied' | 'insecure' | 'unsupported'

/**
 * Light check before starting Web Speech (no getUserMedia warm-up).
 * Avoids extra latency on every hold; SpeechRecognition requests mic itself.
 */
export function checkSpeechEnvironment(): MicAccessResult {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (!getSpeechRecognitionCtor()) return 'unsupported'
  return 'ok'
}

/**
 * iOS Safari/WebKit never reliably returns Web Speech text (mic can still light up).
 * On iOS we record with MediaRecorder and transcribe server-side (Whisper).
 * Android / desktop keep free browser STT.
 */
export function shouldUseServerStt(): boolean {
  if (typeof window === 'undefined') return false
  return isIosBrowser() && canUseMediaRecorder()
}

export function canUseMediaRecorder(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false
  return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/** Mic usable: browser STT, or iOS record+server path. */
export function canUseVoiceInput(): boolean {
  if (shouldUseServerStt()) return true
  return Boolean(getSpeechRecognitionCtor())
}

export function micAccessMessage(result: MicAccessResult): string {
  switch (result) {
    case 'denied':
      return 'Microphone permission denied. Allow the mic for this site in browser settings, or type instead.'
    case 'insecure':
      return 'Microphone needs HTTPS (or localhost). Open the production site to use voice.'
    case 'unsupported':
      if (isIosBrowser()) {
        return 'Could not start voice recording on this iPhone/iPad. Allow the microphone, or type with Voice.'
      }
      return 'Speech recognition is not available here. Use the Voice button to type (Chrome or Edge work best).'
    default:
      return ''
  }
}

export function speechUnsupportedMessage(): string {
  if (isIosBrowser()) {
    if (!canUseMediaRecorder()) {
      return 'This iPhone/iPad browser cannot record audio. Update iOS/Safari, or type with Voice.'
    }
    return 'Could not start voice recording. Allow the microphone, or type with Voice.'
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Microphone needs a secure connection (HTTPS).'
  }
  return 'Speech recognition is not supported here. Type with the Voice button (Chrome/Edge best).'
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return undefined
  const candidates = [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/aac',
    'audio/webm;codecs=opus',
    'audio/webm',
  ]
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t
    } catch {
      /* ignore */
    }
  }
  return undefined
}

export function extensionForAudioMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('wav')) return 'wav'
  return 'webm'
}

export type AudioCaptureSession = {
  stop: () => Promise<Blob>
  cancel: () => void
}

/** iOS hold-to-talk: keep stream open until release, then stop() → Blob for Whisper. */
export async function startAudioCapture(): Promise<
  { ok: true; session: AudioCaptureSession } | { ok: false; reason: MicAccessResult }
> {
  if (!canUseMediaRecorder()) {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return { ok: false, reason: 'insecure' }
    }
    return { ok: false, reason: 'unsupported' }
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    })
  } catch (e) {
    const name = e instanceof DOMException ? e.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return { ok: false, reason: 'denied' }
    }
    return { ok: false, reason: 'unsupported' }
  }

  const mimeType = pickRecorderMimeType()
  let recorder: MediaRecorder
  try {
    recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
  } catch {
    for (const t of stream.getTracks()) t.stop()
    return { ok: false, reason: 'unsupported' }
  }

  const chunks: BlobPart[] = []
  let stopped = false
  let stopResolve: ((blob: Blob) => void) | null = null
  const stopPromise = new Promise<Blob>((resolve) => {
    stopResolve = resolve
  })

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data)
  }
  recorder.onstop = () => {
    stopped = true
    for (const t of stream.getTracks()) t.stop()
    const type = recorder.mimeType || mimeType || 'audio/webm'
    stopResolve?.(new Blob(chunks, { type }))
  }
  recorder.onerror = () => {
    if (!stopped) {
      try {
        recorder.stop()
      } catch {
        for (const t of stream.getTracks()) t.stop()
        stopResolve?.(new Blob([], { type: mimeType || 'audio/webm' }))
      }
    }
  }

  try {
    recorder.start(250)
  } catch {
    for (const t of stream.getTracks()) t.stop()
    return { ok: false, reason: 'unsupported' }
  }

  return {
    ok: true,
    session: {
      stop: async () => {
        if (stopped) return stopPromise
        if (recorder.state === 'inactive') {
          for (const t of stream.getTracks()) t.stop()
          return new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
        }
        try {
          if (recorder.state === 'recording') recorder.requestData?.()
        } catch {
          /* ignore */
        }
        try {
          recorder.stop()
        } catch {
          for (const t of stream.getTracks()) t.stop()
          return new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
        }
        return stopPromise
      },
      cancel: () => {
        if (stopped) return
        try {
          recorder.ondataavailable = null
          recorder.stop()
        } catch {
          for (const t of stream.getTracks()) t.stop()
          stopResolve?.(new Blob([], { type: 'audio/webm' }))
        }
      },
    },
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Merge final speech chunks, preferring extensions over naive append.
 * Fixes: "remove" + "remove steak" + "remove steak from the list" → one phrase.
 */
export function mergeSpeechFinals(parts: string[]): string {
  let out = ''
  for (const raw of parts) {
    const t = raw.replace(/\s+/g, ' ').trim()
    if (!t) continue
    if (!out) {
      out = t
      continue
    }
    const o = out.toLowerCase()
    const n = t.toLowerCase()
    if (n === o) continue
    if (n.startsWith(o)) {
      out = t
      continue
    }
    if (o.startsWith(n)) continue
    if (n.includes(o) && n.length > o.length) {
      out = t
      continue
    }
    if (o.includes(n)) continue
    out = `${out} ${t}`
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Collapse "remove remove remove" and repeated multi-word stutters. */
export function collapseSpeechStutter(text: string): string {
  let s = text.replace(/\s+/g, ' ').trim()
  if (!s) return s
  s = s.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1')
  for (let n = 8; n >= 2; n--) {
    const re = new RegExp(`\\b((?:\\w+\\s+){${n - 1}}\\w+)(?:\\s+\\1)+\\b`, 'gi')
    let prev = ''
    while (prev !== s) {
      prev = s
      s = s.replace(re, '$1')
    }
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** Countdown after release: longer transcripts get more time to review. */
export function releaseCountdownMs(text: string): number {
  const len = text.trim().length
  if (!len) return 0
  // ~1s base + 40ms/char, clamp 1.0s–4.5s
  return Math.round(Math.min(4500, Math.max(1000, 1000 + len * 40)))
}
