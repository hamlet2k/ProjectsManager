# 🧠 Codex Prompt: Architectural Design & Implementation Plan for Sticky Header Feature

## 🎯 Objective
Generate complete **architectural design documentation** and **implementation plans** for the Sticky Header enhancement in the `ProjectsManager` app. This request is for **documentation only** — no code changes should be made.

The goal is to have Codex:
- Analyze the overall feature scope.
- Propose an architecture design that ensures maintainability, modularity, and consistency with existing systems.
- Define clear phase-based implementation plans (Stage 1 and beyond).
- Produce accompanying design diagrams or structural documentation if supported.

---

## 🏗️ Context Summary
The Sticky Header project aims to enhance usability when scrolling through long task lists. The header should dynamically adapt between expanded and collapsed states, housing the **Filters** and **Add Task** sections. These morph between two UI states:
- **Floating Pills:** Minimal overlay elements pinned to the top corners of the viewport when scrolled.
- **Sticky Panels:** Expanded full-width sections within the sticky container when at the top or manually expanded.

The feature replaces the existing static filters and add-task sections without losing existing functionality (tag filtering, GitHub sync behavior, etc.).

---

## 🧩 Deliverables Expected from Codex
1. **Architecture Overview Document**
   - Describe the architecture of the sticky header system.
   - Identify major components and how they integrate with existing app modules.
   - Include the data flow (state management, event handling, communication between filters/add-task panels, and task list).

2. **Component Hierarchy Diagram**
   - Illustrate UI structure and parent-child relationships.
   - Show lifecycle transitions (expanded → collapsed → re-expanded).

3. **State Machine Diagram**
   - Define all visual/behavioral states (e.g., `expanded`, `collapsed`, `scrolling`, `mobile stacked`).
   - Include transition triggers (scroll, user actions, viewport changes).

4. **Implementation Plan**
   - Define a multi-phase rollout plan:
     - **Stage 1:** Introduce sticky container, morphing pills, and panels within the task list page.
     - **Stage 2+:** Expand with additional visual and behavioral refinements (animations, mobile parity, performance optimizations).
   - Each phase should detail sub-tasks, dependencies, and acceptance criteria.

5. **Integration Notes**
   - Ensure no loss of functionality from the original filters/add-task components.
   - Specify steps to preserve or refactor:
     - Tag filtering and selection.
     - Auto-tagging for GitHub integration.
     - Event hooks (task creation, filters refresh).

6. **Performance & UX Considerations**
   - Discuss performance impacts of scroll listeners, animations, and layout reflows.
   - Recommend efficient state and DOM update strategies.

7. **Testing & QA Plan**
   - Define test cases per state and transition.
   - Include cross-device behavior validation (desktop vs mobile).
   - Include accessibility validation criteria.

---

## 🧭 Instructions for Codex
**Codex should:**
- Focus on architectural and planning output — **no implementation code.**
- Use the most recent documentation (initial, refined, and behavioral diagrams) as context.
- Produce deliverables in a structured markdown format.
- Emphasize reusability and consistency with existing front-end and backend design conventions in `ProjectsManager`.

---

## 🪄 Prompt for Codex
```
You are an expert system architect. Based on the full project documentation provided, generate a complete architectural design and phased implementation plan for the Sticky Header feature in ProjectsManager. This includes:
- System architecture overview
- Component hierarchy diagram (markdown ASCII acceptable)
- State machine definition with transitions
- Phase-based implementation roadmap
- Integration safeguards for existing features
- Performance, UX, and testing considerations

Do NOT produce code. Focus on clarity, modularity, and maintainability.
```

---

Once Codex generates the architecture plan, we will proceed with **Stage 1 detailed planning and refinement**.

