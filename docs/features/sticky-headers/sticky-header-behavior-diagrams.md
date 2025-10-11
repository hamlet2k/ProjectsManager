# Sticky Header Behavior Diagrams:

## Terminology clarifications:
**nav-bar** – fixed site header outside the sticky system  
**sticky container** – hosts floating pills and panels  
**filter section** – top panel inside sticky container  
**add-task section** – bottom panel inside sticky container  
**task list** – scrollable page content below the sticky container

## Cases based on State and User Actions
> **Diagram notes:**
> - The height of the screen has been fixed to 10 lines to illustrate expansibility/shrink-ability and scroll index shift
> - The width of the screen has been fixed to 56 characters to demonstrate max-width behavior
> - The symbols ᶺ and ᵛ indicate the start and end of the scrollable area

### Case 1 — At the Top of the Page

**State:**  
User has scrolled to the very top.

**Trigger:**  
Page load or upward scroll until the top boundary is reached.

**Result:**  
- `nav-bar` is fully visible.  
- Filter and Add-Task sections are auto-expanded to full width (same max-width constraint as the task list container).  
- No actions are available to collapse them.  
- Filter is above Add-Task, both with solid backgrounds.  
- Tasks begin immediately below the sticky container.  
- Scrollable area covers the entire page.
```
<top of the page>
|--------------------------------------------------------|
| nav-bar                                               ᶺ| <- nav-bar
|------------------------------------------------------- |
|[             filter section expanded                 ] | <- sticky container
|[            add-task section expanded                ] | 
|------------------------------------------------------- |
|[                    task 1                           ] | <- tasks list
|[                    task 2                           ] |
|[                    task 3                           ]ᵛ|
|--------------------------------------------------------|
```
---
### Case 2 — Scrolling Down the Page

**State:**  
Page initially at the top, both sections expanded.

**Trigger:**  
User scrolls down past the sticky container.

**Result:**  
- `nav-bar` scrolls away and becomes hidden.  
- Filter and Add-Task sections collapse into floating pills: `(+)` and `(#)`.  
- Sticky container is fixed to the top with a transparent background.  
- Only the pills have solid backgrounds.  
- Tasks are visible behind the transparent sticky container.  
- The page remains fully scrollable.
```
|--------------------------------------------------------|
|  (+)                task 2                       (#)  ᶺ| <- sticky container
|------------------------------------------------------- |
|[                    task 3                           ] | <- tasks list
|[                    task 4                           ] |
|[                    task 5                           ] |
|[                    task 6                           ] |
|[                    task 7                           ] |
|[                    task 8                           ]ᵛ|
|--------------------------------------------------------|
```
---
### Case 3 — Expanding Add-Task Panel (Scroll Down)

**State:**  
User has scrolled down with both sections collapsed.

**Trigger:**  
User clicks the Add-Task pill `(+)`.

**Result:**  
- Add-Task section expands to full width (same max-width constraint as the task list container).  
- Sticky container background becomes solid.  
- A collapse indicator `(–)` replaces the Add-Task pill.  
- Filter pill `(#)` remains visible.  
- Sticky container stays fixed to top.  
- Scroll position is preserved while visible content area shrinks to fit the new panel height.
```
|--------------------------------------------------------|
|[ (-)        add-task section expanded            (#) ] | <- sticky container
|--------------------------------------------------------|
|[                    task 2                           ]ᶺ| <- tasks list
|[                    task 3                           ] |
|[                    task 4                           ] |
|[                    task 5                           ] |
|[                    task 6                           ] |
|[                    task 7                           ]ᵛ|
|--------------------------------------------------------|
```
---
### Case 4 — Expanding Both Panels (Scroll Down)

**State:**  
User has scrolled down with both sections collapsed.

**Trigger:**  
User clicks both pills `(+)` and `(#)` to expand Add-Task and Filters.

**Result:**  
- Both sections expand to full width.  
- Sticky container background becomes solid.  
- Collapse indicators `(–)` replace each pill.  
- Sticky container remains fixed at the top.  
- Scroll area contracts to fit panels but keeps the same scroll offset.
```
|--------------------------------------------------------|
|[             filter section expanded             (-) ] | <- sticky container
|[ (-)        add-task section expanded                ] |
|--------------------------------------------------------|
|[                    task 2                           ]ᶺ| <- tasks list
|[                    task 3                           ] |
|[                    task 4                           ] |
|[                    task 5                           ] |
|[                    task 6                           ]ᵛ|
|--------------------------------------------------------|
```
---

### Case 5 — Scrolling Up to Top (Both Expanded)

**State:**  
Both Filter and Add-Task sections are expanded while user is mid-scroll.

**Trigger:**  
User scrolls upward until the top task (`task 1`) becomes visible.

**Result:**  
- Scrollable region extends to the entire page again.  
- Sticky container and panels remain solid and stacked.  
- Tasks realign directly beneath panels.
```
|--------------------------------------------------------|
|[             filter section expanded             (-) ]ᶺ| <- sticky container
|[ (-)        add-task section expanded                ] |
|------------------------------------------------------- |
|[                    task 1                           ] | <- tasks list
|[                    task 2                           ] |
|[                    task 3                           ] |
|[                    task 4                           ] |
|[                    task 5                           ]ᵛ|
|--------------------------------------------------------|
```
**Continued Trigger:**  
User scrolls further upward beyond the top boundary.

