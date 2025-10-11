Task: Dynamic Sticky Header, Floating Actions, and Scroll Navigation
Description:
# ✨ Enhancement: Dynamic Sticky Header, Floating Actions, and Scroll Navigation

## Description
Refactor the page layout to improve usability when scrolling through long content by introducing a **smart sticky header system**.  
The goal is to keep **filters**, **task creation**, and **scroll navigation** accessible while reducing clutter when scrolling through long scopes or task lists.

---

## Functional Overview
When the page scrolls:
- The **navbar** scrolls away (non-sticky).
- The **filters** and **add task** components remain visible as **sticky floating pills**.
- A **floating scroll-to-top chevron** appears when the user scrolls down.
- (Optional) A **section navigation bar** dynamically lists sections and scrolls to them.

---

## 🧭 Layout Overview (Visual Sketch)

### Desktop Normal (Top of Page)
```
+-----------------------------------------------------------+
| [Navbar - scrolls normally]                               |
+-----------------------------------------------------------+
| [Filters Panel]                                           |
|-----------------------------------------------------------|
| [Add Task Panel]                                          |
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
```

### Desktop Scrolled (Sticky Mode Active)
```
<screen top>
+-----------------------------------------------------------+
| [⬆️ Add Task (collapsed) ◀]            [🔍 Filters ▶]   | ← Sticky pill (only filters, add task shows the field) Both sections can expand 
+-----------------------------------------------------------+
|  Section Nav - Group item 1 | Group 2 | Group 3 ...]      | ← Auto-hidden when no sections, or sort by name or rank
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
| [Group 1]                                                 | ← Groups displayed only when sort by tag or date
|   Task 1                                                  |
| [Group 2]                                                 |
|   Task 2                                                  |
| [Group 3]                                                 |
|   Task 3                                                  |
|   Task 4                                                  |
|                                                           |
|                    [⬆ Floating Chevron]                   | ← Appears after scrolling down
```

### Desktop Scrolled (Sections expanded)
```
<screen top>
+-----------------------------------------------------------+
| [Filters Panel]                                           | expands and stay expanded until manually collapsed, but floating in place (sticky)
|-----------------------------------------------------------|
| [Add Task Panel]                                          |
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
```

```
<screen top>
+-----------------------------------------------------------+
|                                        [🔍 Filters ▶]    | 
|-----------------------------------------------------------|
| [Add Task Panel]                                          |
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
```

```
<screen top>
+-----------------------------------------------------------+
| [Filters Panel]                                           | 
|-----------------------------------------------------------|
| [⬆️ Add Task  ◀]                                         |
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
```

### Mobile Normal (Top of Page)
```
+-----------------------------------------------------------+
| [Navbar - scrolls normally]                   [hambuger]  |
+-----------------------------------------------------------+
| [⬆️ Add Task (collapsed) ◀]            [🔍 Filters ▶]   | ← Sticky pill (only filters, add task shows the field) Both sections can expand 
+-----------------------------------------------------------+
|  Section Nav - Group item 1 | Group 2 | Group 3 ...]      | ← Auto-hidden when no sections, or sort by name or rank
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
| [Group 1]                                                 | ← Groups displayed only when sort by tag or date
|   Task 1                                                  |
| [Group 2]                                                 |
|   Task 2                                                  |
| [Group 3]                                                 |
|   Task 3                                                  |
|   Task 4                                                  |
|                                                           |
|                    [⬆ Floating Chevron]                   | ← Appears after scrolling down
```

### Mobile Scrolled (Sticky Mode Active)
```
<screen top>
+-----------------------------------------------------------+
| [⬆️ Add Task (collapsed) ◀]            [🔍 Filters ▶]   | ← Sticky pills (only filters) Both sections expand to look like the desktop version but floating in place (sticky)
+-----------------------------------------------------------+
|  Section Nav - Group item 1 | Group 2 | Group 3 ...]      | ← Auto-hidden when no sections, or sort by name or rank
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
| [Group 1]                                                 | ← Groups displayed only when sort by tag or date
|   Task 1                                                  |
| [Group 2]                                                 |
|   Task 2                                                  |
| [Group 3]                                                 |
|   Task 3                                                  |
|   Task 4                                                  |
|                                                           |
|                    [⬆ Floating Chevron]                   | ← Appears after scrolling down
```

### Mobile Scrolled (Sections expanded)
```
<screen top>
+-----------------------------------------------------------+
|                                        [🔍 Filters ▶]    | 
|-----------------------------------------------------------|
| [Add Task Panel]                                          | ← Only one section can be expanded at the same time, it collapses the other when expanded
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
```

```
<screen top>
+-----------------------------------------------------------+
| [Filters Panel]                                           | ← Only one section can be expanded at the same time, it collapses the other when expanded
|-----------------------------------------------------------|
| [⬆️ Add Task  ◀]                                         |
|-----------------------------------------------------------|
| [Task List / Content Sections ...]                        |
```

---

## Functional Requirements

### 1️⃣ Sticky Header Behavior
- **Navbar** scrolls away with the page (not sticky).
- When the user scrolls past the filters area:
  - The **filters** and **add task** components detach and become sticky floating pills.
  - Positioning:
    - Left: “➕ Add Task” pill (collapsed).
    - Right: “🔍 Filters” pill (collapsed).
- Pills expand when clicked and collapse automatically after use.
- When scrolled back to the top, the UI restores to normal expanded layout.

### 2️⃣ Dynamic Expansion
- Pills slide in and out with **smooth transitions** (slide + fade).
- Only one pill can be expanded at a time (filters or add task).
- Expanding a pill overlays it above the content without shifting layout.

### 3️⃣ Floating Scroll-To-Top Chevron
- Displays a **semi-transparent chevron icon (⬆️)** when scrolled down.
- Fixed near the bottom-right corner.
- Clicking it smoothly scrolls back to the top.
- Fades out when near the top.

### 4️⃣ Optional Section Navigation
- When the content contains multiple logical sections (e.g., task groups):
  - Display a **mini section menu** below the pills.
  - Each section label scrolls to its anchor when clicked.
  - Highlight the current section as the user scrolls.
- Auto-hide if the page only has one section.

---

## UX & Design Notes
- **Animations:**  
  - Use CSS transitions or IntersectionObserver for smooth behavior.  
  - Avoid layout reflows or heavy scroll event handlers.
- **Responsiveness:**
  - On mobile, pills can stack vertically (Add Task above Filters).
  - Section nav becomes horizontally scrollable.
- **Visual cues:**
  - Active pill: glowing border or background tint.
  - Chevron fade: 50–70% opacity idle, 100% on hover.

---

## Expected Outcome
- Always-accessible filters and task creation tools.
- Minimal visual clutter while scrolling.
- Smooth animated experience that keeps the interface light and responsive.

---

## Implementation Recommendation
Because the sticky header, floating buttons, and chevron share scroll and intersection logic, implement this as **one integrated feature** rather than separate tasks.

**Suggested order of implementation:**
1. Sticky container system for filters and Add Task.
2. Floating chevron (scroll to top).
3. Section navigation (optional enhancement).