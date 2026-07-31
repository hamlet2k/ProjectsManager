/**
 * Shared keyboard shortcut helpers (issue #118 / P1).
 * Mod = Ctrl on Windows/Linux, ⌘ on macOS.
 */

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

/** Catalog for UI tooltips / help chips */
export const TASK_SHORTCUTS = {
  focusAdd: {
    id: 'focusAdd',
    combo: () => modLabel('↑'),
    description: 'Focus quick-add task field',
  },
  quickDetails: {
    id: 'quickDetails',
    combo: () => modLabel('↓'),
    description: 'Expand quick-add details (when add field focused)',
  },
  saveQuick: {
    id: 'saveQuick',
    combo: () => modLabel('Enter'),
    description: 'Save new task from quick-add',
  },
  clearSearch: {
    id: 'clearSearch',
    combo: () => 'Esc',
    description: 'Clear search when search is focused',
  },
  clearAllFilters: {
    id: 'clearAllFilters',
    combo: () => modLabel('Backspace'),
    description: 'Clear search, tags, and reset filters',
  },
  collapseEsc: {
    id: 'collapseEsc',
    combo: () => 'Esc',
    description: 'Close tag editor / collapse expanded task / clear search',
  },
  saveModal: {
    id: 'saveModal',
    combo: () => modLabel('S'),
    description: 'Save task in the edit/new modal',
  },
} as const