**Result:**  
- `nav-bar` reappears.  
- Collapse actions `(–)` disappear.  
- Panels remain expanded, forming the top-of-page layout.
```
<top of the page>
|--------------------------------------------------------|
| nav-bar                                               ᶺ| <- nav-bar
|------------------------------------------------------- |
|[             filter section expanded                 ] | <- sticky container
|[            add-task section expanded                ] | 
|------------------------------------------------------- |
|[                    task 1                           ] | <- tasks list
|[                    task 2                           ] |
|[                    task 3                           ]ᵛ|
|--------------------------------------------------------|
```
---
### Case 6 — Scrolling Up (Both Collapsed)

**State:**  
Both sections are collapsed into pills `(+)` and `(#)` mid-scroll.

**Trigger:**  
User scrolls up until the top of the list (`task 1`) is visible.

**Result:**  
- Scroll area expands to the full page again.  
- Sticky container stays visible with pills left and right.  
- Background remains transparent.
```
|--------------------------------------------------------|
|  (+)                task 1                       (#)  ᶺ| <- sticky container
|------------------------------------------------------- |
|[                    task 2                           ] | <- tasks list
|[                    task 3                           ] |
|[                    task 4                           ] |
|[                    task 5                           ] |
|[                    task 6                           ] |
|[                    task 7                           ]ᵛ|
|--------------------------------------------------------|
```
**Continued Trigger:**  
User continues scrolling upward beyond the top boundary.

**Result:**  
- `nav-bar` reappears.  
- Both sections automatically expand.  
- Collapse indicators `(–)` are hidden.
```
<top of the page>
|--------------------------------------------------------|
| nav-bar                                               ᶺ| <- nav-bar
|------------------------------------------------------- |
|[             filter section expanded                 ] | <- sticky container
|[            add-task section expanded                ] | 
|------------------------------------------------------- |
|[                    task 1                           ] | <- tasks list
|[                    task 2                           ] |
|[                    task 3                           ]ᵛ|
|--------------------------------------------------------|
```
---
### Case 7 — Scrolling Up (Only One Expanded)

**State:**  
Filter section is expanded; Add-Task section is collapsed.

**Trigger:**  
User scrolls up until the top of the list (`task 1`) is visible.

**Result:**  
- Scroll area expands to the full page.  
- Sticky container shows expanded filter section and collapsed Add-Task pill `(+)`.  
- Filter shows collapse indicator `(–)`.
```
|--------------------------------------------------------|
|[ (+)            filter section expanded          (-) ]ᶺ| <- sticky container
|------------------------------------------------------- |
|[                    task 1                           ] | <- tasks list
|[                    task 2                           ] |
|[                    task 3                           ] |
|[                    task 4                           ] |
|[                    task 5                           ] |
|[                    task 6                           ]ᵛ|
|--------------------------------------------------------|
```
**Continued Trigger:**  
User scrolls further upward beyond the top boundary.

**Result:**  
- `nav-bar` reappears.  
- Both sections auto-expand fully.  
- Collapse indicators `(–)` disappear.
```
<top of the page>
|--------------------------------------------------------|
| nav-bar                                               ᶺ| <- nav-bar
|------------------------------------------------------- |
|[             filter section expanded                 ] | <- sticky container
|[            add-task section expanded                ] | 
|------------------------------------------------------- |
|[                    task 1                           ] | <- tasks list
|[                    task 2                           ] |
|[                    task 3                           ]ᵛ|
|--------------------------------------------------------|
```

## Transition Summary

| From State | Trigger | To State | Notes |
|-------------|----------|----------|-------|
| Top-expanded | Scroll down | Collapsed | Navbar hidden |
| Collapsed | Click `(+)` | Add-Task Expanded | Scroll offset preserved |
| Collapsed | Click `(#)` | Filter Expanded | Scroll offset preserved |
| Add-Task Expanded | Click `(–)` | Collapsed | Panel collapses smoothly |
| Filter Expanded | Click `(–)` | Collapsed | Panel collapses smoothly |
| Both Expanded | Scroll to top | Top-expanded | Navbar reappears |
| Collapsed | Scroll to top | Top-expanded | Both panels auto-expand |

## Summary of Visual States

| Mode | Navbar | Filter | Add-Task | Pills | Sticky BG | Panels BG |
|-------|---------|---------|-----------|--------|---------------|------------|
| **Top-expanded** | Visible | Expanded | Expanded | Hidden | Solid | Solid |
| **Collapsed (scroll)** | Hidden | Collapsed | Collapsed | Visible | Transparent | – |
| **Add-Task Expanded** | Hidden | Collapsed | Expanded | Mixed | Solid | Solid |
| **Both Expanded** | Hidden | Expanded | Expanded | Hidden | Solid | Solid |
| **Filter Only Expanded** | Hidden | Expanded | Collapsed | Mixed | Solid | Solid |