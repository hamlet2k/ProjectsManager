/**
 * Shared localStorage utility functions for task and scope preferences
 */

const PREFERENCE_STORAGE_KEY = 'pm:preferences';
const LAST_TAG_KEY_PREFIX = 'pm:lastTags_';

/**
 * Read preference data from localStorage with fallback
 * @returns {Object} Preference data with lastScopeId and scopes
 */
function readPreferenceData() {
    const fallback = { lastScopeId: null, scopes: {} };
    if (typeof window === 'undefined' || !('localStorage' in window)) {
        return { ...fallback };
    }
    try {
        const raw = window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
        if (!raw) {
            return { ...fallback };
        }
        const parsed = JSON.parse(raw);
        const scopes = parsed && typeof parsed.scopes === 'object' && parsed.scopes !== null ? parsed.scopes : {};
        const lastScopeId = parsed && parsed.lastScopeId != null ? String(parsed.lastScopeId) : null;
        return { lastScopeId, scopes };
    } catch (error) {
        console.warn('Unable to read task preferences from localStorage.', error);
        return { ...fallback };
    }
}

/**
 * Write preference data to localStorage
 * @param {Object} data - Preference data to store
 */
function writePreferenceData(data) {
    if (typeof window === 'undefined' || !('localStorage' in window)) {
        return;
    }
    try {
        window.localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
        console.warn('Unable to persist task preferences to localStorage.', error);
    }
}

function buildLastTagStorageKey(scopeId) {
    const key = String(scopeId ?? '');
    return key ? `${LAST_TAG_KEY_PREFIX}${key}` : null;
}

function getStoredLastTags(scopeId) {
    if (scopeId == null || typeof window === 'undefined' || !('localStorage' in window)) {
        return [];
    }
    const storageKey = buildLastTagStorageKey(scopeId);
    if (!storageKey) {
        return [];
    }
    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed
            .map((entry) => {
                if (entry == null) {
                    return null;
                }
                if (typeof entry === 'string' || typeof entry === 'number') {
                    const id = String(entry).trim();
                    return id ? { id, name: '' } : null;
                }
                if (typeof entry === 'object' && entry.id != null) {
                    const id = String(entry.id).trim();
                    if (!id) {
                        return null;
                    }
                    const name = typeof entry.name === 'string' ? entry.name : '';
                    return { id, name };
                }
                return null;
            })
            .filter(Boolean);
    } catch (error) {
        console.warn('Unable to read last-used tags from localStorage.', error);
        return [];
    }
}

function setStoredLastTags(scopeId, tags) {
    if (scopeId == null || typeof window === 'undefined' || !('localStorage' in window)) {
        return;
    }
    const storageKey = buildLastTagStorageKey(scopeId);
    if (!storageKey) {
        return;
    }
    const normalized = Array.isArray(tags)
        ? tags
              .map((tag) => {
                  if (tag == null) {
                      return null;
                  }
                  if (typeof tag === 'string' || typeof tag === 'number') {
                      const id = String(tag).trim();
                      return id ? { id, name: '' } : null;
                  }
                  if (typeof tag === 'object' && tag.id != null) {
                      const id = String(tag.id).trim();
                      if (!id) {
                          return null;
                      }
                      const name = typeof tag.name === 'string' ? tag.name : '';
                      return { id, name };
                  }
                  return null;
              })
              .filter(Boolean)
        : [];
    if (normalized.length === 0) {
        clearStoredLastTags(scopeId);
        return;
    }
    const unique = [];
    const seen = new Set();
    normalized.forEach(({ id, name }) => {
        if (seen.has(id)) {
            return;
        }
        seen.add(id);
        unique.push({ id, name });
    });
    try {
        window.localStorage.setItem(storageKey, JSON.stringify(unique));
    } catch (error) {
        console.warn('Unable to persist last-used tags to localStorage.', error);
    }
}

function clearStoredLastTags(scopeId) {
    if (scopeId == null || typeof window === 'undefined' || !('localStorage' in window)) {
        return;
    }
    const storageKey = buildLastTagStorageKey(scopeId);
    if (!storageKey) {
        return;
    }
    try {
        window.localStorage.removeItem(storageKey);
    } catch (error) {
        console.warn('Unable to clear last-used tags from localStorage.', error);
    }
}

/**
 * Update preference data using an updater function
 * @param {Function} updater - Function that modifies the preference data
 * @returns {Object} Normalized preference data
 */
function updatePreferenceData(updater) {
    const current = readPreferenceData();
    const draft = {
        lastScopeId: current.lastScopeId,
        scopes: { ...current.scopes },
    };
    const result = typeof updater === 'function' ? updater(draft) || draft : draft;
    const normalized = {
        lastScopeId: result.lastScopeId != null ? String(result.lastScopeId) : null,
        scopes: result.scopes && typeof result.scopes === 'object' ? result.scopes : {},
    };
    writePreferenceData(normalized);
    return normalized;
}

/**
 * Get stored preferences for a specific scope
 * @param {string|number} scopeId - The scope ID
 * @returns {Object|null} Stored preferences or null if not found
 */
function getStoredScopePreferences(scopeId) {
    if (scopeId == null) {
        return null;
    }
    const data = readPreferenceData();
    const scopeKey = String(scopeId);
    const stored = data.scopes && typeof data.scopes === 'object' ? data.scopes[scopeKey] : null;
    if (!stored || typeof stored !== 'object') {
        return null;
    }
    return {
        search: typeof stored.search === 'string' ? stored.search : '',
        sortBy: typeof stored.sortBy === 'string' ? stored.sortBy : '',
        showCompleted: Boolean(stored.showCompleted),
        tags: Array.isArray(stored.tags) ? stored.tags.map((value) => String(value)) : [],
    };
}

// Export functions for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PREFERENCE_STORAGE_KEY,
        LAST_TAG_KEY_PREFIX,
        readPreferenceData,
        writePreferenceData,
        updatePreferenceData,
        getStoredScopePreferences,
        getStoredLastTags,
        setStoredLastTags,
        clearStoredLastTags,
    };
}
