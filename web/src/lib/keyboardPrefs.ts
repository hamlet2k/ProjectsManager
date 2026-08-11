/**
 * User-remappable keyboard shortcuts (localStorage).
 * Built-in combos live in keyboardShortcuts.ts; this layer stores overrides.
 */

const LS_KEY = 'pm-keyboard-prefs-v1'

export type ShortcutId =
  | 'focusAdd'
  | 'quickDetails'
  | 'saveQuick'
  | 'clearAllFilters'
  | 'saveModal'
  | 'pushToTalk'
  | 'quickSearch'

export type ShortcutDef = {
  id: ShortcutId
  description: string
  /** Default chord parts, e.g. ['ArrowUp'] or ['KeyV'] */
  defaultKeys: string[]
  /** If true, requires Ctrl/Meta (Mod) */
  defaultMod?: boolean
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

/** Canonical catalog including push-to-talk */
export const SHORTCUT_CATALOG: ShortcutDef[] = [
  {
    id: 'focusAdd',
    description: 'Focus quick-add task field',
    defaultKeys: ['ArrowUp'],
    defaultMod: true,
  },
  {
    id: 'quickDetails',
    description: 'Expand quick-add details (when add field focused)',
    defaultKeys: ['ArrowDown'],
    defaultMod: true,
  },
  {
    id: 'saveQuick',
    description: 'Save new task from quick-add',
    defaultKeys: ['Enter'],
    defaultMod: true,
  },
  {
    id: 'clearAllFilters',
    description: 'Clear search and tag/repo filters (not Sort or Done)',
    defaultKeys: ['Backspace'],
    defaultMod: true,
  },
  {
    id: 'saveModal',
    description: 'Save task in the edit/new modal',
    defaultKeys: ['KeyS'],
    defaultMod: true,
  },
  {
    id: 'pushToTalk',
    description: 'Hold to talk (voice push-to-talk)',
    // Avoid Ctrl+V (paste on Windows). Ctrl+M = mic.
    defaultKeys: ['KeyM'],
    defaultMod: true,
  },
  {
    id: 'quickSearch',
    description: 'Open quick search overlay',
    defaultKeys: ['KeyK'],
    defaultMod: true,
  },
]

type StoredPrefs = {
  /** id → { keys, mod } */
  bindings: Partial<Record<ShortcutId, { keys: string[]; mod: boolean }>>
}

function loadRaw(): StoredPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { bindings: {} }
    return JSON.parse(raw) as StoredPrefs
  } catch {
    return { bindings: {} }
  }
}

export function getBinding(id: ShortcutId): { keys: string[]; mod: boolean } {
  const cat = SHORTCUT_CATALOG.find((c) => c.id === id)
  const def = {
    keys: cat?.defaultKeys ?? [],
    mod: Boolean(cat?.defaultMod),
  }
  const stored = loadRaw().bindings[id]
  if (!stored?.keys?.length) return def
  return { keys: stored.keys, mod: Boolean(stored.mod) }
}

export function setBinding(id: ShortcutId, keys: string[], mod: boolean) {
  const cur = loadRaw()
  cur.bindings[id] = { keys, mod }
  localStorage.setItem(LS_KEY, JSON.stringify(cur))
  window.dispatchEvent(new CustomEvent('pm-keyboard-prefs-changed'))
}

export function resetBinding(id: ShortcutId) {
  const cur = loadRaw()
  delete cur.bindings[id]
  localStorage.setItem(LS_KEY, JSON.stringify(cur))
  window.dispatchEvent(new CustomEvent('pm-keyboard-prefs-changed'))
}

export function resetAllBindings() {
  localStorage.removeItem(LS_KEY)
  window.dispatchEvent(new CustomEvent('pm-keyboard-prefs-changed'))
}

/** Human label for a binding */
export function formatBinding(id: ShortcutId): string {
  const b = getBinding(id)
  const mod = isMacPlatform() ? '⌘' : 'Ctrl'
  const keyPart = b.keys
    .map((k) => {
      if (k === 'ArrowUp') return '↑'
      if (k === 'ArrowDown') return '↓'
      if (k === 'Enter') return 'Enter'
      if (k === 'Backspace') return 'Backspace'
      if (k.startsWith('Key') && k.length === 4) return k.slice(3)
      if (k.startsWith('Digit')) return k.slice(5)
      return k
    })
    .join('+')
  return b.mod ? `${mod}+${keyPart}` : keyPart
}

/** Match a KeyboardEvent against a binding */
export function eventMatchesBinding(e: KeyboardEvent, id: ShortcutId): boolean {
  const b = getBinding(id)
  if (b.mod) {
    if (!(e.ctrlKey || e.metaKey)) return false
  } else if (e.ctrlKey || e.metaKey || e.altKey) {
    return false
  }
  // Primary key: last in keys array
  const primary = b.keys[b.keys.length - 1]
  if (!primary) return false
  if (primary.startsWith('Key') && primary.length === 4) {
    return e.code === primary || e.key.toLowerCase() === primary.slice(3).toLowerCase()
  }
  if (primary === 'ArrowUp' || primary === 'ArrowDown' || primary === 'Enter' || primary === 'Backspace') {
    return e.key === primary || e.code === primary
  }
  return e.code === primary || e.key === primary
}

/** Capture a key for remapping (ignore pure modifiers) */
export function chordFromEvent(e: KeyboardEvent): { keys: string[]; mod: boolean } | null {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null
  const mod = e.ctrlKey || e.metaKey
  let code = e.code
  if (!code || code === 'Unidentified') {
    if (e.key.length === 1) code = `Key${e.key.toUpperCase()}`
    else code = e.key
  }
  return { keys: [code], mod }
}
