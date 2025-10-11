(function () {
    function throttle(fn, wait) {
        let timeoutId = null;
        let lastArgs = null;
        let lastContext = null;
        let lastInvokeTime = 0;
        const interval = typeof wait === 'number' && wait >= 0 ? wait : 100;
        return function throttled(...args) {
            const now = Date.now();
            const remaining = interval - (now - lastInvokeTime);
            lastArgs = args;
            lastContext = this;
            if (remaining <= 0) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
                lastInvokeTime = now;
                fn.apply(lastContext, lastArgs);
                lastArgs = null;
                lastContext = null;
                return;
            }
            if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    lastInvokeTime = Date.now();
                    timeoutId = null;
                    if (lastArgs) {
                        fn.apply(lastContext, lastArgs);
                        lastArgs = null;
                        lastContext = null;
                    }
                }, remaining);
            }
        };
    }

    function getFocusableElement(panel) {
        if (!panel) {
            return null;
        }
        return panel.querySelector(
            'input:not([type="hidden"]), textarea, select, button:not([data-sticky-collapse]), [tabindex]:not([tabindex="-1"])'
        );
    }

    document.addEventListener('DOMContentLoaded', () => {
        const header = document.querySelector('[data-sticky-header]');
        if (!header) {
            return;
        }

        const panels = {
            add: header.querySelector('[data-sticky-panel="add"]'),
            filters: header.querySelector('[data-sticky-panel="filters"]'),
        };
        const pills = {
            add: header.querySelector('[data-sticky-pill="add"]'),
            filters: header.querySelector('[data-sticky-pill="filters"]'),
        };
        const collapseButtons = Array.from(header.querySelectorAll('[data-sticky-collapse]'));
        const state = {
            mode: 'top',
            panels: {
                add: { expanded: true },
                filters: { expanded: true },
            },
        };

        function dispatchPanelEvent(type, panelKey, source) {
            header.dispatchEvent(
                new CustomEvent(type, {
                    bubbles: true,
                    detail: {
                        panel: panelKey,
                        mode: state.mode,
                        source,
                    },
                })
            );
        }

        function applyState() {
            header.dataset.stickyReady = 'true';
            header.dataset.stickyMode = state.mode;

            const expandedKeys = state.mode === 'top'
                ? Object.keys(panels)
                : Object.entries(state.panels)
                      .filter(([, panelState]) => panelState.expanded)
                      .map(([key]) => key);
            header.dataset.stickyHasExpanded = expandedKeys.length > 0 ? 'true' : 'false';
            header.dataset.stickyExpandedPanels = expandedKeys.join(',');

            Object.entries(panels).forEach(([key, panel]) => {
                if (!panel) {
                    return;
                }
                const shouldExpand = state.mode === 'top' ? true : state.panels[key].expanded;
                panel.classList.toggle('is-expanded', shouldExpand);
            });

            Object.entries(pills).forEach(([key, pill]) => {
                if (!pill) {
                    return;
                }
                const isExpanded = state.mode === 'top' ? true : state.panels[key].expanded;
                pill.classList.toggle('is-hidden', isExpanded);
                pill.setAttribute('aria-expanded', String(isExpanded));
            });

            collapseButtons.forEach((button) => {
                const target = button.getAttribute('data-sticky-collapse');
                const panelState = state.panels[target];
                const isExpanded = state.mode === 'top' ? true : Boolean(panelState && panelState.expanded);
                button.classList.toggle('is-visible', isExpanded && state.mode !== 'top');
                button.setAttribute('aria-expanded', String(isExpanded));
            });
        }

        function expandPanel(panelKey, source = 'manual') {
            if (!panels[panelKey]) {
                return;
            }
            if (state.mode !== 'top') {
                state.panels[panelKey].expanded = true;
            }
            applyState();
            dispatchPanelEvent('sticky:panel-expanded', panelKey, source);
        }

        function collapsePanel(panelKey, source = 'manual') {
            if (!panels[panelKey] || state.mode === 'top') {
                return;
            }
            state.panels[panelKey].expanded = false;
            applyState();
            dispatchPanelEvent('sticky:panel-collapsed', panelKey, source);
        }

        function evaluateMode(force) {
            const threshold = 48;
            const shouldBeTop = window.scrollY <= threshold;
            const desiredMode = shouldBeTop ? 'top' : 'scrolled';
            if (!force && desiredMode === state.mode) {
                return;
            }
            const previousMode = state.mode;
            state.mode = desiredMode;
            if (state.mode === 'top') {
                if (!state.panels.add.expanded) {
                    state.panels.add.expanded = true;
                    dispatchPanelEvent('sticky:panel-expanded', 'add', 'auto-scroll');
                }
                if (!state.panels.filters.expanded) {
                    state.panels.filters.expanded = true;
                    dispatchPanelEvent('sticky:panel-expanded', 'filters', 'auto-scroll');
                }
            } else if (previousMode === 'top') {
                if (state.panels.add.expanded) {
                    state.panels.add.expanded = false;
                    dispatchPanelEvent('sticky:panel-collapsed', 'add', 'auto-scroll');
                }
                if (state.panels.filters.expanded) {
                    state.panels.filters.expanded = false;
                    dispatchPanelEvent('sticky:panel-collapsed', 'filters', 'auto-scroll');
                }
            }
            applyState();
        }

        Object.entries(pills).forEach(([panelKey, pill]) => {
            if (!pill) {
                return;
            }
            pill.addEventListener('click', () => {
                expandPanel(panelKey, 'pill');
                const targetElement = getFocusableElement(panels[panelKey]);
                if (targetElement) {
                    requestAnimationFrame(() => {
                        try {
                            targetElement.focus({ preventScroll: false });
                        } catch (error) {
                            targetElement.focus();
                        }
                    });
                }
            });
        });

        collapseButtons.forEach((button) => {
            const panelKey = button.getAttribute('data-sticky-collapse');
            if (!panelKey) {
                return;
            }
            button.addEventListener('click', () => {
                collapsePanel(panelKey, 'collapse-button');
            });
        });

        Object.entries(panels).forEach(([panelKey, panel]) => {
            if (!panel) {
                return;
            }
            panel.addEventListener('focusin', () => {
                expandPanel(panelKey, 'focus');
            });
        });

        window.addEventListener(
            'scroll',
            throttle(() => evaluateMode(false), 75),
            { passive: true }
        );
        window.addEventListener('resize', throttle(() => applyState(), 150));

        evaluateMode(true);
        applyState();

        window.ProjectsStickyHeader = {
            expandPanel,
            collapsePanel,
            getState() {
                return {
                    mode: state.mode,
                    panels: {
                        add: { ...state.panels.add },
                        filters: { ...state.panels.filters },
                    },
                };
            },
        };
    });
})();
