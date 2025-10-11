# 🧭 Dynamic Sticky Header, Floating Actions & Scroll Navigation
## Consolidated Functional & Behavioral Specification

This document merges and refines all prior deliverables for the Sticky Header feature in **ProjectsManager**, including:
- Initial Requirements
- Refined Requirements
- Behavioral Diagrams
- Clarification and Incremental Implementation Plan

---

## 1️⃣ Overview
The **Dynamic Sticky Header System** refactors the task list layout to introduce a smart overlay for the **Add Task** and **Filters** panels.  
It ensures that these actions remain accessible without cluttering the interface or breaking the scroll flow.

---

## 2️⃣ Goals
- Keep filters and task creation tools visible and accessible at all times.
- Maintain a clean, minimal interface while scrolling through long task lists.
- Deliver smooth animations and transitions without layout jumps.
- Consolidate static layout elements (Filters, Add Task) into a single **sticky header system**.

---

## 3️⃣ Core Components
| Component | Description |
|------------|-------------|
| **Nav-Bar** | Main site header, scrolls away normally. |
| **Sticky Header Container** | Persistent container fixed at top of the viewport; transparent by default, grows when panels expand. |
| **Floating Pills** | Compact icons (+ for Add Task, # for Filters). Non-intrusive overlay buttons for panel expansion. |
| **Sticky Panels** | Expanded forms for Add Task / Filters rendered inside the sticky container. |
| **Task List** | Scrollable main content below the sticky container. |

---

## 4️⃣ Correct Terminology
| Term | Definition |
|------|-------------|
| **Floating Pills** | Small overlay icons that sit above content, trigger panel expansion, and do not affect layout. |
| **Sticky Panels** | The expanded forms rendered *inside* the sticky header; not floating, but sticky. |
| **Sticky Header Container** | The persistent overlay container that hosts both pills and panels. Transparent by default. |
| **Max Width** | All widths constrained by the same max-width as the task list container. |

---

## 5️⃣ Expected Functionality

### Floating Pills & Sticky Container
- Pills (+ and #) do not displace content.
- Sticky container is transparent by default, gains solid background when a panel expands.
- Pills positioned symmetrically (left = Add Task, right = Filters).

### Sticky Panels
- Expanding a panel makes it full width (within the task list container max-width).
- Sticky container background turns solid.
- Collapsing a panel reverses the animation, returning to transparent state.

---

## 6️⃣ Behavioral Logic

### **Top of Page**
- Nav-Bar visible.
- Filter and Add Task panels auto-expanded.
- No manual collapse allowed.
- Solid background (merged panels + container).

### **Scroll Down**
- Nav-Bar scrolls away.
- Both panels collapse into pills.
- Sticky container background transparent.
- Tasks scroll behind the header.

### **Scroll Up**
- Panels remain collapsed until the top is reached.
- Upon reaching top → both panels auto-expand.
- Pills fade out when expanded.

### **Focus Events**
- Focusing any input in either section expands the corresponding panel.
- Applies to both clicks and programmatic focus events.

---

## 7️⃣ User Interaction Triggers
| Trigger | Action |
|----------|---------|
| Scroll Down | Collapse both panels into pills. |
| Scroll Up (to top) | Auto-expand both panels. |
| Click (+) | Expand Add Task panel. |
| Click (#) | Expand Filters panel. |
| Click (–) | Collapse the respective panel. |
| Focus on Field | Auto-expand the related panel. |

---

## 8️⃣ Animation & Morph Behavior
- Pills morph into panels with smooth fade/translate animations.
- Reverse animation when collapsing.
- Transitions should preserve scroll offset and avoid layout jumps.
- Use GPU-friendly CSS transforms for performance.

---

## 9️⃣ Visual & UX Guidelines
| State | Behavior |
|--------|-----------|
| Default (Collapsed) | Pills visible, fixed to top corners, transparent background. |
| Expanded | Panels occupy full width, sticky header solid, smooth expansion animation. |
| Mobile | Pills stack vertically (Add Task above Filters); panels remain full-width inside container. |

---

## 🔄 State Model Summary
| State | Navbar | Filter | Add Task | Pills | Sticky BG | Panels BG |
|--------|---------|----------|-------------|---------|-------------|-------------|
| Top-expanded | Visible | Expanded | Expanded | Hidden | Solid | Solid |
| Collapsed (scroll) | Hidden | Collapsed | Collapsed | Visible | Transparent | – |
| Add Task Expanded | Hidden | Collapsed | Expanded | Mixed | Solid | Solid |
| Filter Expanded | Hidden | Expanded | Collapsed | Mixed | Solid | Solid |
| Both Expanded | Hidden | Expanded | Expanded | Hidden | Solid | Solid |

---

## 🔁 Transition Summary
| From | Trigger | To | Notes |
|------|----------|----|-------|
| Top-expanded | Scroll down | Collapsed | Navbar hides |
| Collapsed | Click (+) | Add Task Expanded | Preserves scroll offset |
| Collapsed | Click (#) | Filter Expanded | Preserves scroll offset |
| Add Task Expanded | Click (–) | Collapsed | Smooth morph animation |
| Filter Expanded | Click (–) | Collapsed | Smooth morph animation |
| Collapsed | Scroll to top | Top-expanded | Both panels auto-expand |

---

## 🔧 Implementation Plan (Incremental & Safe)

### **Stage 1 — Reuse Existing Mobile Logic**
- Reuse existing filter pill behavior from mobile.
- Add new Add Task pill with same behavior.
- Ensure both expand into full-width panels (using current forms).

✅ *Outcome:* Two functional pills across desktop & mobile (no sticky container yet).

---

### **Stage 2 — Introduce Sticky Header Container**
- Create `<StickyHeaderContainer>` holding both panels.
- Add transparent sticky positioning.
- Panels expand inside; when expanded → push content below.

✅ *Outcome:* Scroll and stickiness managed by one unified container.

---

### **Stage 3 — Scroll Logic Integration**
- Collapse both panels on scroll down.
- Expand both when scrolled to top.
- Animate container height changes.

✅ *Outcome:* Smooth morphing between expanded/collapsed states.

---

### **Stage 4 — Functional Reconciliation**
- Restore ad-hoc logic from existing forms:
  - Tag auto-selection based on filters.
  - Hidden GitHub integration tags.
  - Autocomplete and default selections.
- Move logic into composable modules (`useTaskCreationBehavior`, `useFilterBehavior`).

✅ *Outcome:* Feature parity with old layout, full functional recovery.

---

### **Stage 5 — Cleanup**
- Remove old static forms.
- Validate all logic migrated to sticky header.
- Commit incrementally per working milestone.

✅ *Outcome:* Final integrated sticky header system.

---

## 🧠 Development Strategy
| Approach | Pros | Cons |
|-----------|------|------|
| One-shot implementation | Cohesive design, unified animation system. | High regression risk, possible feature loss. |
| Stepwise staged plan *(recommended)* | Safer incremental rollout, controlled testing. | Slightly slower to deliver final visuals. |

---

## 🧩 Recommendations
- Implement **Stage 1–2** first using Codex (controlled prompt per stage).
- Use explicit component naming: `StickyHeaderContainer`, `StickyHeaderPanel`, `StickyHeaderPill`.
- Each commit should preserve all AddTask/Filter functionality before moving to the next phase.

---

## ✅ Expected Deliverables
- Fully functional sticky header.
- Morphing animations between pills and sticky panels.
- Fixed z-index and spacing alignment.
- Preserved feature parity with legacy Add Task / Filter logic.
