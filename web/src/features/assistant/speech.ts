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

/**
 * Safari often wants a full BCP-47 tag (en-US), not bare "en".
 * Matches Sprites' speechLangForLocale approach.
 */
export function speechRecognitionLang(): string {
  if (typeof navigator === 'undefined') return 'en-US'
  const raw = (navigator.language || 'en-US').trim()
  if (/^[a-z]{2}-[A-Za-z]{2,4}$/i.test(raw)) return raw
  const base = raw.slice(0, 2).toLowerCase()
  if (base === 'es') return 'es-ES'
  if (base === 'en') return 'en-US'
  if (base === 'pt') return 'pt-BR'
  if (base === 'fr') return 'fr-FR'
  if (base === 'de') return 'de-DE'
  if (base.length === 2) return `${base}-${base.toUpperCase()}`
  return 'en-US'
}

/**
 * Read transcripts from a SpeechRecognition result list.
 * Supports array access and .item() (WebKit).
 */
export function transcriptFromSpeechEvent(ev: SpeechRecognitionEventLike): {
  finals: string[]
  interim: string
  all: string
} {
  const results = ev.results
  const len = results?.length ?? 0
  const finals: string[] = []
  let interim = ''
  let all = ''

  for (let i = 0; i < len; i++) {
    const row = results[i] as
      | { isFinal: boolean; 0?: { transcript?: string }; item?: (n: number) => { transcript?: string } }
      | undefined
    if (!row) continue
    const alt =
      row[0] ??
      (typeof row.item === 'function' ? row.item(0) : undefined)
    const piece = String(alt?.transcript ?? '').replace(/\s+/g, ' ').trim()
    if (!piece) continue
    all = all ? `${all} ${piece}` : piece
    if (row.isFinal) finals.push(piece)
    else interim = interim ? `${interim} ${piece}` : piece
  }

  return {
    finals,
    interim: interim.trim(),
    all: all.trim(),
  }
}

/** Unregister leftover PWA service workers so iPad is not stuck on old Whisper builds. */
export async function purgeStaleServiceWorkers(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  try {
    const regs = await navigator.serviceWorker.getRegistrations()
    await Promise.all(regs.map((r) => r.unregister()))
  } catch {
    /* ignore */
  }
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }
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

/**
 * Android Chrome: continuous=true + interim often emits progressive "finals".
 * Use continuous=false + onend restart while holding (works on Android).
 *
 * iOS/iPad: match the working Sprites app — continuous=true from the original
 * pointer gesture. continuous=false + setTimeout restart often loses user-gesture
 * context on iPad and returns no text (while the same device works in other tabs).
 *
 * Never call getUserMedia before SpeechRecognition — can steal the mic on iOS.
 */
export function prefersNonContinuousSpeech(): boolean {
  return isAndroidBrowser()
}

export type MicAccessResult = 'ok' | 'denied' | 'insecure' | 'unsupported'

/**
 * Light check before starting Web Speech only.
 * Do NOT open getUserMedia first — SpeechRecognition owns the mic.
 */
export function checkSpeechEnvironment(): MicAccessResult {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (!getSpeechRecognitionCtor()) return 'unsupported'
  return 'ok'
}

export function micAccessMessage(result: MicAccessResult): string {
  switch (result) {
    case 'denied':
      return 'Microphone permission denied. Allow the mic for this site in browser settings, or type instead.'
    case 'insecure':
      return 'Microphone needs HTTPS (or localhost). Open the production site to use voice.'
    case 'unsupported':
      return 'Speech recognition is not available here. Type with the Voice button (Safari/Chrome on a secure site).'
    default:
      return ''
  }
}

export function speechUnsupportedMessage(): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Microphone needs a secure connection (HTTPS).'
  }
  return 'Speech recognition is not supported in this browser. Type with the Voice button, or try Safari/Chrome.'
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
