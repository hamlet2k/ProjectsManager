# Sticky Header Architecture & Implementation Plan

## 1. Architecture Overview

### 1.1 Current Layout Baseline
- The tasks page currently renders the filters inside a Bootstrap collapse that is always expanded on large screens and toggleable on mobile; this form includes search, sort, completion toggles, and tag chips rendered inside the main content flow, consuming vertical space above the task list.
- The add-task experience is provided by a POST form (`#task-form`) with a quick-add input and an expandable detailed panel for description, due date, GitHub milestone selection, and inline tag creation; it sits directly below the filters and pushes the task list further down the page.
- Task groups are rendered beneath these sections; the container exposes scope metadata (IDs, GitHub repo context) via `data-*` attributes that downstream scripts use for filtering, GitHub integration, and preference persistence.
- Inline JavaScript captures references to the filter form, collapse state, and responsive breakpoints, and it already relies on shared preference utilities (`preferences.js`) to remember filter and scope state in `localStorage`.
- Auto-tagging and filter-driven defaults are implemented in helpers such as `applyDefaultInlineTags`, which reconcile stored preferences with active filters and keep inline tag chips in sync.
- GitHub-specific controls (issue linking, milestone management) depend on dataset attributes emitted with each task item and on modal helper functions that read those attributes to orchestrate API calls and UI updates.

### 1.2 Proposed Architecture
Introduce a dedicated **`StickyHeaderContainer`** component that wraps the existing filter form and add-task form, but renders them within a fixed-position viewport overlay capable of expanding into **sticky panels** or collapsing into **floating pills**. This component will live in `templates/components/sticky_header.html` (new) and be included from `task.html` to replace the current top-of-page sections.

**Subcomponents:**
- **StickyHeaderFrame**: handles positioning, max-width alignment with the task container, and background transitions.
- **StickyPanel (Filters / Add Task)**: hosts the existing forms, exposing lifecycle callbacks (expand/collapse, focus) for external state control.
- **StickyPill triggers**: minimal pill buttons with ARIA attributes that toggle associated panels.

A JavaScript module `static/js/sticky_header.js` will orchestrate scroll listeners, focus/blur detection, and cross-panel coordination. It will expose hooks (`onFiltersExpanded`, `onAddTaskExpanded`) that reuse existing logic from the inline script (e.g., re-running `applyDefaultInlineTags`) without duplicating behavior.

### 1.3 Data & Event Flow
- **Initialization:** On DOM ready, `sticky_header.js` locates the sticky container, binds scroll observers, and hydrates initial state (expanded if at top). It pulls scope metadata from `#task-groups-container` to stay aligned with preference persistence routines already used in `task.html` (`persistTaskPreferences`).
- **Scroll-driven transitions:** `IntersectionObserver` (or throttled scroll handlers) toggles between expanded and collapsed states. When collapsing, the module keeps forms mounted to avoid losing WTForms CSRF tokens and event bindings.
- **Pill interactions:** Clicking a pill expands its panel; the module emits custom events consumed by existing inline script fragments (e.g., ensuring the filter collapse API stays in sync with `matchMedia` logic).
- **Form submissions & updates:** Existing fetch/submit flows remain untouched—`task_form` still posts to `add_task`, and filter submissions continue to task routes. The sticky header only manages visibility and layout.
- **Preference & tag propagation:** When filters expand, the module triggers the current `handleActiveFilterChange` pipeline to persist selections and auto-apply tags, preserving the `localStorage`-backed behavior defined in `preferences.js` and the inline helpers.
- **GitHub integrations:** Because the sticky header does not alter the markup or data attributes rendered within `task_groups.html`, existing milestone modals and GitHub buttons continue to function. Any focus-triggered expansion (e.g., opening the add-task panel when editing a GitHub-linked task) will rely on the module invoking the sticky header API before the existing GitHub routines run.

## 2. Component Hierarchy Diagram (ASCII)
```
app.html layout
└── task.html
    ├── Navbar / breadcrumbs (existing components)
    ├── StickyHeaderContainer (new include)
    │   ├── StickyPillGroup
    │   │   ├── AddTaskPill
    │   │   └── FiltersPill
    │   ├── StickyPanel:AddTask (wraps existing #task-form)
    │   │   └── WTForms fields, GitHub milestone controls
    │   └── StickyPanel:Filters (wraps existing filter form + tag chips)
    └── TaskListContainer
        └── task_groups.html (existing task groups, modals)
```

## 3. State Machine Definition

**States**
- **TopExpanded**
  - Entry: load at top / scroll to top boundary
  - Exit on: scroll down > threshold

- **Collapsed**
  - Entry: scroll down past header threshold
  - Exit on: scroll to top → TopExpanded
  - Exit on: pill click/focus → respective Expanded

- **FiltersExpanded**
  - Entry: Filters pill click, filter input focus, API-driven expansion
  - Exit: collapse action, blur w/out focus retention, scroll to top (→ TopExpanded)

- **AddTaskExpanded**
  - Entry: Add Task pill click, input focus, programmatic expansion (e.g., edit)
  - Exit: collapse action, form submit/reset leading to collapsed, scroll to top (→ TopExpanded)

- **BothExpanded**
  - Entry: manual expansion of second panel while one is already expanded
  - Exit: individual collapse transitions or scroll to top → TopExpanded

**Transitions**
- Scroll-down threshold: `TopExpanded → Collapsed`
- Scroll-to-top detection: `Collapsed | FiltersExpanded | AddTaskExpanded | BothExpanded → TopExpanded`
- Pill click: `Collapsed → (FiltersExpanded | AddTaskExpanded)`
- Focus-in (e.g., form field): `Collapsed → respective expanded state`
- Collapse control: `(FiltersExpanded | AddTaskExpanded | BothExpanded) → Collapsed`
- Second pill click while first expanded: `(FiltersExpanded <-> BothExpanded)`

