/**
 * Shared keyboard shortcut helpers (issue #118 / P1).
 * Mod = Ctrl on Windows/Linux, ⌘ on macOS.
 * Remappable labels: see keyboardPrefs.ts
 */

import { formatBinding } from './keyboardPrefs'

export function isModKey(e: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.ctrlKey || e.metaKey
}

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)
}

/** User-facing label, e.g. "Ctrl+↑" or "⌘+↑" */
export function modLabel(key: string): string {
  const mod = isMacPlatform() ? '⌘' : 'Ctrl'
  return `${mod}+${key}`
}

/**
 * True when the event target is an editable field where we should not
 * steal single-key or ambiguous shortcuts (except Esc / explicit mod combos).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = (el.tagName || '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase()
    // allow buttons/checkboxes to receive shortcuts
    if (['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(type)) {
      return false
    }
    return true
  }
  if (el.isContentEditable) return true
  return false
}

/** Catalog for UI tooltips / help chips (labels respect Settings remaps) */
export const TASK_SHORTCUTS = {
  focusAdd: {
    id: 'focusAdd' as const,
    combo: () => formatBinding('focusAdd'),
    description: 'Focus quick-add task field',
  },
  quickDetails: {
    id: 'quickDetails' as const,
    combo: () => formatBinding('quickDetails'),
    description: 'Expand quick-add details (when add field focused)',
  },
  saveQuick: {
    id: 'saveQuick' as const,
    combo: () => formatBinding('saveQuick'),
    description: 'Save new task from quick-add',
  },
  clearSearch: {
    id: 'clearSearch' as const,
    combo: () => 'Esc',
    description: 'Clear search when search is focused',
  },
  clearAllFilters: {
    id: 'clearAllFilters' as const,
    combo: () => formatBinding('clearAllFilters'),
    description: 'Clear search and tag/repo filters (not Sort or Done)',
  },
  collapseEsc: {
    id: 'collapseEsc' as const,
    combo: () => 'Esc',
    description: 'Close tag editor / collapse expanded task / clear search',
  },
  saveModal: {
    id: 'saveModal' as const,
    combo: () => formatBinding('saveModal'),
    description: 'Save task in the edit/new modal',
  },
  pushToTalk: {
    id: 'pushToTalk' as const,
    combo: () => formatBinding('pushToTalk'),
    description: 'Hold for voice push-to-talk',
  },
  quickSearch: {
    id: 'quickSearch' as const,
    combo: () => formatBinding('quickSearch'),
    description: 'Open quick search overlay',
  },
} as const
