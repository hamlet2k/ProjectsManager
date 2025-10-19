(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) {
            return;
        }

        const tooltipElements = document.querySelectorAll('[data-navbar-tooltip]');
        tooltipElements.forEach((element) => {
            bootstrap.Tooltip.getOrCreateInstance(element, {
                trigger: 'hover focus',
                placement: element.dataset.bsPlacement || 'bottom',
            });
        });
    });
})();
