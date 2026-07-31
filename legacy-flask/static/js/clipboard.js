(function () {
    function sanitizeText(value) {
        return typeof value === 'string' ? value : '';
    }

    function normalizeMultiline(text) {
        return sanitizeText(text).replace(/\r\n?/g, '\n');
    }

    function pickString(task, keys) {
        for (const key of keys) {
            const value = task?.[key];
            if (typeof value === 'string' && value.trim() !== '') {
                return value;
            }
        }
        for (const key of keys) {
            const value = task?.[key];
            if (typeof value === 'string') {
                return value;
            }
        }
        return '';
    }

    function pickValue(task, keys) {
        for (const key of keys) {
            if (task && Object.prototype.hasOwnProperty.call(task, key)) {
                return task[key];
            }
        }
        return undefined;
    }

    function toBoolean(value) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (!normalized) {
                return false;
            }
            if (['true', '1', 'yes', 'y', 'completed', 'done'].includes(normalized)) {
                return true;
            }
            if (['false', '0', 'no', 'n', 'incomplete', 'pending'].includes(normalized)) {
                return false;
            }
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        return Boolean(value);
    }

    function formatDate(value) {
        if (!value) {
            return '';
        }
        const stringValue = value instanceof Date ? value.toISOString() : String(value);
        if (typeof window.formatDateTimeDisplay === 'function') {
            const formatted = window.formatDateTimeDisplay(stringValue);
            if (formatted) {
                return formatted;
            }
        }
        return stringValue;
    }

    function ensureArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function formatTags(tags) {
        return ensureArray(tags)
            .map((tag) => {
                if (typeof tag === 'string') {
                    const trimmed = tag.trim();
                    return trimmed ? `#${trimmed}` : null;
                }
                if (tag && typeof tag === 'object') {
                    const label = sanitizeText(tag.name ?? tag.label ?? '').trim();
                    return label ? `#${label}` : null;
                }
                return null;
            })
            .filter(Boolean)
            .join(', ');
    }

    function formatSubtasks(subtasks) {
        const lines = [];
        ensureArray(subtasks).forEach((subtask) => {
            if (!subtask || typeof subtask !== 'object') {
                return;
            }
            const name = sanitizeText(subtask.name ?? subtask.title ?? '').trim();
            const description = sanitizeText(subtask.description ?? subtask.details ?? '').trim();
            const detail = description ? `${name} — ${description}` : name;
            lines.push(`- ${detail || 'Untitled subtask'}`);
        });
        return lines;
    }

    function normalizeIssueNumber(value) {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(Math.trunc(value));
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) {
                return '';
            }
            const normalized = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
            if (/^\d+$/.test(normalized)) {
                const stripped = normalized.replace(/^0+/, '');
                return stripped || '0';
            }
        }
        return '';
    }

    window.formatTaskClipboardText = function formatTaskClipboardText(rawTask) {
        if (!rawTask || typeof rawTask !== 'object') {
            return '';
        }

        const name = pickString(rawTask, ['name', 'title']);
        const description = normalizeMultiline(pickString(rawTask, ['description', 'details', 'notes']));
        const dueValue = pickValue(rawTask, ['dueDate', 'due_date', 'due']);
        const completedValue = pickValue(rawTask, ['completed', 'is_completed', 'done']);
        const completedDateValue = pickValue(rawTask, ['completedDate', 'completed_date', 'completion_date']);
        const tags = pickValue(rawTask, ['tags', 'labels']) ?? [];
        const subtasks = pickValue(rawTask, ['subtasks', 'children']) ?? [];
        const hasGithubIssueValue = pickValue(rawTask, ['hasGithubIssue', 'has_github_issue', 'hasGithub', 'has_github']);
        const issueNumberValue = pickValue(rawTask, ['githubIssueNumber', 'github_issue_number', 'issueNumber', 'issue_number']);
        const hasGithubIssue = hasGithubIssueValue !== undefined ? toBoolean(hasGithubIssueValue) : undefined;
        const normalizedIssueNumber = normalizeIssueNumber(issueNumberValue);

        const lines = [];
        lines.push(name ? `Task: ${name}` : 'Task');

        if (description) {
            lines.push('Description:');
            lines.push(description);
        }

        const formattedDue = formatDate(dueValue);
        if (formattedDue) {
            lines.push(`Due: ${formattedDue}`);
        }

        const isCompleted = completedValue !== undefined ? toBoolean(completedValue) : false;
        if (isCompleted) {
            const formattedCompletion = formatDate(completedDateValue);
            lines.push(
                formattedCompletion
                    ? `Status: Completed (${formattedCompletion})`
                    : 'Status: Completed'
            );
        } else {
            lines.push('Status: In progress');
        }

        const formattedTags = formatTags(tags);
        if (formattedTags) {
            lines.push(`Tags: ${formattedTags}`);
        }

        const formattedSubtasks = formatSubtasks(subtasks);
        if (formattedSubtasks.length > 0) {
            lines.push('Subtasks:');
            lines.push(...formattedSubtasks);
        }

        if (normalizedIssueNumber && hasGithubIssue !== false) {
            lines.push(`Fixes #${normalizedIssueNumber}`);
        }

        return lines.join('\n').trim();
    };
})();
