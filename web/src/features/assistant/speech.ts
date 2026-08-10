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

export function micAccessMessage(result: MicAccessResult): string {
  switch (result) {
    case 'denied':
      return 'Microphone permission denied. Allow the mic for this site in browser settings, or type instead.'
    case 'insecure':
      return 'Microphone needs HTTPS (or localhost). Open the production site to use voice.'
    case 'unsupported':
      if (isIosBrowser()) {
        return 'Voice typing is limited on iPhone/iPad Safari. Type with the Voice button, or use Chrome/Edge on Android or desktop.'
      }
      return 'Speech recognition is not available here. Use the Voice button to type (Chrome or Edge work best).'
    default:
      return ''
  }
}

export function speechUnsupportedMessage(): string {
  if (isIosBrowser()) {
    return 'Voice typing is limited on this device/browser (iOS Safari). Type with Voice, or use Android Chrome / desktop Chrome/Edge for the mic.'
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Microphone needs a secure connection (HTTPS).'
  }
  return 'Speech recognition is not supported here. Type with the Voice button (Chrome/Edge best).'
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
