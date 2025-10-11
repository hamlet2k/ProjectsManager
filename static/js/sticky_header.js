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
        let headerDocumentTop = null;
        const EXPAND_TOLERANCE = 48;
        const COLLAPSE_VISIBILITY_BUFFER = 8;

        function computeHeaderDocumentTop() {
            let documentTop = 0;
            let node = header;
            while (node) {
                if (typeof node.offsetTop === 'number') {
                    documentTop += node.offsetTop;
                }
                node = node.offsetParent;
            }
            if (!documentTop && typeof header.getBoundingClientRect === 'function') {
                const rect = header.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
                documentTop = rect.top + scrollTop;
            }
            headerDocumentTop = documentTop;
        }

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

        function setMode(desiredMode, source) {
            if (desiredMode === state.mode) {
                return;
            }
            const previousMode = state.mode;
            state.mode = desiredMode;
            if (state.mode === 'top') {
                if (!state.panels.add.expanded) {
                    state.panels.add.expanded = true;
                    dispatchPanelEvent('sticky:panel-expanded', 'add', source || 'auto-scroll');
                }
                if (!state.panels.filters.expanded) {
                    state.panels.filters.expanded = true;
                    dispatchPanelEvent('sticky:panel-expanded', 'filters', source || 'auto-scroll');
                }
            } else if (previousMode === 'top') {
                if (state.panels.add.expanded) {
                    state.panels.add.expanded = false;
                    dispatchPanelEvent('sticky:panel-collapsed', 'add', source || 'auto-scroll');
                }
                if (state.panels.filters.expanded) {
                    state.panels.filters.expanded = false;
                    dispatchPanelEvent('sticky:panel-collapsed', 'filters', source || 'auto-scroll');
                }
            }
            applyState();
            if (state.mode === 'top') {
                requestAnimationFrame(() => {
                    computeHeaderDocumentTop();
                });
            }
        }

        function evaluateModeFromScroll(force) {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
            let desiredMode = state.mode;

            if (state.mode === 'top') {
                const rect = header.getBoundingClientRect();
                if (rect && typeof rect.bottom === 'number' && rect.bottom <= -COLLAPSE_VISIBILITY_BUFFER) {
                    desiredMode = 'scrolled';
                }
            } else if (headerDocumentTop !== null) {
                if (scrollTop <= headerDocumentTop + EXPAND_TOLERANCE) {
                    desiredMode = 'top';
                }
            }
            if (!force && desiredMode === state.mode) {
                return;
            }
            setMode(desiredMode, 'auto-scroll');
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

        const supportsResizeObserver = 'ResizeObserver' in window;
        if (supportsResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                if (state.mode === 'top') {
                    computeHeaderDocumentTop();
                }
            });
            resizeObserver.observe(header);
        }

        window.addEventListener(
            'scroll',
            throttle(() => evaluateModeFromScroll(false), 75),
            { passive: true }
        );

        window.addEventListener('resize', throttle(() => {
            if (state.mode === 'top') {
                computeHeaderDocumentTop();
            }
            evaluateModeFromScroll(false);
        }, 150));

        applyState();
        computeHeaderDocumentTop();
        evaluateModeFromScroll(true);

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
