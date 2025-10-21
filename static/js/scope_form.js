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
        description: {
            field: null,
            isExpanded: false,
            collapsedHeight: 0,
            resizeFrame: null,
            pendingCollapse: false,
        },
        permissions: {
            canEditMetadata: true,
            repositoryLocked: false,
            projectLocked: false,
            labelLocked: false,
        },
    };

    const DEFAULT_MESSAGES = {
        createTitle: 'Create scope',
        createDescription: 'Provide a name and optional description to group related tasks.',
        createSubmit: 'Create scope',
        editTitle: 'Edit scope',
        editSubmit: 'Save changes',
        configureTitle: 'Configure GitHub',
        configureDescription: 'Connect your GitHub account for this shared scope.',
        configureSubmit: 'Save configuration',
    };

    const DESCRIPTION_TRANSITION = 'height 200ms ease, max-height 200ms ease';
    const DESCRIPTION_VIEWPORT_RATIO = 0.8;
    const DESCRIPTION_PADDING_BUFFER = 24;
    const SHARED_REPO_TOOLTIP = 'These fields are managed by the scope owner since you share the same repository.';

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
        initializeDescriptionField();
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
        const projectSelect = document.getElementById('scope-github-project-select');
        const milestoneSelect = document.getElementById('scope-github-milestone-select');
        const warning = document.querySelector('[data-github-warning]');
        const projectWarning = document.querySelector('[data-github-project-warning]');
        const milestoneWarning = document.querySelector('[data-github-milestone-warning]');
        const section = document.querySelector('[data-github-settings-section]');
        if (select && !select.dataset.reposLoaded) {
            select.dataset.reposLoaded = 'false';
        }
        if (projectSelect && !projectSelect.dataset.projectsLoaded) {
            projectSelect.dataset.projectsLoaded = 'false';
        }
        if (milestoneSelect && !milestoneSelect.dataset.milestonesLoaded) {
            milestoneSelect.dataset.milestonesLoaded = 'false';
        }
        return {
            toggle,
            select,
            projectSelect,
            milestoneSelect,
            warning,
            projectWarning,
            milestoneWarning,
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
            github_project: '',
            github_milestone: '',
            github_repository_locked: false,
            github_project_locked: false,
            github_label_locked: false,
            can_edit_metadata: true,
        };
    }

    function hydrateInitialState() {
        applyFormValues(state.initialState.data || getDefaultFormValues());
        applyFormErrors(state.form, state.initialState.errors || {});
        updateGithubSectionVisibility();
        if (state.initialState.data.github_enabled) {
            ensureGithubRepositoriesLoaded({ silent: true });
            ensureGithubMetadataLoaded({ silent: true });
        }
    }

    function bindCoreEvents() {
        if (state.addButton) {
            state.addButton.addEventListener('click', handleCreateButtonClick);
        }

        state.modalEl.addEventListener('show.bs.modal', handleModalShow);
        state.modalEl.addEventListener('shown.bs.modal', handleModalShown);
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
                scheduleDescriptionResize();
            });
        }
        if (github.select) {
            github.select.addEventListener('change', () => {
                github.select.dataset.selectedRepo = github.select.value || '';
                hideGithubWarning();
                hideGithubProjectWarning();
                hideGithubMilestoneWarning();
                if (github.projectSelect) {
                    github.projectSelect.dataset.selectedProject = '';
                }
                if (github.milestoneSelect) {
                    github.milestoneSelect.dataset.selectedMilestone = '';
                }
                if (github.select.value) {
                    loadMetadataForSelectedRepository({ silent: false });
                } else {
                    clearProjectSelect();
                    clearMilestoneSelect();
                }
                scheduleDescriptionResize();
            });
        }

        window.addEventListener('resize', handleViewportResize);
    }

    function initializeDescriptionField() {
        const field = state.form ? state.form.querySelector('[data-autoresize="scope-description"]') : null;
        state.description.field = field;
        state.description.isExpanded = false;
        state.description.resizeFrame = null;
        state.description.pendingCollapse = Boolean(field);
        if (!field) {
            return;
        }
        field.setAttribute('aria-expanded', 'false');
        field.style.resize = 'none';
        field.style.transition = DESCRIPTION_TRANSITION;
        field.style.overflowY = 'hidden';
        state.description.collapsedHeight = computeCollapsedHeight(field);
        field.addEventListener('focus', handleDescriptionFocus);
        field.addEventListener('blur', handleDescriptionBlur);
        field.addEventListener('input', handleDescriptionInput);
    }

    function handleDescriptionFocus() {
        expandDescriptionField({ immediate: false });
    }

    function handleDescriptionBlur() {
        collapseDescriptionField({ immediate: false });
    }

    function handleDescriptionInput() {
        if (state.description.isExpanded) {
            expandDescriptionField({ immediate: false });
        } else {
            collapseDescriptionField({ immediate: false });
        }
    }

    function handleViewportResize() {
        if (state.description.isExpanded) {
            scheduleDescriptionResize({ immediate: false });
        }
    }

    function expandDescriptionField({ immediate }) {
        const controller = state.description;
        if (!controller || !controller.field) {
            return;
        }
        const field = controller.field;
        controller.isExpanded = true;
        controller.pendingCollapse = false;
        controller.collapsedHeight = computeCollapsedHeight(field);
        const startHeight = field.getBoundingClientRect().height || controller.collapsedHeight;
        const maxHeight = computeDescriptionMaxHeight();
        const previousOverflow = field.style.overflowY;
        field.style.height = 'auto';
        const naturalHeight = field.scrollHeight;
        const targetHeight = Math.min(naturalHeight, maxHeight);
        field.style.overflowY = naturalHeight > maxHeight ? 'auto' : 'hidden';
        applyDescriptionHeight(field, targetHeight, maxHeight, immediate, startHeight);
        field.setAttribute('aria-expanded', 'true');
        if (previousOverflow && previousOverflow !== field.style.overflowY && field.style.overflowY === 'hidden') {
            field.scrollTop = 0;
        }
    }

    function collapseDescriptionField({ immediate }) {
        const controller = state.description;
        if (!controller || !controller.field) {
            return;
        }
        const field = controller.field;
        controller.isExpanded = false;
        controller.pendingCollapse = false;
        controller.collapsedHeight = computeCollapsedHeight(field);
        field.setAttribute('aria-expanded', 'false');
        field.style.overflowY = 'hidden';
        applyDescriptionHeight(field, controller.collapsedHeight, controller.collapsedHeight, immediate);
        field.scrollTop = 0;
    }

    function applyDescriptionHeight(field, targetHeight, maxHeight, immediate, startHeight) {
        if (!field) {
            return;
        }
        const resolvedTarget = Math.max(targetHeight || 0, 0);
        const resolvedMax = Math.max(maxHeight || 0, resolvedTarget);
        const previousTransition = field.style.transition || '';
        const defaultTransition = DESCRIPTION_TRANSITION;
        if (immediate) {
            field.style.transition = 'none';
        }
        const currentHeight = typeof startHeight === 'number' ? startHeight : field.getBoundingClientRect().height || resolvedTarget;
        if (!immediate) {
            field.style.height = `${currentHeight}px`;
            // Force reflow so the transition starts from the current height.
            void field.offsetHeight;
        }
        field.style.maxHeight = `${resolvedMax}px`;
        field.style.height = `${resolvedTarget}px`;
        if (immediate) {
            // Force reflow before re-enabling the transition to prevent jumpy animations on subsequent updates.
            void field.offsetHeight;
            field.style.transition = defaultTransition;
        } else if (!previousTransition) {
            field.style.transition = defaultTransition;
        }
    }

    function refreshDescriptionHeight({ immediate = false, preserveExpansion = true } = {}) {
        if (!state.description.field) {
            return;
        }
        if (!preserveExpansion) {
            state.description.isExpanded = false;
        }
        if (state.description.isExpanded) {
            expandDescriptionField({ immediate });
        } else {
            collapseDescriptionField({ immediate });
        }
    }

    function scheduleDescriptionResize({ immediate = false } = {}) {
        if (!state.description.field) {
            return;
        }
        const raf = window.requestAnimationFrame || function (callback) {
            return setTimeout(callback, 16);
        };
        const cancelRaf = window.cancelAnimationFrame || clearTimeout;
        if (state.description.resizeFrame) {
            cancelRaf(state.description.resizeFrame);
        }
        state.description.resizeFrame = raf(() => {
            state.description.resizeFrame = null;
            refreshDescriptionHeight({ immediate, preserveExpansion: true });
        });
    }

    function computeCollapsedHeight(field) {
        if (!field) {
            return 0;
        }
        const collapsedLines = parseInt(field.dataset.collapsedLines || field.getAttribute('rows') || '3', 10);
        const styles = window.getComputedStyle(field);
        let lineHeight = parseFloat(styles.lineHeight);
        if (Number.isNaN(lineHeight)) {
            const fontSize = parseFloat(styles.fontSize);
            lineHeight = Number.isNaN(fontSize) ? 16 : fontSize * 1.5;
        }
        const paddingTop = parseFloat(styles.paddingTop) || 0;
        const paddingBottom = parseFloat(styles.paddingBottom) || 0;
        const borderTop = parseFloat(styles.borderTopWidth) || 0;
        const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
        const collapsed = Math.round(collapsedLines * lineHeight + paddingTop + paddingBottom + borderTop + borderBottom);
        return Math.max(collapsed, 0);
    }

    function computeDescriptionMaxHeight() {
        if (!state.description.field) {
            return Math.floor(window.innerHeight * DESCRIPTION_VIEWPORT_RATIO);
        }
        const field = state.description.field;
        const collapsed = computeCollapsedHeight(field) || state.description.collapsedHeight || 0;
        const viewportLimit = Math.max(Math.floor(window.innerHeight * DESCRIPTION_VIEWPORT_RATIO), collapsed);
        if (!state.modalEl) {
            return viewportLimit;
        }
        const modalContent = state.modalEl.querySelector('.modal-content');
        if (!modalContent) {
            return viewportLimit;
        }
        const modalRect = modalContent.getBoundingClientRect();
        const fieldRect = field.getBoundingClientRect();
        if (!modalRect || modalRect.height === 0 || !fieldRect || fieldRect.height === 0) {
            return viewportLimit;
        }
        const otherContentHeight = modalRect.height - fieldRect.height;
        const available = viewportLimit - otherContentHeight - DESCRIPTION_PADDING_BUFFER;
        return Math.max(Math.min(available, viewportLimit), collapsed);
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
        state.permissions.canEditMetadata = true;
        state.permissions.repositoryLocked = false;
        state.permissions.projectLocked = false;
        state.permissions.labelLocked = false;
    }

    function handleEditButtonClick(event) {
        const trigger = event.currentTarget;
        state.formMode = 'edit';
        state.editingScopeId = trigger.dataset.scopeId || null;
        state.activeTrigger = trigger;
        state.formValues = readScopeValuesFromTrigger(trigger);
        state.permissions.canEditMetadata = state.formValues.can_edit_metadata !== false;
        state.permissions.repositoryLocked = Boolean(state.formValues.github_repository_locked);
        state.permissions.projectLocked = Boolean(state.formValues.github_project_locked);
        state.permissions.labelLocked = Boolean(state.formValues.github_label_locked);
    }

    function readScopeValuesFromTrigger(trigger) {
        if (!trigger) {
            return { ...getDefaultFormValues() };
        }
        const repoAttribute = trigger.getAttribute('data-scope-github_repository') || '';
        const projectAttribute = trigger.getAttribute('data-scope-github_project') || '';
        const milestoneAttribute = trigger.getAttribute('data-scope-github_milestone') || '';
        const repoLocked = (trigger.getAttribute('data-scope-github_repository_locked') || '').toLowerCase() === 'true';
        const projectLocked = (trigger.getAttribute('data-scope-github_project_locked') || '').toLowerCase() === 'true';
        const labelLocked = (trigger.getAttribute('data-scope-github_label_locked') || '').toLowerCase() === 'true';
        const canEditMetadata = (trigger.getAttribute('data-scope-can-edit-metadata') || 'true').toLowerCase() === 'true';
        return {
            name: trigger.getAttribute('data-scope-name') || '',
            description: trigger.getAttribute('data-scope-description') || '',
            github_enabled: (trigger.getAttribute('data-scope-github_enabled') || '').toLowerCase() === 'true',
            github_repository: repoAttribute,
            github_project: projectAttribute,
            github_milestone: milestoneAttribute,
            github_repository_locked: repoLocked,
            github_project_locked: projectLocked,
            github_label_locked: labelLocked,
            can_edit_metadata: canEditMetadata,
        };
    }

    function handleModalShow(event) {
        const trigger = (event && event.relatedTarget) || state.activeTrigger || null;
        if (trigger && trigger.classList.contains('edit-scope-btn')) {
            state.formMode = 'edit';
            state.editingScopeId = trigger.getAttribute('data-scope-id') || state.editingScopeId;
            state.activeTrigger = trigger;
            state.formValues = readScopeValuesFromTrigger(trigger);
        } else if (!state.formMode || state.formMode === 'edit') {
            state.formMode = 'create';
            state.editingScopeId = null;
            state.activeTrigger = trigger;
        }

        if (state.description) {
            state.description.pendingCollapse = true;
            state.description.isExpanded = false;
        }

        if (state.formMode === 'edit') {
            applyFormValues(state.formValues || getDefaultFormValues());
            applyFormErrors(state.form, {});
            const modalMessages = state.permissions.canEditMetadata
                ? {
                      title: DEFAULT_MESSAGES.editTitle,
                      description: buildEditScopeDescription(state.formValues?.name || ''),
                      submitLabel: DEFAULT_MESSAGES.editSubmit,
                  }
                : {
                      title: DEFAULT_MESSAGES.configureTitle,
                      description: DEFAULT_MESSAGES.configureDescription,
                      submitLabel: DEFAULT_MESSAGES.configureSubmit,
                  };
            setModalContent(modalMessages);
            updateGithubSectionVisibility();
            ensureGithubRepositoriesLoaded({ silent: true });
            ensureGithubMetadataLoaded({ silent: true });
        } else {
            const defaults = state.initialState?.data || getDefaultFormValues();
            applyFormValues(defaults);
            applyFormErrors(state.form, state.initialState?.errors || {});
            setModalContent({
                title: DEFAULT_MESSAGES.createTitle,
                description: DEFAULT_MESSAGES.createDescription,
                submitLabel: DEFAULT_MESSAGES.createSubmit,
            });
            updateGithubSectionVisibility();
            if (defaults.github_enabled) {
                ensureGithubRepositoriesLoaded({ silent: true });
                ensureGithubMetadataLoaded({ silent: true });
            } else {
                hideGithubWarning();
            }
        }
    }

    function handleModalShown() {
        if (!state.description || !state.description.field) {
            return;
        }
        if (state.description.pendingCollapse) {
            refreshDescriptionHeight({ immediate: true, preserveExpansion: false });
            state.description.pendingCollapse = false;
        } else {
            scheduleDescriptionResize({ immediate: false });
        }
    }

    function handleModalHidden() {
        resetFormState();
        state.formMode = 'create';
        state.editingScopeId = null;
        state.activeTrigger = null;
        state.formValues = { ...getDefaultFormValues() };
        if (state.description) {
            state.description.isExpanded = false;
            state.description.pendingCollapse = true;
            refreshDescriptionHeight({ immediate: true, preserveExpansion: false });
        }
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
                            github_project: data.values.github_project || '',
                            github_milestone: data.values.github_milestone || '',
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
            github_project: values.github_project || '',
            github_milestone: values.github_milestone || '',
        };
        if (!values.github_enabled) {
            payload.github_repository = '';
            payload.github_project = '';
            payload.github_milestone = '';
        }
        return payload;
    }

    function getCurrentFormValues() {
        const values = getDefaultFormValues();
        const nameField = state.form.querySelector('[data-field="name"]');
        const descriptionField = state.form.querySelector('[data-field="description"]');
        const githubToggle = state.github.toggle;
        const githubSelect = state.github.select;
        const projectSelect = state.github.projectSelect;
        const milestoneSelect = state.github.milestoneSelect;

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
        if (projectSelect) {
            const explicitProject = projectSelect.value || projectSelect.dataset.selectedProject || '';
            values.github_project = explicitProject;
        }
        if (milestoneSelect) {
            const explicitMilestone =
                milestoneSelect.value || milestoneSelect.dataset.selectedMilestone || '';
            values.github_milestone = explicitMilestone;
        }
        values.github_repository_locked = Boolean(state.permissions.repositoryLocked);
        values.github_project_locked = Boolean(state.permissions.projectLocked);
        values.github_label_locked = Boolean(state.permissions.labelLocked);
        values.can_edit_metadata = Boolean(state.permissions.canEditMetadata);
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
        const projectSelect = state.github.projectSelect;
        const milestoneSelect = state.github.milestoneSelect;

        state.permissions.canEditMetadata = data.can_edit_metadata !== false;
        state.permissions.repositoryLocked = Boolean(data.github_repository_locked);
        state.permissions.projectLocked = Boolean(data.github_project_locked);
        state.permissions.labelLocked = Boolean(data.github_label_locked);

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
        if (projectSelect) {
            projectSelect.dataset.selectedProject = data.github_project || '';
            if (projectSelect.dataset.projectsLoaded === 'true' && data.github_project) {
                applySelectedProject();
            } else {
                projectSelect.value = '';
            }
        }
        if (milestoneSelect) {
            milestoneSelect.dataset.selectedMilestone = data.github_milestone || '';
            if (milestoneSelect.dataset.milestonesLoaded === 'true' && data.github_milestone) {
                applySelectedMilestone();
            } else {
                milestoneSelect.value = '';
            }
        }
        applyLockIndicators();
        updateGithubSectionVisibility();
        if (githubToggle && githubToggle.checked) {
            ensureGithubRepositoriesLoaded({ silent: true });
            ensureGithubMetadataLoaded({ silent: true });
        }
        if (state.description && state.description.field) {
            refreshDescriptionHeight({ immediate: true, preserveExpansion: true });
        }
    }

    function applyLockIndicators() {
        const nameField = state.form.querySelector('[data-field="name"]');
        const descriptionField = state.form.querySelector('[data-field="description"]');
        const repoSelect = state.github.select;
        const projectSelect = state.github.projectSelect;
        const sharedNotice = state.form.querySelector('[data-github-shared-notice]');

        const metadataLocked = !state.permissions.canEditMetadata;
        const nameWrapper = nameField ? nameField.closest('.form-floating') : null;
        const descriptionWrapper = descriptionField ? descriptionField.closest('.form-floating') : null;

        if (nameWrapper) {
            nameWrapper.classList.toggle('d-none', metadataLocked);
        }
        if (descriptionWrapper) {
            descriptionWrapper.classList.toggle('d-none', metadataLocked);
        }

        if (nameField) {
            nameField.readOnly = metadataLocked;
            nameField.classList.toggle('bg-body-tertiary', metadataLocked);
            if (!metadataLocked) {
                nameField.removeAttribute('aria-readonly');
            } else {
                nameField.setAttribute('aria-readonly', 'true');
            }
        }
        if (descriptionField) {
            descriptionField.readOnly = metadataLocked;
            descriptionField.classList.toggle('bg-body-tertiary', metadataLocked);
            if (!metadataLocked) {
                descriptionField.removeAttribute('aria-readonly');
            } else {
                descriptionField.setAttribute('aria-readonly', 'true');
            }
        }

        if (repoSelect) {
            repoSelect.disabled = Boolean(state.permissions.repositoryLocked);
            if (state.permissions.repositoryLocked) {
                repoSelect.setAttribute('title', SHARED_REPO_TOOLTIP);
                repoSelect.dataset.locked = 'true';
            } else {
                repoSelect.removeAttribute('title');
                delete repoSelect.dataset.locked;
            }
        }

        if (projectSelect) {
            projectSelect.disabled = Boolean(state.permissions.projectLocked);
            if (state.permissions.projectLocked) {
                projectSelect.setAttribute('title', SHARED_REPO_TOOLTIP);
                projectSelect.dataset.locked = 'true';
            } else {
                projectSelect.removeAttribute('title');
                delete projectSelect.dataset.locked;
            }
        }

        if (sharedNotice) {
            const shouldShowNotice = Boolean(
                state.permissions.repositoryLocked || state.permissions.projectLocked
            );
            sharedNotice.classList.toggle('d-none', !shouldShowNotice);
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
            hideGithubProjectWarning();
            hideGithubMilestoneWarning();
            clearProjectSelect({ resetSelection: false });
            clearMilestoneSelect({ resetSelection: false });
        }
        if (shouldShow) {
            ensureGithubRepositoriesLoaded({ silent: true });
            ensureGithubMetadataLoaded({ silent: true });
        }
        applyLockIndicators();
        scheduleDescriptionResize({ immediate: false });
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
                clearProjectSelect();
                clearMilestoneSelect();
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
            clearProjectSelect();
            clearMilestoneSelect();
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
        if (select.dataset.selectedRepo) {
            ensureGithubMetadataLoaded({ silent: true });
        } else {
            clearProjectSelect();
            clearMilestoneSelect();
        }
        scheduleDescriptionResize({ immediate: false });
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
        scheduleDescriptionResize({ immediate: false });
    }

    function getSelectedRepository() {
        const select = state.github.select;
        if (!select) {
            return null;
        }
        const value = select.dataset.selectedRepo || '';
        if (!value) {
            return null;
        }
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    }

    function ensureGithubMetadataLoaded({ silent } = { silent: false }) {
        const github = state.github;
        if (!github.toggle || !github.select || github.toggle.disabled || !github.toggle.checked) {
            return;
        }
        const repo = getSelectedRepository();
        if (!repo) {
            return;
        }
        const needsProjects =
            github.projectSelect && github.projectSelect.dataset.projectsLoaded !== 'true';
        const needsMilestones =
            github.milestoneSelect && github.milestoneSelect.dataset.milestonesLoaded !== 'true';
        if (!needsProjects && !needsMilestones) {
            return;
        }
        loadMetadataForSelectedRepository({ silent: Boolean(silent) });
    }

    function loadMetadataForSelectedRepository({ silent }) {
        const repo = getSelectedRepository();
        if (!repo) {
            return;
        }
        loadGithubProjects(repo, { silent: Boolean(silent) });
        loadGithubMilestones(repo, { silent: Boolean(silent) });
    }

    function clearProjectSelect({ resetSelection = true } = {}) {
        const select = state.github.projectSelect;
        if (!select) {
            return;
        }
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a project';
        select.appendChild(placeholder);
        select.disabled = true;
        select.dataset.projectsLoaded = 'false';
        if (resetSelection) {
            select.dataset.selectedProject = '';
        }
        scheduleDescriptionResize({ immediate: false });
    }

    function clearMilestoneSelect({ resetSelection = true } = {}) {
        const select = state.github.milestoneSelect;
        if (!select) {
            return;
        }
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a milestone';
        select.appendChild(placeholder);
        select.disabled = true;
        select.dataset.milestonesLoaded = 'false';
        if (resetSelection) {
            select.dataset.selectedMilestone = '';
        }
        scheduleDescriptionResize({ immediate: false });
    }

    function setProjectSelectLoading(isLoading) {
        const select = state.github.projectSelect;
        if (!select) {
            return;
        }
        if (isLoading) {
            select.disabled = true;
            select.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Loading projects...';
            select.appendChild(option);
        } else if (select.dataset.projectsLoaded === 'true') {
            select.disabled = false;
        } else {
            clearProjectSelect({ resetSelection: false });
        }
        scheduleDescriptionResize({ immediate: false });
    }

    function setMilestoneSelectLoading(isLoading) {
        const select = state.github.milestoneSelect;
        if (!select) {
            return;
        }
        if (isLoading) {
            select.disabled = true;
            select.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Loading milestones...';
            select.appendChild(option);
        } else if (select.dataset.milestonesLoaded === 'true') {
            select.disabled = false;
        } else {
            clearMilestoneSelect({ resetSelection: false });
        }
        scheduleDescriptionResize({ immediate: false });
    }

    function applySelectedProject() {
        const select = state.github.projectSelect;
        if (!select) {
            return;
        }
        const selectedValue = select.dataset.selectedProject || '';
        if (!selectedValue) {
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

    function applySelectedMilestone() {
        const select = state.github.milestoneSelect;
        if (!select) {
            return;
        }
        const selectedValue = select.dataset.selectedMilestone || '';
        if (!selectedValue) {
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
                    if (value && value.number === parsed.number) {
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

    function showGithubProjectWarning(message) {
        const alert = state.github.projectWarning;
        if (!alert) {
            return;
        }
        if (typeof message === 'string' && message.trim()) {
            alert.textContent = message.trim();
        }
        alert.classList.remove('d-none');
        scheduleDescriptionResize({ immediate: false });
    }

    function hideGithubProjectWarning() {
        const alert = state.github.projectWarning;
        if (!alert) {
            return;
        }
        alert.classList.add('d-none');
        scheduleDescriptionResize({ immediate: false });
    }

    function showGithubMilestoneWarning(message) {
        const alert = state.github.milestoneWarning;
        if (!alert) {
            return;
        }
        if (typeof message === 'string' && message.trim()) {
            alert.textContent = message.trim();
        }
        alert.classList.remove('d-none');
        scheduleDescriptionResize({ immediate: false });
    }

    function hideGithubMilestoneWarning() {
        const alert = state.github.milestoneWarning;
        if (!alert) {
            return;
        }
        alert.classList.add('d-none');
        scheduleDescriptionResize({ immediate: false });
    }

    function loadGithubProjects(repo, { silent }) {
        const select = state.github.projectSelect;
        if (!select) {
            return;
        }
        setProjectSelectLoading(true);
        hideGithubProjectWarning();
        fetch('/api/github/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ repository: repo }),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                populateProjectSelect(data, ok, silent);
            })
            .catch((error) => {
                console.error('Unable to load GitHub projects.', error);
                select.dataset.projectsLoaded = 'false';
                select.disabled = true;
                if (!silent) {
                    displayFlashMessage('Unable to load GitHub projects.', 'danger');
                }
            })
            .finally(() => {
                setProjectSelectLoading(false);
            });
    }

    function populateProjectSelect(payload, ok, silent) {
        const select = state.github.projectSelect;
        if (!select) {
            return;
        }
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a project';
        select.appendChild(placeholder);

        if (!ok || !payload || payload.success !== true || !Array.isArray(payload.projects)) {
            select.disabled = true;
            select.dataset.projectsLoaded = 'false';
            if (payload && payload.permission_error) {
                const message = payload.message || 'Unable to load projects for this repository.';
                showGithubProjectWarning(message);
            } else if (!silent) {
                const message = (payload && payload.message) || 'Unable to load GitHub projects.';
                displayFlashMessage(message, 'danger');
            }
            return;
        }

        hideGithubProjectWarning();
        if (payload.projects.length === 0) {
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = 'No projects available';
            select.appendChild(emptyOption);
            select.disabled = false;
            select.dataset.projectsLoaded = 'true';
            applySelectedProject();
            scheduleDescriptionResize({ immediate: false });
            return;
        }

        payload.projects.forEach((project) => {
            const option = document.createElement('option');
            option.value = JSON.stringify(project);
            option.textContent = project.name || `Project #${project.id}`;
            select.appendChild(option);
        });
        select.disabled = false;
        select.dataset.projectsLoaded = 'true';
        applySelectedProject();
        scheduleDescriptionResize({ immediate: false });
    }

    function loadGithubMilestones(repo, { silent }) {
        const select = state.github.milestoneSelect;
        if (!select) {
            return;
        }
        setMilestoneSelectLoading(true);
        hideGithubMilestoneWarning();
        fetch('/api/github/milestones', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ repository: repo }),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                populateMilestoneSelect(data, ok, silent);
            })
            .catch((error) => {
                console.error('Unable to load GitHub milestones.', error);
                select.dataset.milestonesLoaded = 'false';
                select.disabled = true;
                if (!silent) {
                    displayFlashMessage('Unable to load GitHub milestones.', 'danger');
                }
            })
            .finally(() => {
                setMilestoneSelectLoading(false);
            });
    }

    function populateMilestoneSelect(payload, ok, silent) {
        const select = state.github.milestoneSelect;
        if (!select) {
            return;
        }
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a milestone';
        select.appendChild(placeholder);

        if (!ok || !payload || payload.success !== true || !Array.isArray(payload.milestones)) {
            select.disabled = true;
            select.dataset.milestonesLoaded = 'false';
            if (payload && payload.permission_error) {
                const message = payload.message || 'Unable to load milestones for this repository.';
                showGithubMilestoneWarning(message);
            } else if (!silent) {
                const message = (payload && payload.message) || 'Unable to load GitHub milestones.';
                displayFlashMessage(message, 'danger');
            }
            return;
        }

        hideGithubMilestoneWarning();
        if (payload.milestones.length === 0) {
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = 'No milestones available';
            select.appendChild(emptyOption);
            select.disabled = false;
            select.dataset.milestonesLoaded = 'true';
            applySelectedMilestone();
            scheduleDescriptionResize({ immediate: false });
            return;
        }

        payload.milestones.forEach((milestone) => {
            const option = document.createElement('option');
            option.value = JSON.stringify(milestone);
            const stateLabel = milestone.state && milestone.state.toLowerCase() === 'closed' ? ' (closed)' : '';
            option.textContent = `${milestone.title}${stateLabel}`;
            select.appendChild(option);
        });
        select.disabled = false;
        select.dataset.milestonesLoaded = 'true';
        applySelectedMilestone();
        scheduleDescriptionResize({ immediate: false });
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
            scheduleDescriptionResize({ immediate: false });
        }
    }

    function hideGithubWarning() {
        if (state.github.warning) {
            state.github.warning.classList.add('d-none');
            scheduleDescriptionResize({ immediate: false });
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
                        let formatted;
                        if (typeof window.formatTaskClipboardText === 'function') {
                            formatted = window.formatTaskClipboardText(task);
                        } else {
                            // Basic fallback formatting
                            if (!window._formatTaskClipboardTextWarned) {
                                console.warn('window.formatTaskClipboardText is not defined. Using basic fallback formatting for tasks.');
                                window._formatTaskClipboardTextWarned = true;
                            }
                            formatted = [
                                task.title ? `Title: ${task.title}` : '',
                                task.description ? `Description: ${task.description}` : '',
                                task.id ? `ID: ${task.id}` : ''
                            ].filter(Boolean).join('\n');
                        }
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
        updateScopeEditTriggers(scope);
        state.scopeList.classList.remove('d-none');
        if (state.emptyState) {
            state.emptyState.classList.add('d-none');
        }
        document.dispatchEvent(
            new CustomEvent('scope:updated', {
                detail: { scope },
            })
        );
    }

    function updateScopeEditTriggers(scope) {
        if (!scope || !scope.id) {
            return;
        }
        const triggers = document.querySelectorAll(
            `.edit-scope-btn[data-scope-id="${scope.id}"]`
        );
        if (!triggers.length) {
            return;
        }
        const repoAttribute = serializeScopeAttribute(scope.github_repository);
        const projectAttribute = serializeScopeAttribute(scope.github_project);
        const milestoneAttribute = serializeScopeAttribute(scope.github_milestone);
        triggers.forEach((button) => {
            button.setAttribute('data-scope-name', scope.name || '');
            button.setAttribute('data-scope-description', scope.description || '');
            button.setAttribute(
                'data-scope-github_enabled',
                scope.github_integration_enabled ? 'true' : 'false'
            );
            button.setAttribute('data-scope-github_repository', repoAttribute);
            button.setAttribute('data-scope-github_project', projectAttribute);
            button.setAttribute('data-scope-github_milestone', milestoneAttribute);
            button.setAttribute(
                'data-scope-github_repository_locked',
                scope.github_repository_locked ? 'true' : 'false'
            );
            button.setAttribute(
                'data-scope-github_project_locked',
                scope.github_project_locked ? 'true' : 'false'
            );
            button.setAttribute(
                'data-scope-github_label_locked',
                scope.github_label_locked ? 'true' : 'false'
            );
            button.setAttribute(
                'data-scope-can-edit-metadata',
                scope.is_owner ? 'true' : 'false'
            );
        });
    }

    function serializeScopeAttribute(value) {
        if (!value) {
            return '';
        }
        try {
            return JSON.stringify(value);
        } catch (error) {
            return '';
        }
    }

    function buildScopeCard(scope) {
        const shareState = scope.share_state || {};
        const shareCount = Number(shareState.accepted_count || 0);
        const pendingCount = Number(shareState.pending_count || 0);

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

        if (scope.is_owner) {
            const ownerShareBadge = document.createElement('span');
            ownerShareBadge.className = 'badge text-bg-light text-muted';
            ownerShareBadge.dataset.shareIndicator = 'true';
            ownerShareBadge.dataset.scopeId = String(scope.id);
            if (!shareCount) {
                ownerShareBadge.classList.add('d-none');
            }
            ownerShareBadge.textContent = 'Shared';
            badgesContainer.appendChild(ownerShareBadge);
        } else {
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
            const shareButton = document.createElement('button');
            shareButton.type = 'button';
            shareButton.className = shareCount > 0 ? 'btn btn-primary scope-share-btn' : 'btn btn-outline-secondary scope-share-btn';
            shareButton.dataset.scopeId = String(scope.id);
            shareButton.dataset.shareCount = String(shareCount);
            shareButton.dataset.sharePending = pendingCount > 0 ? 'true' : 'false';
            shareButton.setAttribute('aria-label', `Manage sharing for ${scope.name || ''}`.trim());
            shareButton.innerHTML = `<i class="bi ${shareCount > 0 ? 'bi-share-fill' : 'bi-share'}" aria-hidden="true"></i>`;
            actions.appendChild(shareButton);

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
            editButton.setAttribute(
                'data-scope-github_project',
                scope.github_project ? JSON.stringify(scope.github_project) : ''
            );
            editButton.setAttribute(
                'data-scope-github_milestone',
                scope.github_milestone ? JSON.stringify(scope.github_milestone) : ''
            );
            editButton.setAttribute(
                'data-scope-github_repository_locked',
                scope.github_repository_locked ? 'true' : 'false'
            );
            editButton.setAttribute(
                'data-scope-github_project_locked',
                scope.github_project_locked ? 'true' : 'false'
            );
            editButton.setAttribute(
                'data-scope-github_label_locked',
                scope.github_label_locked ? 'true' : 'false'
            );
            editButton.setAttribute('data-scope-can-edit-metadata', 'true');
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
        } else {
            const configureButton = document.createElement('button');
            configureButton.type = 'button';
            configureButton.className = 'btn btn-outline-secondary edit-scope-btn';
            configureButton.dataset.bsToggle = 'modal';
            configureButton.dataset.bsTarget = '#scope-modal';
            configureButton.dataset.scopeId = String(scope.id);
            configureButton.setAttribute('data-scope-name', scope.name || '');
            configureButton.setAttribute('data-scope-description', scope.description || '');
            configureButton.setAttribute(
                'data-scope-github_enabled',
                scope.github_integration_enabled ? 'true' : 'false'
            );
            configureButton.setAttribute(
                'data-scope-github_repository',
                scope.github_repository ? JSON.stringify(scope.github_repository) : ''
            );
            configureButton.setAttribute(
                'data-scope-github_project',
                scope.github_project ? JSON.stringify(scope.github_project) : ''
            );
            configureButton.setAttribute(
                'data-scope-github_milestone',
                scope.github_milestone ? JSON.stringify(scope.github_milestone) : ''
            );
            configureButton.setAttribute(
                'data-scope-github_repository_locked',
                scope.github_repository_locked ? 'true' : 'false'
            );
            configureButton.setAttribute(
                'data-scope-github_project_locked',
                scope.github_project_locked ? 'true' : 'false'
            );
            configureButton.setAttribute(
                'data-scope-github_label_locked',
                scope.github_label_locked ? 'true' : 'false'
            );
            configureButton.setAttribute('data-scope-can-edit-metadata', 'false');
            configureButton.setAttribute(
                'aria-label',
                `Configure GitHub for scope ${scope.name || ''}`.trim()
            );
            configureButton.innerHTML = '<i class="bi bi-github" aria-hidden="true"></i>';
            actions.appendChild(configureButton);

            const leaveButton = document.createElement('button');
            leaveButton.type = 'button';
            leaveButton.className = 'btn btn-outline-secondary scope-leave-btn';
            leaveButton.dataset.scopeId = String(scope.id);
            leaveButton.dataset.scopeName = scope.name || '';
            leaveButton.setAttribute('aria-label', `Leave scope ${scope.name || ''}`.trim());
            leaveButton.innerHTML = '<i class="bi bi-x-circle" aria-hidden="true"></i>';
            actions.appendChild(leaveButton);
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

    function updateGithubSectionVisibility() {
        const github = state.github;
        if (!github.section) {
            return;
        }
        
        if (github.toggle && github.toggle.checked) {
            // Show the section with animation
            github.section.style.display = 'block';
            // Use a small timeout to ensure the display change takes effect before removing collapsed class
            setTimeout(() => {
                github.section.classList.remove('collapsed');
            }, 10);
        } else {
            // Hide the section with animation
            github.section.classList.add('collapsed');
            // After animation completes, set display: none
            setTimeout(() => {
                if (github.section.classList.contains('collapsed')) {
                    github.section.style.display = 'none';
                }
            }, 300); // Match the CSS transition duration
        }
    }

    function showGithubWarning() {
        const github = state.github;
        if (github.warning) {
            github.warning.classList.remove('d-none');
        }
    }

    function hideGithubWarning() {
        const github = state.github;
        if (github.warning) {
            github.warning.classList.add('d-none');
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
