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

        const previousSibling = header.previousElementSibling;
        const anchor =
            previousSibling && previousSibling.hasAttribute('data-sticky-anchor') ? previousSibling : null;

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
        const metrics = {
            documentTop: null,
            expandedHeight: null,
            collapsedHeight: null,
            expandBuffer: null,
        };
        const COLLAPSE_TOLERANCE = 8;
        const EXPAND_BUFFER_MIN = 140;
        const EXPAND_BUFFER_MAX = 360;

        function computeDocumentTop(element) {
            let documentTop = 0;
            let node = element;
            while (node) {
                if (typeof node.offsetTop === 'number') {
                    documentTop += node.offsetTop;
                }
                node = node.offsetParent;
            }
            if (!documentTop && typeof element.getBoundingClientRect === 'function') {
                const rect = element.getBoundingClientRect();
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
                documentTop = rect.top + scrollTop;
            }
            return documentTop;
        }

        function updateMetrics({ measureExpanded, measureCollapsed } = {}) {
            const anchorTarget = anchor || header;
            metrics.documentTop = computeDocumentTop(anchorTarget);

            const shouldMeasureExpanded = Boolean(
                measureExpanded ||
                    (state.mode === 'top' && state.panels.add.expanded && state.panels.filters.expanded)
            );
            if (shouldMeasureExpanded) {
                const measuredExpanded = header.offsetHeight;
                if (typeof measuredExpanded === 'number' && !Number.isNaN(measuredExpanded) && measuredExpanded > 0) {
                    metrics.expandedHeight = measuredExpanded;
                }
            }

            const shouldMeasureCollapsed = Boolean(measureCollapsed || state.mode === 'scrolled');
            const hasExpandedPanels = state.panels.add.expanded || state.panels.filters.expanded;
            if (shouldMeasureCollapsed && !hasExpandedPanels) {
                const measuredCollapsed = header.offsetHeight;
                if (typeof measuredCollapsed === 'number' && !Number.isNaN(measuredCollapsed) && measuredCollapsed > 0) {
                    metrics.collapsedHeight = measuredCollapsed;
                }
            }

            const resolvedCollapsed = metrics.collapsedHeight || 0;
            const resolvedExpanded = metrics.expandedHeight || 0;
            const candidateBuffer = Math.max(EXPAND_BUFFER_MIN, resolvedCollapsed, resolvedExpanded * 0.25);
            metrics.expandBuffer = Math.min(candidateBuffer, EXPAND_BUFFER_MAX);

            evaluateModeFromScroll();
        }

        function scheduleMetricsUpdate(options) {
            requestAnimationFrame(() => {
                updateMetrics(options);
            });
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

            const expandedKeys = Object.entries(state.panels)
                .filter(([, panelState]) => panelState.expanded)
                .map(([key]) => key);
            header.dataset.stickyHasExpanded = expandedKeys.length > 0 ? 'true' : 'false';
            header.dataset.stickyExpandedPanels = expandedKeys.join(',');

            Object.entries(panels).forEach(([key, panel]) => {
                if (!panel) {
                    return;
                }
                const shouldExpand = state.panels[key].expanded;
                panel.classList.toggle('is-expanded', shouldExpand);
            });

            Object.entries(pills).forEach(([key, pill]) => {
                if (!pill) {
                    return;
                }
                const isExpanded = state.panels[key].expanded;
                pill.classList.toggle('is-hidden', isExpanded);
                pill.setAttribute('aria-expanded', String(isExpanded));
            });

            collapseButtons.forEach((button) => {
                const target = button.getAttribute('data-sticky-collapse');
                const panelState = state.panels[target];
                const isExpanded = Boolean(panelState && panelState.expanded);
                button.classList.toggle('is-visible', isExpanded && state.mode !== 'top');
                button.setAttribute('aria-expanded', String(isExpanded));
            });
        }

        function expandPanel(panelKey, source = 'manual') {
            if (!panels[panelKey]) {
                return;
            }
            const wasExpanded = state.panels[panelKey].expanded;
            if (!wasExpanded) {
                state.panels[panelKey].expanded = true;
            }
            applyState();
            if (!wasExpanded) {
                dispatchPanelEvent('sticky:panel-expanded', panelKey, source);
                if (state.mode === 'top') {
                    scheduleMetricsUpdate({ measureExpanded: true });
                }
            }
        }

        function collapsePanel(panelKey, source = 'manual') {
            if (!panels[panelKey] || state.mode === 'top') {
                return;
            }
            state.panels[panelKey].expanded = false;
            applyState();
            dispatchPanelEvent('sticky:panel-collapsed', panelKey, source);
            scheduleMetricsUpdate({ measureCollapsed: true });
        }

        function setMode(desiredMode, source) {
            if (desiredMode === state.mode) {
                return;
            }
            const previousMode = state.mode;
            state.mode = desiredMode;
            const changedPanels = [];
            if (state.mode === 'top') {
                ['add', 'filters'].forEach((panelKey) => {
                    if (!state.panels[panelKey].expanded) {
                        state.panels[panelKey].expanded = true;
                        changedPanels.push({ panelKey, type: 'expanded' });
                    }
                });
            } else if (previousMode === 'top') {
                ['add', 'filters'].forEach((panelKey) => {
                    if (state.panels[panelKey].expanded) {
                        state.panels[panelKey].expanded = false;
                        changedPanels.push({ panelKey, type: 'collapsed' });
                    }
                });
            }
            applyState();
            changedPanels.forEach(({ panelKey, type }) => {
                const eventName = type === 'expanded' ? 'sticky:panel-expanded' : 'sticky:panel-collapsed';
                dispatchPanelEvent(eventName, panelKey, source || 'auto-scroll');
            });
            scheduleMetricsUpdate({
                measureExpanded: state.mode === 'top',
                measureCollapsed: state.mode === 'scrolled',
            });
        }

        function evaluateModeFromScroll() {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
            if (state.mode === 'top') {
                const rect = header.getBoundingClientRect();
                if (rect && typeof rect.bottom === 'number' && rect.bottom <= COLLAPSE_TOLERANCE) {
                    setMode('scrolled', 'auto-scroll');
                }
                return;
            }

            const baseDocumentTop = typeof metrics.documentTop === 'number' ? metrics.documentTop : 0;
            const expandBuffer = typeof metrics.expandBuffer === 'number' ? metrics.expandBuffer : EXPAND_BUFFER_MIN;
            const expandThreshold = baseDocumentTop + expandBuffer;

            if (scrollTop <= expandThreshold) {
                setMode('top', 'auto-scroll');
            }
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
                scheduleMetricsUpdate({
                    measureExpanded: state.mode === 'top',
                    measureCollapsed: state.mode === 'scrolled',
                });
            });
            resizeObserver.observe(header);
        }

        window.addEventListener(
            'scroll',
            throttle(() => {
                evaluateModeFromScroll();
            }, 75),
            { passive: true }
        );

        window.addEventListener(
            'resize',
            throttle(() => {
                scheduleMetricsUpdate({
                    measureExpanded: state.mode === 'top',
                    measureCollapsed: state.mode === 'scrolled',
                });
                evaluateModeFromScroll();
            }, 150)
        );

        applyState();
        scheduleMetricsUpdate({ measureExpanded: true });
        evaluateModeFromScroll();

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
