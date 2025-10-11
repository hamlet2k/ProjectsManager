# 🧭 Dynamic Sticky Header — Refined Functional Specification

This document consolidates the **refinements and clarifications** for the _Dynamic Sticky Header, Floating Actions, and Scroll Navigation_ feature.  
It preserves all original details while organizing new specifications into distinct actionable sections for implementation.

---

## 1️⃣ Expected Functionality (Refined Behavioral Specs)

### Floating Pills and Sticky Container
- The **floating pills** (`+` Add Task and `#` Filters) must behave as **floating overlays** and **not displace page content**.
- The **sticky header container**:
  - Acts as a **transparent overlay** that hosts both pills and panels.
  - Does **not alter layout height** unless a floating panel is expanded.
  - Maintains a **transparent background** by default; only expanded panels or visible pills overlay the content.
- When a floating panel is expanded:
  - The **panel expands full-width** within the sticky container.
  - The sticky container **increases its height dynamically** to fit the expanded panel.
- Floating pills should:
  - Be **non-intrusive** — compact, circular icons for “Add Task” (`+`) and “Filters” (`#`).
  - Be large enough for **touch interaction on mobile** (~40–48px hit area).
  - Maintain balanced margins from the screen edge (top-right for Filters, top-left for Add Task).

---

## 2️⃣ Core Behavior Preservation

The refactor must retain all functionality and user experience from the previous implementation:
- **Add Task panel**:
  - Expands to support detailed task creation, identical to current behavior.
  - Triggers expand automatically when a user starts editing or adds details.
- **Filters panel**:
  - Maintains full filtering logic, including tags, sorting, and visibility controls.
- UI distribution, colors, and interactions inside the panels must stay **visually consistent** with the original design.

---

## 3️⃣ Scroll and Focus Triggers

### Auto Expansion & Collapse Behavior
- **At the top of the page:**
  - Floating panels **auto-expand** with the same animation used for manual expansion.
  - Panels remain fixed and cannot be collapsed manually.
  - Pills fade out (hidden or dimmed) while expanded.
- **On scroll down:**
  - Both panels **auto-collapse** into pills with smooth animations.
  - Transition mirrors the manual collapse behavior.

### Focus-Based Expansion
- When focus is gained on a field inside a floating panel (e.g., the Add Task name input),  
  that panel automatically **expands** if it is collapsed.
- This includes programmatic focus events triggered by other UI actions.

### Auto Expansion Triggers
- Reaching the top of the page.
- Manual click/tap on a pill.
- Focus gained on any field or filter input element.

---

## 4️⃣ Cleanup and Structural Refactor

To complete this refactor:
- **Remove** static “Add Task” and “Filters” sections from the task list layout.
- These must now exist **only** as part of the sticky header system.
- Ensure:
  - The new sticky header replaces previous markup entirely.
  - All logic references (Vue/JS events, CSS IDs, etc.) are redirected to the new components.
  - The layout does not include redundant vertical spacing (padding/margin) where sections were removed.

---

## 5️⃣ Expansion and Collapse Animations

### Morphing Behavior
- The floating pill **morphs into** its respective panel upon expansion.
- The pill’s icon **animates into** the panel background, giving the illusion of transformation.
- When the panel collapses:
  - The animation reverses: panel shrinks back into the pill form.
  - The pill reappears smoothly (fade + scale transition).

### Icon Transitions
- Each panel includes an icon that **represents the collapsed pill**.
- This icon transitions to indicate the **collapse action** (e.g., changing from `+` to `×` or `▴`).
- The animation uses **opacity blending** and **motion continuity** for a natural feel.

### Performance Considerations
- Use CSS transitions and transform-based animations to minimize reflows.
- Animations must perform smoothly at 60fps, including mobile devices.

---

## 6️⃣ Broken Functionality / Current Known Issues
The following issues were observed in current implementation:
1. **Add Task pill** — no action occurs when clicked.
2. **Filters panel** — collapses unintentionally when clicking anywhere inside.
3. **Empty gap above filters** — visible when scrolled to top due to invisible sticky header container height offset.

---

## 7️⃣ Visual Design Notes

- **Default States:**
  - Pills remain visible while scrolling.
  - Background: subtle contrast (semi-transparent dark/light overlay depending on theme).
- **Expanded States:**
  - Panel overlays content below; z-index must ensure priority over other UI.
  - Sticky container background: transparent except for expanded content area.
- **Mobile:**
  - Pills stack vertically (Add Task above Filters).
  - Panels occupy full width with auto height adjustment.

---

## 8️⃣ Technical Implementation Notes

- Sticky header logic should be **centralized in a single component**.
- Use a **scroll observer** or IntersectionObserver to manage expand/collapse triggers.
- Event hooks:
  - `onScroll`: detect scroll direction and position.
  - `onFocus`: expand related panel.
  - `onTopReached`: trigger auto-expand.
- CSS layering:
  - Sticky header container → `position: fixed; top: 0; left: 0; right: 0;`
  - Panels → `position: absolute; top: 0; width: 100%;`
  - Pills → `position: fixed; top: 0;` with margin offset.

---

## 9️⃣ Expected Deliverables

Must provide:
1. Fully functional sticky header with the refined behaviors above.
2. Smooth morph animations between pills and panels.
3. Fixed spacing and z-index layering to eliminate current layout gaps.
4. Removal of legacy static panels.
5. Updated event and animation handling logic in JS/Vue components.


