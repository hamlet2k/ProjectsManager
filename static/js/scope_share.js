(function () {
    'use strict';

    const state = {
        modalEl: null,
        modal: null,
        shareList: null,
        errorAlert: null,
        successAlert: null,
        emptyMessage: null,
        form: null,
        submitButton: null,
        csrfField: null,
        currentScopeId: null,
        currentTrigger: null,
    };

    document.addEventListener('DOMContentLoaded', initializeSharing);

    function initializeSharing() {
        state.modalEl = document.getElementById('scope-share-modal');
        if (!state.modalEl || typeof bootstrap === 'undefined') {
            return;
        }
        state.modal = bootstrap.Modal.getOrCreateInstance(state.modalEl);
        state.shareList = state.modalEl.querySelector('[data-share-list]');
        state.errorAlert = state.modalEl.querySelector('[data-share-error]');
        state.successAlert = state.modalEl.querySelector('[data-share-success]');
        state.emptyMessage = state.modalEl.querySelector('[data-share-empty-message]');
        state.form = state.modalEl.querySelector('[data-share-form]');
        state.submitButton = state.modalEl.querySelector('[data-share-submit]');
        state.csrfField = state.form ? state.form.querySelector('input[name="csrf_token"]') : null;

        bindEvents();
    }

    function bindEvents() {
        document.addEventListener('click', handleDocumentClick, true);
        if (state.form) {
            state.form.addEventListener('submit', handleShareSubmit);
        }
        if (state.modalEl) {
            state.modalEl.addEventListener('hidden.bs.modal', resetModal);
        }
        document.addEventListener('scope:updated', (event) => {
            const scope = event && event.detail ? event.detail.scope : null;
            if (scope) {
                updateScopeShareUI(scope);
            }
        });
    }

    function handleDocumentClick(event) {
        const shareButton = event.target.closest('.scope-share-btn');
        if (shareButton) {
            event.preventDefault();
            openShareModal(shareButton.dataset.scopeId || null, shareButton);
            return;
        }
        const removeButton = event.target.closest('[data-share-remove]');
        if (removeButton) {
            event.preventDefault();
            handleRemoveShare(removeButton);
            return;
        }
        const resendButton = event.target.closest('[data-share-resend]');
        if (resendButton) {
            event.preventDefault();
            handleResendShare(resendButton);
            return;
        }
        const leaveButton = event.target.closest('.scope-leave-btn');
        if (leaveButton) {
            event.preventDefault();
            handleLeaveScope(leaveButton);
        }
    }

    function openShareModal(scopeId, trigger) {
        if (!scopeId) {
            return;
        }
        state.currentScopeId = scopeId;
        state.currentTrigger = trigger || null;
        clearAlerts();
        disableSubmit(true);
        if (state.modal) {
            state.modal.show();
        }
        fetch(`/scope/${scopeId}/shares`, {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                if (!data) {
                    throw new Error('Invalid response.');
                }
                if (data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (!ok || data.success !== true) {
                    showError(data.message || 'Unable to load sharing settings.');
                    return;
                }
                renderShareModal(data.scope || {}, data.shares || []);
                showSuccess(data.message || 'Sharing settings loaded.');
            })
            .catch((error) => {
                console.error('Unable to load scope sharing data.', error);
                showError('Unable to load sharing settings. Please try again.');
            })
            .finally(() => {
                disableSubmit(false);
            });
    }

    function handleShareSubmit(event) {
        event.preventDefault();
        if (!state.currentScopeId || !state.form) {
            return;
        }
        const identifierField = state.form.querySelector('[name="identifier"]');
        const roleField = state.form.querySelector('[name="role"]');
        const identifier = identifierField ? identifierField.value.trim() : '';
        const role = roleField ? roleField.value : 'editor';

        clearAlerts();
        if (!identifier) {
            setFieldError('Please provide a username or email address.');
            return;
        }

        disableSubmit(true);

        fetch(`/scope/${state.currentScopeId}/share`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                identifier,
                role,
                csrf_token: readCsrfToken(),
            }),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                if (data && data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (!data) {
                    throw new Error('Invalid response payload.');
                }
                if (!ok || data.success !== true) {
                    const message = data.message || 'Unable to share this scope.';
                    showError(message);
                    if (message) {
                        setFieldError(message);
                    }
                    return;
                }
                resetForm();
                renderShareModal(data.scope || {}, data.shares || []);
                showSuccess(data.message || 'Scope shared.');
                updateScopeShareUI(data.scope || {});
            })
            .catch((error) => {
                console.error('Unable to share scope.', error);
                showError('Unable to share this scope. Please try again.');
            })
            .finally(() => {
                disableSubmit(false);
            });
    }

    function handleRemoveShare(button) {
        const shareId = button.dataset.shareRemove;
        const scopeId = button.dataset.scopeId;
        if (!shareId || !scopeId) {
            return;
        }
        disableShareAction(button, true);
        fetch(`/scope/${scopeId}/share/${shareId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ csrf_token: readCsrfToken() }),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                if (data && data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (!data) {
                    throw new Error('Invalid response payload.');
                }
                if (!ok || data.success !== true) {
                    showError(data.message || 'Unable to revoke access.');
                    return;
                }
                renderShareModal(data.scope || {}, data.shares || []);
                showSuccess(data.message || 'Access revoked.');
                updateScopeShareUI(data.scope || {});
            })
            .catch((error) => {
                console.error('Unable to revoke scope share.', error);
                showError('Unable to revoke access. Please try again.');
            })
            .finally(() => {
                disableShareAction(button, false);
            });
    }

    function handleResendShare(button) {
        const shareId = button.dataset.shareResend;
        const scopeId = button.dataset.scopeId;
        if (!shareId || !scopeId) {
            return;
        }
        disableShareAction(button, true);
        fetch(`/scope/${scopeId}/share/${shareId}/resend`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ csrf_token: readCsrfToken() }),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                if (data && data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (!data) {
                    throw new Error('Invalid response payload.');
                }
                if (!ok || data.success !== true) {
                    showError(data.message || 'Unable to resend the invitation.');
                    return;
                }
                renderShareModal(data.scope || {}, data.shares || []);
                showSuccess(data.message || 'Invitation resent.');
                updateScopeShareUI(data.scope || {});
            })
            .catch((error) => {
                console.error('Unable to resend invitation.', error);
                showError('Unable to resend the invitation. Please try again.');
            })
            .finally(() => {
                disableShareAction(button, false);
            });
    }

    function handleLeaveScope(button) {
        const scopeId = button.dataset.scopeId;
        if (!scopeId) {
            return;
        }
        const scopeName = button.dataset.scopeName || '';
        const normalizedName = scopeName.trim();
        let confirmationPromise;
        if (typeof window.showConfirmationModal === 'function') {
            confirmationPromise = window.showConfirmationModal({
                title: 'Abandon scope?',
                message: normalizedName ? `Abandon scope "${normalizedName}"?` : 'Abandon this scope?',
                description:
                    'Abandoning this scope removes your access. Tasks, tags, and configurations remain available to the scope owner and other collaborators.',
                details: normalizedName ? [`Scope: ${normalizedName}`] : [],
                confirmLabel: 'Abandon scope',
                confirmVariant: 'danger',
            });
        } else {
            const fallbackConfirmation =
                typeof window.confirm === 'function'
                    ? window.confirm('Are you sure you want to leave this scope?')
                    : true;
            confirmationPromise = Promise.resolve(fallbackConfirmation);
        }
        Promise.resolve(confirmationPromise)
            .then((confirmed) => {
                if (!confirmed) {
                    return null;
                }
                button.disabled = true;
                return fetch(`/scope/${scopeId}/share/self`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify({ csrf_token: readCsrfToken() }),
                })
                    .then((response) =>
                        response
                            .json()
                            .catch(() => ({}))
                            .then((data) => ({ ok: response.ok, data }))
                    )
                    .then(({ ok, data }) => {
                        if (data && data.csrf_token) {
                            updateCsrfToken(data.csrf_token);
                        }
                        if (!data) {
                            throw new Error('Invalid response payload.');
                        }
                        if (!ok || data.success !== true) {
                            const message = data.message || 'Unable to leave this scope.';
                            if (typeof displayFlashMessage === 'function') {
                                displayFlashMessage(message, 'danger');
                            }
                            return null;
                        }
                        removeScopeCard(scopeId);
                        if (typeof displayFlashMessage === 'function') {
                            displayFlashMessage(data.message || 'Scope removed.', 'success');
                        }
                        return null;
                    });
            })
            .catch((error) => {
                console.error('Unable to leave scope.', error);
                if (typeof displayFlashMessage === 'function') {
                    displayFlashMessage('Unable to leave this scope. Please try again.', 'danger');
                }
            })
            .finally(() => {
                button.disabled = false;
            });
    }

    function renderShareModal(scope, shares) {
        const name = scope && scope.name ? scope.name : 'scope';
        const title = state.modalEl.querySelector('#scope-share-modal-title');
        if (title) {
            title.textContent = `Manage sharing for ${name}`;
        }
        updateScopeShareUI(scope || {});
        renderShareList(shares || []);
    }

    function renderShareList(shares) {
        if (!state.shareList) {
            return;
        }
        state.shareList.innerHTML = '';
        const hasEntries = Array.isArray(shares) && shares.length > 0;
        if (!hasEntries) {
            if (state.emptyMessage) {
                state.emptyMessage.classList.remove('d-none');
            }
            return;
        }
        if (state.emptyMessage) {
            state.emptyMessage.classList.add('d-none');
        }
        shares.forEach((share) => {
            const item = document.createElement('li');
            item.className = 'list-group-item d-flex justify-content-between align-items-start gap-3';

            const details = document.createElement('div');
            details.className = 'flex-grow-1';
            const heading = document.createElement('div');
            heading.className = 'fw-semibold';
            const username = share.user && share.user.username ? share.user.username : '';
            const displayName = share.user && share.user.name ? share.user.name : username;
            heading.textContent = displayName || username || 'Collaborator';
            details.appendChild(heading);

            if (username) {
                const meta = document.createElement('div');
                meta.className = 'text-muted small';
                meta.textContent = `@${username}`;
                details.appendChild(meta);
            }
            if (share.status_label) {
                const statusLine = document.createElement('div');
                statusLine.className = 'small text-muted';
                statusLine.textContent = `Status: ${share.status_label}`;
                details.appendChild(statusLine);
            }
            item.appendChild(details);

            const actions = document.createElement('div');
            actions.className = 'd-flex align-items-center gap-2';
            if (share.status_label) {
                const statusBadge = document.createElement('span');
                statusBadge.className = `badge ${share.status_badge || 'text-bg-secondary'}`;
                statusBadge.textContent = share.status_label;
                statusBadge.setAttribute('data-share-status', share.status || '');
                actions.appendChild(statusBadge);
            }

            const roleBadge = document.createElement('span');
            roleBadge.className = 'badge text-bg-secondary text-capitalize';
            roleBadge.textContent = share.role === 'viewer' ? 'Viewer' : 'Editor';
            actions.appendChild(roleBadge);

            if (share.is_self) {
                const selfBadge = document.createElement('span');
                selfBadge.className = 'badge text-bg-info';
                selfBadge.textContent = 'You';
                actions.appendChild(selfBadge);
            }

            if (share.can_resend) {
                const resendButton = document.createElement('button');
                resendButton.type = 'button';
                resendButton.className = 'btn btn-outline-primary btn-sm';
                resendButton.setAttribute('data-share-resend', share.id);
                resendButton.setAttribute('data-scope-id', state.currentScopeId || '');
                resendButton.innerHTML = '<i class="bi bi-arrow-clockwise" aria-hidden="true"></i>';
                resendButton.setAttribute('aria-label', `Resend invitation to ${displayName || username}`);
                resendButton.title = 'Resend invitation';
                actions.appendChild(resendButton);
            }

            if (share.can_remove && !share.is_self) {
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'btn btn-outline-danger btn-sm';
                removeButton.setAttribute('data-share-remove', share.id);
                removeButton.setAttribute('data-scope-id', state.currentScopeId || '');
                removeButton.innerHTML = '<i class="bi bi-trash" aria-hidden="true"></i>';
                removeButton.setAttribute('aria-label', `Remove ${displayName || username}`);
                actions.appendChild(removeButton);
            }

            item.appendChild(actions);
            state.shareList.appendChild(item);
        });
    }

    function updateScopeShareUI(scope) {
        if (!scope || !scope.id) {
            return;
        }
        const shareState = scope.share_state || {};
        const count = Number(shareState.accepted_count || 0);
        const buttons = document.querySelectorAll(`.scope-share-btn[data-scope-id="${scope.id}"]`);
        buttons.forEach((button) => {
            button.dataset.shareCount = String(count);
            button.dataset.sharePending = shareState.pending_count && Number(shareState.pending_count) > 0 ? 'true' : 'false';
            if (count > 0) {
                button.classList.remove('btn-outline-secondary');
                button.classList.add('btn-primary');
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.remove('bi-share');
                    icon.classList.add('bi-share-fill');
                }
            } else {
                button.classList.remove('btn-primary');
                button.classList.add('btn-outline-secondary');
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.remove('bi-share-fill');
                    icon.classList.add('bi-share');
                }
            }
        });
        const indicators = document.querySelectorAll(`[data-share-indicator][data-scope-id="${scope.id}"]`);
        indicators.forEach((badge) => {
            if (count > 0) {
                badge.classList.remove('d-none');
            } else {
                badge.classList.add('d-none');
            }
        });
    }

    function clearAlerts() {
        hideAlert(state.errorAlert);
        hideAlert(state.successAlert);
        setFieldError('');
    }

    function hideAlert(element) {
        if (!element) {
            return;
        }
        element.classList.add('d-none');
        element.textContent = '';
    }

    function showError(message) {
        if (!state.errorAlert) {
            return;
        }
        state.errorAlert.textContent = message || 'An error occurred.';
        state.errorAlert.classList.remove('d-none');
    }

    function showSuccess(message) {
        if (!state.successAlert || !message) {
            return;
        }
        state.successAlert.textContent = message;
        state.successAlert.classList.remove('d-none');
    }

    function resetModal() {
        state.currentScopeId = null;
        state.currentTrigger = null;
        resetForm();
        clearAlerts();
        if (state.emptyMessage) {
            state.emptyMessage.classList.remove('d-none');
        }
        if (state.shareList) {
            state.shareList.innerHTML = '';
        }
    }

    function resetForm() {
        if (!state.form) {
            return;
        }
        state.form.reset();
        setFieldError('');
    }

    function setFieldError(message) {
        const errorField = state.modalEl.querySelector('[data-share-field-error]');
        const identifierField = state.form ? state.form.querySelector('[name="identifier"]') : null;
        if (errorField) {
            if (message) {
                errorField.textContent = message;
                errorField.style.display = 'block';
            } else {
                errorField.textContent = '';
                errorField.style.display = 'none';
            }
        }
        if (identifierField) {
            if (message) {
                identifierField.classList.add('is-invalid');
            } else {
                identifierField.classList.remove('is-invalid');
            }
        }
    }

    function disableSubmit(disabled) {
        if (state.submitButton) {
            state.submitButton.disabled = Boolean(disabled);
        }
    }

    function disableShareAction(button, disabled) {
        if (button) {
            button.disabled = Boolean(disabled);
        }
    }

    function readCsrfToken() {
        if (state.csrfField && state.csrfField.value) {
            return state.csrfField.value;
        }
        const fallback = document.querySelector('#scope-form input[name="csrf_token"]');
        return fallback ? fallback.value : '';
    }

    function updateCsrfToken(token) {
        if (state.csrfField && token) {
            state.csrfField.value = token;
        }
        const scopeFormField = document.querySelector('#scope-form input[name="csrf_token"]');
        if (scopeFormField && token) {
            scopeFormField.value = token;
        }
    }

    function removeScopeCard(scopeId) {
        const card = document.querySelector(`.col[data-scope-id="${scopeId}"]`);
        if (!card || !card.parentElement) {
            return;
        }
        card.remove();
        const scopeList = document.querySelector('[data-scope-list]');
        const emptyState = document.querySelector('[data-scope-empty]');
        if (scopeList && scopeList.children.length === 0 && emptyState) {
            emptyState.classList.remove('d-none');
            scopeList.classList.add('d-none');
        }
    }
})();
