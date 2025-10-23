# Frontend & Template Rules

- Use **HTMX fragments** under `/templates/components` for reusable pieces (modals, filters, task groups).
- Inline JavaScript inside templates (e.g., `task.html`) must be progressively extracted into `/static/js/` modules.
- When adding keyboard shortcuts:
  - Update `Settings → Keyboard Shortcuts` section.
  - Ensure parity for both `Ctrl` (Windows/Linux) and `Cmd` (macOS).
- For sticky header and responsive UI:
  - Follow the architecture in `docs/features/sticky-headers/`.
  - Maintain the separation between “Floating Pills” and “Sticky Panels.”
  - Preserve GitHub interaction behavior when filters or task panels expand.