**Mobile variants** share states but adjust layout (stacked pills/panels) triggered by viewport breakpoint observers.

## 4. Phase-based Implementation Roadmap

### Stage 1 – Component Extraction & Visual Shell
- **Markup refactor:** Extract current filter and add-task blocks into `components/sticky_header.html`, wrap them in the sticky container scaffolding while preserving current Bootstrap classes and server-rendered WTForms elements.
- **Baseline pills:** Introduce pill buttons that toggle CSS classes locally; reuse existing collapse targets to ensure functionality parity while still in-flow.
- **Acceptance criteria:**
  - Filters and add-task forms render via the new component without layout regressions.
  - Existing scripts still operate (filter toggles, validations, submissions).

### Stage 2 – Sticky Behavior & Collapsed Mode
- **Positioning:** Apply fixed positioning and max-width alignment so the sticky container overlays the task list while respecting the same width as `task-groups-container`. Ensure tasks scroll beneath the transparent header.
- **State controller:** Implement `sticky_header.js` to manage scroll threshold detection, update ARIA states, and coordinate with `bootstrap.Collapse` for the filter form on small screens.
- **Acceptance criteria:**
  - Smooth transition between expanded top-of-page state and collapsed pills while scrolling.
  - Pills remain clickable and do not obstruct task interactions.

### Stage 3 – Interactive Sync & Auto-expansion
- **Focus hooks:** Expand panels on focus events (inputs, filter controls) while coordinating with `applyDefaultInlineTags` so tag defaults refresh exactly as before.
- **Preference continuity:** Ensure `persistTaskPreferences` still fires on filter changes and that stored tags propagate when panels auto-open, leveraging existing `preferences.js` helpers.
- **Acceptance criteria:**
  - Expanding/collapsing does not break saved filters, auto-tagging, or GitHub defaults.
  - State matches legacy behavior when returning to page.

### Stage 4 – GitHub & Advanced Interaction Parity
- **Integration tests:** Validate GitHub modals, milestone pickers, and issue link buttons from collapsed states; ensure the sticky header exposes APIs for GitHub workflows that programmatically open the add-task form when necessary.
- **Cross-script cleanup:** Remove redundant inline logic replaced by the sticky header module and document the new APIs.
- **Acceptance criteria:**
  - GitHub milestone management, auto-tag restrictions, and flash messaging continue to work irrespective of header state.

### Stage 5 – Polish & Progressive Enhancements
- **Animation refinement:** Introduce GPU-friendly transforms for pill-panel morphing; align with accessibility guidelines (`prefers-reduced-motion`).
- **Mobile parity:** Adjust layout so pills stack vertically on narrow viewports while preserving touch targets.
- **Acceptance criteria:**
  - Final UX matches specification, with no regressions in keyboard navigation or screen reader labeling.

## 5. Integration Safeguards
- **Filter persistence:** Reuse existing event hooks that call `updatePreferenceData` and `handleActiveFilterChange` so that sticky transitions never bypass `localStorage` updates.
- **Auto-tag defaults:** Ensure panel expansion still triggers `applyDefaultInlineTags`, maintaining behavior where stored or active filter tags pre-populate the add-task form.
- **GitHub workflows:** Preserve the dataset attributes emitted in `task_groups.html` and ensure sticky header focus automation does not interfere with milestone modal logic or GitHub sync endpoints.
- **Bootstrap collapse interop:** When panels expand programmatically, update `aria-expanded` on the existing toggle buttons to keep Bootstrap’s collapse plugin state consistent.

## 6. Performance & UX Considerations
- **Scroll handling:** Use passive listeners or `IntersectionObserver` to avoid jank from frequent DOM reads; throttle updates to the sticky state for smoother animation.
- **Layout stability:** Keep panels mounted in the DOM to prevent reflow-heavy detach/attach cycles; only toggle CSS classes for visibility to preserve existing event listeners and CSRF tokens.
- **Preference lookups:** Continue leveraging the centralized `preferences.js` helpers to avoid duplicate `localStorage` access logic and to ensure reads/writes stay normalized.
- **Accessibility:** Maintain keyboard focus traps within expanded panels, provide descriptive `aria-label`s on pills, and respect reduced-motion settings by disabling heavy transitions when `prefers-reduced-motion` is true.
- **Z-index & stacking:** Coordinate z-index with the navbar and modals so that sticky panels don’t overlap dialogs or flash messages emitted from `app.html`.

## 7. Testing & QA Plan
**Functional states**
- Verify automatic expansion at page load/top and collapse after scrolling down.
- Confirm manual expansion/collapse via pills, focus events, and keyboard shortcuts.

**Filter persistence**
- Apply combinations of search, sort, completed toggle, and tag selections; reload the page to confirm preferences persist through `localStorage` routines.

**Auto-tag flows**
- Activate filters, create tasks, and ensure inline tags are auto-applied and cleared appropriately when panels open/close.

**GitHub integration**
- Link/unlink issues, adjust milestones, and observe that sticky transitions do not interrupt modals or fetch operations.

**Responsive behavior**
- Test across breakpoints: ensure pills reposition correctly on mobile, panels respect max-width on desktop, and `matchMedia` listeners still display the filter panel on large screens.

**Accessibility**
- Confirm focus order, ARIA attributes, and keyboard navigation work in all states; run screen reader smoke tests.

**Performance regression**
- Profile scroll performance and ensure sticky header updates remain under 16 ms budget on mid-tier hardware.

---

**Testing**: ⚠️ Tests not run (documentation-only planning task).
