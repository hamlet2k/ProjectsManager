/**
 * Shared localStorage utility functions for task and scope preferences
 */

const PREFERENCE_STORAGE_KEY = 'pm:preferences';

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
        readPreferenceData,
        writePreferenceData,
        updatePreferenceData,
        getStoredScopePreferences,
    };
}