(function () {
    'use strict';

    const state = {
        root: null,
        dropdownMenu: null,
        dropdownList: null,
        dropdownToggle: null,
        countBadge: null,
        pagePending: null,
        pageHistory: null,
        csrfInputs: [],
        dropdownOpen: false,
        markingRead: false,
    };

    document.addEventListener('DOMContentLoaded', initializeNotifications);

    function initializeNotifications() {
        state.root = document.querySelector('[data-notifications-root]');
        state.dropdownList = document.querySelector('[data-notification-list]');
        state.countBadge = document.querySelector('[data-notification-count]');
        state.pagePending = document.querySelector('[data-notifications-page-pending]');
        state.pageHistory = document.querySelector('[data-notifications-page-history]');
        state.csrfInputs = Array.from(
            document.querySelectorAll('[data-notification-csrf], [data-notification-page-csrf]')
        );

        if (!state.root && !state.dropdownList && !state.pagePending) {
            return;
        }

        document.addEventListener('click', handleNotificationClick, true);
        if (state.root) {
            state.dropdownMenu = state.root.querySelector('.notification-dropdown-menu');
            state.dropdownToggle = state.root.querySelector('[data-notification-toggle]');
            if (state.dropdownToggle) {
                state.dropdownToggle.addEventListener('shown.bs.dropdown', handleDropdownShown);
                state.dropdownToggle.addEventListener('hidden.bs.dropdown', handleDropdownHidden);
            }
        }
        configureDropdownWidth();
        window.addEventListener('resize', configureDropdownWidth);
        if (state.pagePending || state.pageHistory) {
            const ids = collectNotificationIds(state.pagePending, state.pageHistory);
            if (ids.length) {
                markNotificationsAsRead(ids);
            }
        }
    }

    function handleNotificationClick(event) {
        const acceptButton = event.target.closest('[data-notification-accept]');
        if (acceptButton) {
            event.preventDefault();
            handleNotificationAction(acceptButton, 'accept');
            return;
        }
        const rejectButton = event.target.closest('[data-notification-reject]');
        if (rejectButton) {
            event.preventDefault();
            handleNotificationAction(rejectButton, 'reject');
        }
    }

    function handleDropdownShown() {
        state.dropdownOpen = true;
        requestAnimationFrame(() => {
            configureDropdownWidth();
            const ids = collectNotificationIds(state.dropdownList);
            if (ids.length) {
                markNotificationsAsRead(ids);
            }
        });
    }

    function handleDropdownHidden() {
        state.dropdownOpen = false;
        if (state.dropdownMenu) {
            state.dropdownMenu.style.width = '';
        }
    }

    function handleNotificationAction(button, action) {
        const notificationId = button.dataset.notificationAccept || button.dataset.notificationReject;
        if (!notificationId) {
            return;
        }
        button.disabled = true;
        fetch(`/notifications/${notificationId}/${action}`, {
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
                if (!data) {
                    throw new Error('Invalid response payload.');
                }
                if (data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (!ok || data.success !== true) {
                    notifyFailure(data.message || 'Unable to update the notification.');
                    return;
                }
                applyNotificationUpdate(data);
                notifySuccess(data.message || 'Notification updated.');
            })
            .catch((error) => {
                console.error('Notification action failed.', error);
                notifyFailure('Unable to update the notification. Please try again.');
            })
            .finally(() => {
                button.disabled = false;
            });
    }

    function applyNotificationUpdate(data) {
        renderDropdown(data.pending || [], data.recent || []);
        renderPageLists(data.pending || [], data.recent || []);
        const badgeCount =
            typeof data.badge_count === 'number'
                ? data.badge_count
                : typeof data.new_count === 'number'
                ? data.new_count
                : typeof data.pending_count === 'number'
                ? data.pending_count
                : 0;
        updateCountBadges(badgeCount);
        if (data.scope) {
            document.dispatchEvent(
                new CustomEvent('scope:updated', {
                    detail: { scope: data.scope },
                })
            );
        }
    }

    function renderDropdown(pending, recent) {
        if (!state.dropdownList) {
            return;
        }
        state.dropdownList.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const seen = new Set();
        let added = false;
        pending.forEach((item) => {
            seen.add(item.id);
            fragment.appendChild(buildNotificationElement(item, { compact: true }));
            added = true;
        });
        recent.forEach((item) => {
            if (seen.has(item.id)) {
                return;
            }
            fragment.appendChild(buildNotificationElement(item, { compact: true }));
            added = true;
        });
        if (!added) {
            const empty = document.createElement('div');
            empty.className = 'notification-empty text-muted small';
            empty.textContent = 'No notifications yet.';
            empty.setAttribute('data-notification-empty', '');
            fragment.appendChild(empty);
        }
        state.dropdownList.appendChild(fragment);
        configureDropdownWidth();
    }

    function renderPageLists(pending, recent) {
        if (!state.pagePending && !state.pageHistory) {
            return;
        }
        if (state.pagePending) {
            renderList(state.pagePending, pending, {
                emptyClass: 'notification-empty text-muted text-center',
                emptyText: 'No pending notifications.',
                compact: false,
                showActions: true,
            });
        }
        if (state.pageHistory) {
            renderList(state.pageHistory, recent, {
                emptyClass: 'notification-empty text-muted text-center',
                emptyText: 'No notifications yet.',
                compact: false,
                showActions: false,
            });
        }
        const pagePendingBadge = document.querySelector('[data-notification-page-pending-count]');
        if (pagePendingBadge) {
            pagePendingBadge.textContent = pending.length;
        }
        const overallBadge = document.querySelector('[data-notification-page-count]');
        if (overallBadge) {
            const pendingLabel = pending.length === 1 ? 'pending notification' : 'pending notifications';
            overallBadge.textContent = `${pending.length} ${pendingLabel}`;
        }
    }

    function renderList(container, items, options) {
        container.innerHTML = '';
        if (!items || items.length === 0) {
            const empty = document.createElement('div');
            empty.className = options.emptyClass || 'p-3 text-muted text-center';
            empty.textContent = options.emptyText || 'No notifications.';
            container.appendChild(empty);
            return;
        }
        const fragment = document.createDocumentFragment();
        const showActions = options.showActions !== undefined ? Boolean(options.showActions) : true;
        items.forEach((item) => {
            fragment.appendChild(buildNotificationElement(item, { compact: options.compact, showActions }));
        });
        container.appendChild(fragment);
    }

    function buildNotificationElement(notification, options) {
        const compact = Boolean(options && options.compact);
        const showActions = options && options.showActions !== undefined ? Boolean(options.showActions) : true;
        const item = document.createElement('div');
        item.className = 'notification-item';
        if (compact) {
            item.classList.add('notification-item--compact');
        }
        item.dataset.notificationItem = String(notification.id);
        item.dataset.notificationStatus = notification.status || '';
        item.dataset.notificationRead = notification.is_read ? 'true' : 'false';

        const row = document.createElement('div');
        row.className = 'notification-item__header d-flex justify-content-between align-items-start gap-3';

        const details = document.createElement('div');
        details.className = 'notification-item__details flex-grow-1';
        const title = document.createElement('div');
        title.className = 'notification-item__title fw-semibold';
        title.textContent = notification.title || 'Notification';
        details.appendChild(title);

        if (notification.message) {
            const message = document.createElement('div');
            message.className = 'notification-item__message small text-muted';
            message.textContent = notification.message;
            details.appendChild(message);
        }

        if (!compact && notification.created_display) {
            const timestamp = document.createElement('div');
            timestamp.className = 'notification-item__timestamp small text-muted';
            timestamp.textContent = formatTimestamp(notification.created_display);
            details.appendChild(timestamp);
        }

        const badge = document.createElement('span');
        badge.className = `notification-item__status badge ${notification.status_badge || 'text-bg-secondary'}`;
        badge.textContent = notification.status_label || 'Pending';

        row.appendChild(details);
        row.appendChild(badge);
        item.appendChild(row);

        if (showActions && notification.action_required) {
            const actions = document.createElement('div');
            actions.className = 'notification-item__actions mt-2 d-flex flex-wrap gap-2';

            const acceptButton = document.createElement('button');
            acceptButton.type = 'button';
            acceptButton.className = 'btn btn-sm btn-primary';
            acceptButton.dataset.notificationAccept = String(notification.id);
            acceptButton.textContent = 'Accept';
            actions.appendChild(acceptButton);

            const rejectButton = document.createElement('button');
            rejectButton.type = 'button';
            rejectButton.className = 'btn btn-sm btn-outline-secondary';
            rejectButton.dataset.notificationReject = String(notification.id);
            rejectButton.textContent = 'Reject';
            actions.appendChild(rejectButton);

            item.appendChild(actions);
        }

        return item;
    }

    function updateCountBadges(count) {
        if (!state.root) {
            return;
        }
        let badge = state.root.querySelector('[data-notification-count]');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'position-absolute top-0 start-100 badge rounded-pill text-bg-danger notification-count-badge';
                badge.setAttribute('data-notification-count', '');
                state.root.querySelector('[data-notification-toggle]')?.appendChild(badge);
            }
            badge.textContent = String(count);
            state.countBadge = badge;
        } else {
            state.countBadge = badge || state.countBadge;
            if (state.countBadge && state.countBadge.parentElement) {
                state.countBadge.parentElement.removeChild(state.countBadge);
            }
            state.countBadge = null;
        }
    }

    function readCsrfToken() {
        for (const input of state.csrfInputs) {
            if (input && input.value) {
                return input.value;
            }
        }
        return '';
    }

    function updateCsrfToken(token) {
        if (!token) {
            return;
        }
        state.csrfInputs.forEach((input) => {
            if (input) {
                input.value = token;
            }
        });
    }

    function formatTimestamp(value) {
        if (!value) {
            return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleString();
    }

    function configureDropdownWidth() {
        if (!state.root) {
            return;
        }
        if (!state.dropdownMenu) {
            state.dropdownMenu = state.root.querySelector('.notification-dropdown-menu');
        }
        const dropdownMenu = state.dropdownMenu;
        if (!dropdownMenu) {
            return;
        }
        const taskContainer =
            document.querySelector('[data-task-list]') ||
            document.querySelector('[data-task-board]') ||
            document.querySelector('[data-task-groups]') ||
            document.querySelector('#task-columns') ||
            document.querySelector('#task-list') ||
            null;
        const mainContainer = document.querySelector('main.container');
        const referenceWidth = taskContainer?.clientWidth || mainContainer?.clientWidth || window.innerWidth;
        const minWidth = 260;
        const maxWidth = Math.max(minWidth, Math.floor(referenceWidth * 0.8));
        const effectiveMinWidth = Math.min(maxWidth, Math.max(minWidth, 320));
        dropdownMenu.style.setProperty('--notifications-overlay-max-width', `${maxWidth}px`);
        dropdownMenu.style.maxWidth = `${maxWidth}px`;
        dropdownMenu.style.minWidth = `${effectiveMinWidth}px`;
        if (state.dropdownOpen) {
            const contentWidth = Math.ceil(dropdownMenu.scrollWidth || 0);
            const targetWidth = Math.min(maxWidth, Math.max(effectiveMinWidth, contentWidth));
            dropdownMenu.style.width = `${targetWidth}px`;
        } else {
            dropdownMenu.style.width = '';
        }
    }

    function notifySuccess(message) {
        if (typeof displayFlashMessage === 'function') {
            displayFlashMessage(message, 'success');
        }
    }

    function notifyFailure(message) {
        if (typeof displayFlashMessage === 'function') {
            displayFlashMessage(message, 'danger');
        }
    }

    function collectNotificationIds(...containers) {
        const ids = new Set();
        containers.forEach((container) => {
            if (!container) {
                return;
            }
            container.querySelectorAll('[data-notification-item]').forEach((element) => {
                if (element.dataset.notificationRead === 'true') {
                    return;
                }
                const identifier = element.dataset.notificationItem;
                if (identifier) {
                    const parsed = parseInt(identifier, 10);
                    if (!Number.isNaN(parsed)) {
                        ids.add(parsed);
                    }
                }
            });
        });
        return Array.from(ids.values());
    }

    function markNotificationsAsRead(notificationIds) {
        if (!notificationIds || notificationIds.length === 0) {
            return;
        }
        if (state.markingRead) {
            return;
        }
        const csrfToken = readCsrfToken();
        if (!csrfToken) {
            return;
        }
        state.markingRead = true;
        fetch('/notifications/mark-read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                csrf_token: csrfToken,
                notification_ids: notificationIds,
            }),
        })
            .then((response) =>
                response
                    .json()
                    .catch(() => ({}))
                    .then((data) => ({ ok: response.ok, data }))
            )
            .then(({ ok, data }) => {
                if (!ok || !data) {
                    throw new Error('Unable to mark notifications.');
                }
                if (data.csrf_token) {
                    updateCsrfToken(data.csrf_token);
                }
                if (data.success) {
                    applyNotificationUpdate(data);
                }
            })
            .catch((error) => {
                console.error('Failed to mark notifications as read.', error);
            })
            .finally(() => {
                state.markingRead = false;
            });
    }
})();
