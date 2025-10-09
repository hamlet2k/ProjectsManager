(function () {
    'use strict';

    const state = {
        form: null,
        modalEl: null,
        modal: null,
        modalTitle: null,
        modalDescription: null,
        submitButton: null,
        scopeList: null,
        emptyState: null,
        addButton: null,
        page: null,
        github: null,
        formMode: 'create',
        editingScopeId: null,
        activeTrigger: null,
        initialState: { data: {}, errors: {} },
        formValues: {},
    };

    const DEFAULT_MESSAGES = {
        createTitle: 'Create scope',
        createDescription: 'Provide a name and optional description to group related tasks.',
        createSubmit: 'Create scope',
        editTitle: 'Edit scope',
        editSubmit: 'Save changes',
    };

    document.addEventListener('DOMContentLoaded', initializeScopePage);

    function initializeScopePage() {
        state.form = document.getElementById('scope-form');
        state.modalEl = document.getElementById('scope-modal');
        state.modalTitle = document.getElementById('scope-modal-title');
        state.modalDescription = document.getElementById('scope-modal-description');
        state.submitButton = state.form ? state.form.querySelector('[type="submit"]') : null;
        state.scopeList = document.querySelector('[data-scope-list]');
        state.emptyState = document.querySelector('[data-scope-empty]');
        state.addButton = document.getElementById('add-scope-btn');
        state.page = document.getElementById('scope-page');

        if (!state.form || !state.modalEl || typeof bootstrap === 'undefined') {
            return;
        }

        state.modal = bootstrap.Modal.getOrCreateInstance(state.modalEl);
        state.github = resolveGithubElements();
        state.initialState = parseInitialState(state.form.dataset.initialState);
        hydrateInitialState();
        bindCoreEvents();
        bindExistingCardControls();

        if (typeof initializeSortable === 'function') {
            initializeSortable('scopes-list', 'scope');
        }

        attemptStoredScopeRedirect();

        if (state.modalEl.dataset.openOnLoad === 'true') {
            state.modal.show();
        }
    }

    function resolveGithubElements() {
        const toggle = document.getElementById('scope-github-toggle');
        const select = document.getElementById('scope-github-repo-select');
        const warning = document.querySelector('[data-github-warning]');
        const section = document.querySelector('[data-github-settings-section]');
        if (select && !select.dataset.reposLoaded) {
            select.dataset.reposLoaded = 'false';
        }
        return {
            toggle,
            select,
            warning,
            section,
            tokenPresent: state.form && state.form.dataset.githubTokenPresent === 'true',
        };
    }

    function parseInitialState(raw) {
        if (!raw) {
            return { data: getDefaultFormValues(), errors: {} };
        }
        try {
            const parsed = JSON.parse(raw);
            const data = parsed && parsed.data ? parsed.data : {};
            const errors = parsed && parsed.errors ? parsed.errors : {};
            return {
                data: {
                    ...getDefaultFormValues(),
                    ...data,
                },
                errors: errors || {},
            };
        } catch (error) {
            console.warn('Unable to parse initial scope form state.', error);
            return { data: getDefaultFormValues(), errors: {} };
        }
    }

    function getDefaultFormValues() {
        return {
            name: '',
            description: '',
            github_enabled: false,
            github_repository: '',
        };
    }

    function hydrateInitialState() {
        applyFormValues(state.initialState.data || getDefaultFormValues());
        applyFormErrors(state.form, state.initialState.errors || {});
        if (state.initialState.data.github_enabled) {
            ensureGithubRepositoriesLoaded({ silent: true });
        }
    }

    function bindCoreEvents() {
        if (state.addButton) {
            state.addButton.addEventListener('click', handleCreateButtonClick);
        }

        state.modalEl.addEventListener('show.bs.modal', handleModalShow);
        state.modalEl.addEventListener('hidden.bs.modal', handleModalHidden);

        state.form.addEventListener('submit', handleFormSubmit);

        const github = state.github;
        if (github.toggle) {
            github.toggle.addEventListener('change', () => {
                updateGithubSectionVisibility();
                if (github.toggle.checked) {
                    ensureGithubRepositoriesLoaded({ silent: true });
                    if (github.select && !github.select.value) {
                        showGithubWarning();
                    }
                } else {
                    hideGithubWarning();
                }
            });
        }
        if (github.select) {
            github.select.addEventListener('change', () => {
                github.select.dataset.selectedRepo = github.select.value || '';
                hideGithubWarning();
            });
        }
    }

    function bindExistingCardControls() {
        bindCardControls(document);
    }

    function bindCardControls(root) {
        if (!root) {
            return;
        }
        root.querySelectorAll('.scope-copy-btn').forEach((button) => {
            if (button.dataset.scopeCopyBound === 'true') {
                return;
            }
            button.dataset.scopeCopyBound = 'true';
            button.addEventListener('click', handleScopeCopyClick);
        });
        root.querySelectorAll('.edit-scope-btn').forEach((button) => {
            if (button.dataset.scopeEditBound === 'true') {
                return;
            }
            button.dataset.scopeEditBound = 'true';
            button.addEventListener('click', handleEditButtonClick);
        });
        root.querySelectorAll('.scope-delete-btn').forEach((button) => {
            if (button.dataset.scopeDeleteBound === 'true') {
                return;
            }
            button.dataset.scopeDeleteBound = 'true';
            button.addEventListener('click', handleDeleteButtonClick);
        });
        root.querySelectorAll('.scope-card a[data-scope-id]').forEach((link) => {
            if (link.dataset.scopeLinkBound === 'true') {
                return;
            }
            link.dataset.scopeLinkBound = 'true';
            link.addEventListener('click', () => {
                setLastScopePreference(link.dataset.scopeId);
            });
        });
    }

    function handleCreateButtonClick() {
        state.formMode = 'create';
        state.editingScopeId = null;
        state.activeTrigger = null;
        state.formValues = { ...getDefaultFormValues() };
    }

    function handleEditButtonClick(event) {
        const trigger = event.currentTarget;
        state.formMode = 'edit';
        state.editingScopeId = trigger.dataset.scopeId || null;
        state.activeTrigger = trigger;
        state.formValues = {
            name: trigger.getAttribute('data-scope-name') || '',
            description: trigger.getAttribute('data-scope-description') || '',
            github_enabled: (trigger.getAttribute('data-scope-github_enabled') || '').toLowerCase() === 'true',
            github_repository: trigger.getAttribute('data-scope-github_repository') || '',
        };
    }

    function handleModalShow() {
        if (state.formMode === 'edit') {
            applyFormValues(state.formValues || getDefaultFormValues());
            applyFormErrors(state.form, {});
            setModalContent({
                title: DEFAULT_MESSAGES.editTitle,
                description: buildEditScopeDescription(state.formValues?.name || ''),
                submitLabel: DEFAULT_MESSAGES.editSubmit,
            });
            ensureGithubRepositoriesLoaded({ silent: true });
        } else {
            const defaults = state.initialState?.data || getDefaultFormValues();
            applyFormValues(defaults);
            applyFormErrors(state.form, state.initialState?.errors || {});
            setModalContent({
                title: DEFAULT_MESSAGES.createTitle,
                description: DEFAULT_MESSAGES.createDescription,
                submitLabel: DEFAULT_MESSAGES.createSubmit,
            });
            if (defaults.github_enabled) {
                ensureGithubRepositoriesLoaded({ silent: true });
            } else {
                hideGithubWarning();
            }
        }
    }

    function handleModalHidden() {
        resetFormState();
        state.formMode = 'create';
        state.editingScopeId = null;
        state.activeTrigger = null;
        state.formValues = { ...getDefaultFormValues() };
    }

    function resetFormState() {
        if (!state.form) {
            return;
        }
        state.form.reset();
        applyFormValues(getDefaultFormValues());
        applyFormErrors(state.form, {});
        hideGithubWarning();
    }

    function handleFormSubmit(event) {
        event.preventDefault();
        if (!state.form) {
            return;
        }
        const payload = buildFormPayload();
        const clientErrors = validateClientPayload(payload);
        if (Object.keys(clientErrors).length > 0) {
            applyFormErrors(state.form, clientErrors);
            if (clientErrors.github_repository) {
                showGithubWarning();
            }
            return;
        }

        const endpoint = resolveSubmissionEndpoint();
        if (!endpoint) {
            displayFlashMessage('Unable to determine where to submit the scope.', 'danger');
            return;
        }

        setSubmitLoading(true);

        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify(payload),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, status: response.status, data }))
            )
            .then(({ ok, data }) => {
                if (!data) {
                    throw new Error('Invalid response.');
                }
                if (data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (!ok || data.success !== true) {
                    applyFormErrors(state.form, data.errors || {});
                    if (data.values) {
                        applyFormValues({
                            name: data.values.name || '',
                            description: data.values.description || '',
                            github_enabled: Boolean(data.values.github_enabled),
                            github_repository: data.values.github_repository || '',
                        });
                    }
                    if (data.errors && data.errors.github_repository) {
                        showGithubWarning();
                    }
                    const message = data.message || 'Please correct the highlighted fields.';
                    displayFlashMessage(message, 'danger');
                    return;
                }

                applyFormErrors(state.form, {});
                hideGithubWarning();

                if (data.scope) {
                    upsertScopeCard(data.scope);
                }

                const message = data.message || 'Scope saved successfully.';
                displayFlashMessage(message, 'success');

                if (state.modal) {
                    state.modal.hide();
                }

                state.initialState = { data: getDefaultFormValues(), errors: {} };
            })
            .catch((error) => {
                console.error('Unable to submit scope form.', error);
                displayFlashMessage('Unable to save the scope. Please try again.', 'danger');
            })
            .finally(() => {
                setSubmitLoading(false);
            });
    }

    function setSubmitLoading(isLoading) {
        if (!state.submitButton) {
            return;
        }
        if (isLoading) {
            state.submitButton.dataset.originalContent = state.submitButton.innerHTML;
            state.submitButton.disabled = true;
            state.submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        } else {
            state.submitButton.disabled = false;
            if (state.submitButton.dataset.originalContent) {
                state.submitButton.innerHTML = state.submitButton.dataset.originalContent;
                delete state.submitButton.dataset.originalContent;
            }
        }
    }

    function buildFormPayload() {
        const values = getCurrentFormValues();
        state.formValues = { ...values };
        const payload = {
            csrf_token: getCsrfToken(),
            name: values.name,
            description: values.description,
            github_enabled: values.github_enabled ? 'y' : 'n',
            github_repository: values.github_repository || '',
        };
        return payload;
    }

    function getCurrentFormValues() {
        const values = getDefaultFormValues();
        const nameField = state.form.querySelector('[data-field="name"]');
        const descriptionField = state.form.querySelector('[data-field="description"]');
        const githubToggle = state.github.toggle;
        const githubSelect = state.github.select;

        if (nameField) {
            values.name = nameField.value.trim();
        }
        if (descriptionField) {
            values.description = descriptionField.value;
        }
        if (githubToggle) {
            values.github_enabled = githubToggle.checked && !githubToggle.disabled;
        }
        if (githubSelect) {
            const explicitValue = githubSelect.value || githubSelect.dataset.selectedRepo || '';
            values.github_repository = explicitValue;
        }
        return values;
    }

    function validateClientPayload(payload) {
        const errors = {};
        if (!payload.name || !payload.name.trim()) {
            errors.name = ['Name is required.'];
        }
        const githubToggle = state.github.toggle;
        if (githubToggle && githubToggle.checked && !payload.github_repository) {
            errors.github_repository = ['A repository must be selected to enable GitHub integration for this scope.'];
        }
        return errors;
    }

    function resolveSubmissionEndpoint() {
        if (!state.form) {
            return '';
        }
        if (state.formMode === 'edit') {
            const template = state.form.dataset.editUrlTemplate || '';
            if (!template || !state.editingScopeId) {
                return '';
            }
            return template.replace('/0', `/${state.editingScopeId}`);
        }
        return state.form.dataset.createUrl || '';
    }

    function updateCsrfToken(token) {
        const field = state.form.querySelector('input[name="csrf_token"]');
        if (field && token) {
            field.value = token;
        }
    }

    function applyFormValues(values) {
        const data = { ...getDefaultFormValues(), ...(values || {}) };
        const nameField = state.form.querySelector('[data-field="name"]');
        const descriptionField = state.form.querySelector('[data-field="description"]');
        const githubToggle = state.github.toggle;
        const githubSelect = state.github.select;

        if (nameField) {
            nameField.value = data.name || '';
        }
        if (descriptionField) {
            descriptionField.value = data.description || '';
        }
        if (githubToggle && !githubToggle.disabled) {
            githubToggle.checked = Boolean(data.github_enabled);
        }
        if (githubSelect) {
            githubSelect.dataset.selectedRepo = data.github_repository || '';
            if (!githubSelect.dataset.reposLoaded || githubSelect.dataset.reposLoaded !== 'true') {
                githubSelect.value = '';
            } else if (data.github_repository) {
                applySelectedRepository();
            } else {
                githubSelect.value = '';
            }
        }
        updateGithubSectionVisibility();
        if (githubToggle && githubToggle.checked) {
            ensureGithubRepositoriesLoaded({ silent: true });
        }
    }

    function applyFormErrors(form, errors) {
        const normalized = errors && typeof errors === 'object' ? errors : {};
        const inputs = form.querySelectorAll('[data-field]');
        inputs.forEach((input) => {
            input.classList.remove('is-invalid');
        });
        const containers = form.querySelectorAll('[data-field-errors]');
        containers.forEach((container) => {
            container.classList.remove('d-block');
            container.innerHTML = '';
        });
        Object.entries(normalized).forEach(([fieldName, messages]) => {
            const input = form.querySelector(`[data-field="${fieldName}"]`);
            if (input) {
                input.classList.add('is-invalid');
            }
            const container = form.querySelector(`[data-field-errors="${fieldName}"]`);
            if (container && Array.isArray(messages) && messages.length) {
                container.innerHTML = messages.map((message) => `<div>${escapeHtml(String(message))}</div>`).join('');
                container.classList.add('d-block');
            }
        });
    }

    function setModalContent({ title, description, submitLabel }) {
        if (state.modalTitle && typeof title === 'string') {
            state.modalTitle.textContent = title;
        }
        if (state.modalDescription && typeof description === 'string') {
            state.modalDescription.textContent = description;
        }
        if (state.submitButton && typeof submitLabel === 'string') {
            state.submitButton.value = submitLabel;
            state.submitButton.textContent = submitLabel;
        }
    }

    function buildEditScopeDescription(name) {
        if (name && name.trim().length > 0) {
            return `Update the details for "${name.trim()}" before saving your changes.`;
        }
        return 'Update the scope details before saving your changes.';
    }

    function updateGithubSectionVisibility() {
        const github = state.github;
        if (!github.section) {
            return;
        }
        const shouldShow = Boolean(github.toggle && github.toggle.checked && !github.toggle.disabled);
        github.section.style.display = shouldShow ? '' : 'none';
        if (!shouldShow) {
            hideGithubWarning();
        }
        if (shouldShow) {
            ensureGithubRepositoriesLoaded({ silent: true });
        }
    }

    function ensureGithubRepositoriesLoaded({ silent } = { silent: false }) {
        const github = state.github;
        if (!github.select || !github.toggle || github.toggle.disabled || github.select.dataset.reposLoaded === 'true') {
            return;
        }
        loadGithubRepositories({ silent: Boolean(silent) });
    }

    function loadGithubRepositories({ silent }) {
        const github = state.github;
        if (!github.select) {
            return;
        }
        setGithubSelectLoading(true);
        fetch('/api/github/repos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({}),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                populateGithubSelect(data, ok, silent);
            })
            .catch((error) => {
                console.error('Unable to load GitHub repositories.', error);
                github.select.dataset.reposLoaded = 'false';
                github.select.disabled = true;
                if (!silent) {
                    displayFlashMessage('Unable to load GitHub repositories.', 'danger');
                }
            })
            .finally(() => {
                setGithubSelectLoading(false);
            });
    }

    function populateGithubSelect(payload, ok, silent) {
        const github = state.github;
        if (!github.select) {
            return;
        }
        const select = github.select;
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a repository';
        select.appendChild(placeholder);

        if (!ok || !payload || payload.success !== true || !Array.isArray(payload.repositories)) {
            select.disabled = true;
            select.dataset.reposLoaded = 'false';
            if (!silent) {
                const message = (payload && payload.message) || 'Unable to load GitHub repositories.';
                displayFlashMessage(message, 'danger');
            }
            return;
        }

        payload.repositories.forEach((repo) => {
            const option = document.createElement('option');
            option.value = JSON.stringify(repo);
            option.textContent = `${repo.owner}/${repo.name}`;
            select.appendChild(option);
        });
        select.disabled = false;
        select.dataset.reposLoaded = 'true';
        applySelectedRepository();
    }

    function setGithubSelectLoading(isLoading) {
        const select = state.github.select;
        if (!select) {
            return;
        }
        if (isLoading) {
            select.disabled = true;
            select.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Loading repositories...';
            select.appendChild(option);
        } else if (state.github.toggle && !state.github.toggle.disabled && select.dataset.reposLoaded === 'true') {
            select.disabled = false;
        } else {
            select.disabled = true;
        }
    }

    function applySelectedRepository() {
        const select = state.github.select;
        if (!select) {
            return;
        }
        const selectedValue = select.dataset.selectedRepo || '';
        if (!selectedValue || !select.options.length) {
            select.value = '';
            return;
        }
        try {
            const parsed = JSON.parse(selectedValue);
            for (const option of Array.from(select.options)) {
                if (!option.value) {
                    continue;
                }
                try {
                    const value = JSON.parse(option.value);
                    if (value && value.id === parsed.id) {
                        option.selected = true;
                        return;
                    }
                } catch (error) {
                    // ignore invalid option value
                }
            }
            select.value = '';
        } catch (error) {
            select.value = '';
        }
    }

    function showGithubWarning() {
        if (state.github.warning) {
            state.github.warning.classList.remove('d-none');
        }
    }

    function hideGithubWarning() {
        if (state.github.warning) {
            state.github.warning.classList.add('d-none');
        }
    }

    function getCsrfToken() {
        const field = state.form.querySelector('input[name="csrf_token"]');
        return field ? field.value : '';
    }

    function handleScopeCopyClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const scopeId = button.dataset.scopeId;
        const scopeName = decodeHtmlEntities(button.dataset.scopeName || '');
        const exportUrl = button.dataset.exportUrl || '';
        copyScopeTasks(scopeId, scopeName, exportUrl)
            .then((count) => {
                if (typeof count !== 'number') {
                    return;
                }
                const label = scopeName || 'this scope';
                displayFlashMessage(`Copied ${count} task${count === 1 ? '' : 's'} from "${label}" to the clipboard.`, 'success');
            })
            .catch((error) => {
                console.error('Unable to copy scope tasks.', error);
                const message = (error && error.message) || 'Unable to copy tasks for this scope.';
                displayFlashMessage(message, 'danger');
            });
    }

    function copyScopeTasks(scopeId, scopeName, exportUrl) {
        if (!scopeId) {
            return Promise.reject(new Error('Missing scope identifier.'));
        }
        const targetUrl = exportUrl || `/scope/${scopeId}/tasks/export`;
        return fetch(targetUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                Accept: 'application/json',
            },
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                if (!ok || !data || data.success !== true || !Array.isArray(data.tasks)) {
                    const message = (data && data.message) || 'Unable to copy tasks for this scope.';
                    throw new Error(message);
                }
                if (data.tasks.length === 0) {
                    displayFlashMessage(`There are no tasks to copy for "${scopeName || 'this scope'}".`, 'info');
                    return null;
                }
                const clipboardSections = data.tasks
                    .map((task, index) => {
                        const formatted = typeof window.formatTaskClipboardText === 'function'
                            ? window.formatTaskClipboardText(task)
                            : '';
                        return formatted ? `${index + 1}. ${formatted}` : null;
                    })
                    .filter(Boolean);
                if (clipboardSections.length === 0) {
                    throw new Error('No tasks could be formatted.');
                }
                const header = scopeName ? `${scopeName}\n` : '';
                const clipboardText = `${header}${clipboardSections.join('\n\n')}`;
                return copyTextToClipboard(clipboardText).then(() => clipboardSections.length);
            });
    }

    function copyTextToClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text);
        }
        return new Promise((resolve, reject) => {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'absolute';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                const successful = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (successful) {
                    resolve();
                } else {
                    reject(new Error('Copy command was unsuccessful.'));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    function handleDeleteButtonClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        if (typeof window.showConfirmationModal !== 'function') {
            return;
        }
        const actionUrl = button.dataset.confirmUrl;
        if (!actionUrl) {
            return;
        }
        const scopeName = button.dataset.scopeName || 'this scope';
        const scopeId = button.dataset.scopeId || '';
        window.showConfirmationModal({
            title: 'Delete scope',
            message: `Delete scope "${scopeName}"?`,
            description: `Deleting this scope will permanently remove "${scopeName}" and its ordering.`,
            details: [`Scope: ${scopeName}`, 'This action cannot be undone.'],
            confirmLabel: 'Delete scope',
            confirmVariant: 'danger',
        }).then((confirmed) => {
            if (!confirmed) {
                return;
            }
            fetch(actionUrl, {
                method: 'POST',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    Accept: 'application/json',
                },
            })
                .then((response) =>
                    response
                        .json()
                        .catch(() => ({}))
                        .then((data) => ({ ok: response.ok, data }))
                )
                .then(({ ok, data }) => {
                    if (!ok || !data || data.success !== true) {
                        const message = (data && data.message) || `Unable to delete "${scopeName}".`;
                        displayFlashMessage(message, 'danger');
                        return;
                    }
                    const message = (data && data.message) || `Scope "${scopeName}" deleted.`;
                    displayFlashMessage(message, 'success');
                    if (scopeId && getLastScopePreference() === String(scopeId)) {
                        setLastScopePreference(null);
                    }
                    const stayUrl = state.page ? state.page.dataset.stayUrl : null;
                    const redirectUrl = stayUrl || window.location.href;
                    window.setTimeout(() => {
                        window.location.href = redirectUrl;
                    }, 200);
                })
                .catch((error) => {
                    console.error('Unable to delete scope.', error);
                    displayFlashMessage(`Unable to delete "${scopeName}".`, 'danger');
                });
        });
    }

    function upsertScopeCard(scope) {
        if (!scope || !state.scopeList) {
            return;
        }
        const col = buildScopeCard(scope);
        const existing = state.scopeList.querySelector(`.col[data-scope-id="${scope.id}"]`);
        if (existing) {
            existing.replaceWith(col);
        } else {
            state.scopeList.appendChild(col);
        }
        bindCardControls(col);
        state.scopeList.classList.remove('d-none');
        if (state.emptyState) {
            state.emptyState.classList.add('d-none');
        }
    }

    function buildScopeCard(scope) {
        const col = document.createElement('div');
        col.className = 'col d-flex';
        col.dataset.scopeId = String(scope.id);

        const card = document.createElement('div');
        card.className = 'card h-100 w-100 border-secondary shadow-sm scope-card';
        card.dataset.scopeId = String(scope.id);
        card.dataset.scopeUrl = scope.urls && scope.urls.set ? scope.urls.set : '';
        card.dataset.scopeIsOwner = scope.is_owner ? 'true' : 'false';
        col.appendChild(card);

        const header = document.createElement('div');
        header.className = 'card-header bg-transparent border-0 pb-0';
        card.appendChild(header);

        const headerRow = document.createElement('div');
        headerRow.className = 'd-flex justify-content-between align-items-start gap-2';
        header.appendChild(headerRow);

        const badgesContainer = document.createElement('div');
        badgesContainer.className = 'd-flex align-items-center flex-wrap gap-2';
        headerRow.appendChild(badgesContainer);

        const grip = document.createElement('span');
        grip.title = 'Drag to reorder scopes';
        grip.innerHTML = '<i class="bi bi-grip-vertical"></i>';
        if (scope.is_owner) {
            grip.id = 'grip';
            grip.dataset.itemId = String(scope.id);
            grip.className = 'text-muted';
        } else {
            grip.className = 'text-muted opacity-50';
        }
        badgesContainer.appendChild(grip);

        if (scope.github_integration_enabled) {
            const badge = document.createElement('span');
            badge.className = 'badge text-bg-primary d-inline-flex align-items-center gap-1';
            const icon = document.createElement('i');
            icon.className = 'bi bi-github';
            icon.setAttribute('aria-hidden', 'true');
            badge.appendChild(icon);
            badge.appendChild(document.createTextNode('GitHub'));
            badgesContainer.appendChild(badge);
        }

        if (!scope.is_owner) {
            const sharedBadge = document.createElement('span');
            sharedBadge.className = 'badge text-bg-light text-muted';
            sharedBadge.textContent = 'Shared';
            badgesContainer.appendChild(sharedBadge);
        }

        const actions = document.createElement('div');
        actions.className = 'btn-group btn-group-sm';
        actions.setAttribute('role', 'group');
        actions.setAttribute('aria-label', 'Scope actions');
        headerRow.appendChild(actions);

        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.className = 'btn btn-outline-secondary scope-copy-btn';
        copyButton.dataset.scopeId = String(scope.id);
        copyButton.dataset.scopeName = scope.name || '';
        copyButton.dataset.exportUrl = scope.urls && scope.urls.export ? scope.urls.export : '';
        copyButton.setAttribute('aria-label', `Copy tasks for scope ${scope.name || ''}`.trim());
        copyButton.innerHTML = '<i class="bi bi-clipboard" aria-hidden="true"></i>';
        actions.appendChild(copyButton);

        if (scope.is_owner) {
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn btn-outline-secondary edit-scope-btn';
            editButton.dataset.bsToggle = 'modal';
            editButton.dataset.bsTarget = '#scope-modal';
            editButton.dataset.scopeId = String(scope.id);
            editButton.setAttribute('data-scope-name', scope.name || '');
            editButton.setAttribute('data-scope-description', scope.description || '');
            editButton.setAttribute('data-scope-github_enabled', scope.github_integration_enabled ? 'true' : 'false');
            editButton.setAttribute(
                'data-scope-github_repository',
                scope.github_repository ? JSON.stringify(scope.github_repository) : ''
            );
            editButton.setAttribute('aria-label', `Edit scope ${scope.name || ''}`.trim());
            editButton.innerHTML = '<i class="bi bi-pencil" aria-hidden="true"></i>';
            actions.appendChild(editButton);

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn btn-dark scope-delete-btn';
            deleteButton.dataset.confirmUrl = scope.urls && scope.urls.delete ? scope.urls.delete : '';
            deleteButton.dataset.scopeName = scope.name || '';
            deleteButton.dataset.scopeId = String(scope.id);
            deleteButton.setAttribute('aria-label', `Delete scope ${scope.name || ''}`.trim());
            deleteButton.innerHTML = '<i class="bi bi-trash3" aria-hidden="true"></i>';
            actions.appendChild(deleteButton);
        }

        const body = document.createElement('div');
        body.className = 'card-body position-relative d-flex flex-column';
        card.appendChild(body);

        const title = document.createElement('h2');
        title.className = 'h5 text-dark mb-2';
        title.textContent = scope.name || '';
        body.appendChild(title);

        if (scope.description) {
            const description = document.createElement('p');
            description.className = 'text-muted small mb-0';
            description.textContent = scope.description;
            body.appendChild(description);
        }

        const link = document.createElement('a');
        link.className = 'stretched-link text-decoration-none';
        link.href = scope.urls && scope.urls.set ? scope.urls.set : '#';
        link.dataset.scopeId = String(scope.id);
        link.setAttribute('aria-label', `Open scope ${scope.name || ''}`.trim());
        body.appendChild(link);

        return col;
    }

    function escapeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function decodeHtmlEntities(text) {
        if (typeof text !== 'string' || !text) {
            return '';
        }
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    function setLastScopePreference(scopeId) {
        if (typeof window.updatePreferenceData !== 'function') {
            return;
        }
        window.updatePreferenceData((data) => {
            data.lastScopeId = scopeId != null ? String(scopeId) : null;
            return data;
        });
    }

    function getLastScopePreference() {
        if (typeof window.readPreferenceData !== 'function') {
            return null;
        }
        const data = window.readPreferenceData();
        return data && data.lastScopeId ? String(data.lastScopeId) : null;
    }

    function shouldAutoNavigateToScope() {
        if (typeof window === 'undefined') {
            return false;
        }
        const params = new URLSearchParams(window.location.search);
        if (['1', 'true'].includes((params.get('stay') || '').toLowerCase())) {
            return false;
        }
        const referrer = document.referrer || '';
        if (!referrer) {
            return true;
        }
        try {
            const refUrl = new URL(referrer, window.location.origin);
            if (refUrl.origin !== window.location.origin) {
                return false;
            }
            const allowedPaths = new Set(['', '/', '/login', '/signup']);
            return allowedPaths.has(refUrl.pathname);
        } catch (error) {
            console.warn('Unable to evaluate referrer for auto scope selection.', error);
            return false;
        }
    }

    function attemptStoredScopeRedirect() {
        const cards = Array.from(document.querySelectorAll('.scope-card[data-scope-id][data-scope-url]'));
        if (cards.length === 0) {
            setLastScopePreference(null);
            return;
        }
        const storedScopeId = getLastScopePreference();
        let targetCard = null;
        if (storedScopeId) {
            targetCard = cards.find((card) => card.dataset.scopeId === storedScopeId) || null;
        }
        if (!targetCard) {
            targetCard = cards[0];
        }
        if (!targetCard) {
            setLastScopePreference(null);
            return;
        }
        const targetScopeId = targetCard.dataset.scopeId || null;
        const targetScopeUrl = targetCard.dataset.scopeUrl || '';
        setLastScopePreference(targetScopeId);
        if (!targetScopeUrl || !shouldAutoNavigateToScope()) {
            return;
        }
        window.setTimeout(() => {
            window.location.href = targetScopeUrl;
        }, 150);
    }
})();
