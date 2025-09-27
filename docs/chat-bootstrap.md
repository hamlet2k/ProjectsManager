# ProjectsManager — Chat Bootstrap Instructions
_Last updated: 2025-09-26 08:22:56_

This note is meant to live in this ChatGPT project’s **Instructions**. It tells assistants how to behave, which tools to prefer, and where the canonical docs live. Keep it short here; the repo holds the long-form context.

---

## Canonical Docs (Repository)
- **Repo (remote):** https://github.com/hamlet2k/ProjectsManager
- **Local path:** `F:\Projects\ProjectsManager\`
- **Docs folder:** `/docs/`
  - `project-context.md` – high-signal context for IDE agents
  - `project-flows.md` – user/system flows
  - `data-model.md` – entities, fields, relationships, migration policy
  - `ai-output-history.md` – append-only history of AI runs

> Always treat `/docs/` as the **source of truth**. Do not maintain separate local copies outside the repo.

---

## How assistants should operate (TL;DR)
1. **Load context first**: Read `/docs/project-context.md` and `/docs/ai-output-history.md` (and for non-trivial tasks also `/docs/project-flows.md` and `/docs/data-model.md`) before proposing changes.
   - **Check current repo version**: Before editing design docs (`/docs/project-context.md`, `/docs/project-flows.md`, `/docs/data-model.md`, `/docs/todo.md`), always review the existing file contents in the repository to avoid overwriting or dropping sections.
2. **Cost-aware tools**: Prefer low-cost agents first; escalate only after two failed attempts or when complexity requires it.
3. **Deliverables for each change**:
   - Complete file diffs or full file contents (no placeholders).
   - Migrations compatible with Flask-Migrate when models change.
   - Update `requirements.txt` if dependencies change.
   - Append a short summary entry to `/docs/ai-output-history.md`.
4. **Documentation hygiene**: If structure/architecture changes, update `/docs/project-context.md` (and flows/data model when applicable) in the same PR.

---

## VS Code AI Extensions — Quick Comparison (practical guidance)
> Notes are intentionally general and vendor-agnostic; exact model availability may vary by account and plan.

| Extension | Best for | Strengths | Limitations / Gotchas | How we’ll use it here |
|---|---|---|---|---|
| **GitHub Copilot (Chat & inline)** | Small to medium edits, inline refactors, adding tests | Fast inline edits, good at local context, quick fix-its | Can overfit to current file; multi-file plans may need guidance | Use first for quick patches and targeted refactors |
| **Kilo Code** | Structured multi-file changes, repo-aware edits | Strong at “apply this diff across files” tasks; can follow explicit checklists | May need precise prompts & file lists | Use when we need coordinated edits across several files |
| **Codex/Coding Agent (ChatGPT extension)** | Larger design changes, stepwise refactors, reasoning | Good at planning and summarizing; can propose diffs and tests | May require copy/paste of context if repo access is restricted | Use when we need broader reasoning or migration planning |

**Selection rule of thumb**
- Start with **Copilot** → if task spans multiple files or requires repo-wide changes, switch to **Kilo Code** → for complex migrations/architecture, use **Coding Agent** for planning, then execute via Copilot/Kilo Code.

---

## Paste‑Ready Prompts are **Required**
When a task involves code changes, the assistant must provide:
- **(A) A concise, copyable prompt** ready to paste into Copilot / Kilo Code / Coding Agent (pick the most suitable; include variants if helpful).
- **(B) The proposed code/diff snippets** in the chat for review.
- **(C) Post-apply checks** (commands and what to verify).

### Minimal Prompt Template (generic; works for most tools)
```
Project: ProjectsManager (Flask)

Load first:
- docs/project-context.md
- docs/ai-output-history.md
- docs/project-flows.md (if routes/UX change)
- docs/data-model.md (if models/migrations change)

Task:
<describe the concrete change>

Constraints:
- Keep Flask-Migrate compatibility; create/adjust migrations if models change.
- Provide complete code blocks/diffs (no placeholders).
- Maintain PEP 8 readability; keep changes minimal and focused.
- If structure changes, update docs in /docs/ accordingly.

Deliverables:
1) Exact file diffs or full file contents.
2) Brief rationale (what & why).
3) Migration commands (if any) and run notes.
4) A short entry to append to docs/ai-output-history.md:
   "YYYY-MM-DD – <task> – summary & follow-ups".
```

### Tool‑Specific Prompt Hints
- **Copilot (inline/Chat)**: include the target file path(s) and a succinct “apply this patch” block; keep each patch small.
- **Kilo Code**: enumerate all files to touch, provide a checklist, then supply diffs per file.
- **Coding Agent**: ask for a plan first; then request the diffs; finally ask for tests and migration notes.

---

## Access Notes
- If the repo is **public and browsing is enabled**, assistants may fetch these docs directly each chat.
- If the repo is **private or browsing is disabled**, paste the relevant doc sections, or rely on the latest copies shared in this project.

---

## Definition of Done (per task)
- App runs (`flask run`) and CRUD flows unaffected unless intended.
- `flask db upgrade` is clean (when models change).
- Docs in `/docs/` updated when structure/DB/flows change.
- A history entry was appended to `docs/ai-output-history.md`.

---

### File & Snippet Delivery Expectations
- Always provide either:
  1. Full updated file (in a code block with the correct source language, e.g., ```python, ```markdown, etc.),
  2. Or update the file inside the Canvas,
  3. Or attach a downloadable link to the full updated file.
- Partial snippets are allowed **as long as they are in proper source-language fenced blocks** (e.g., ```python, ```markdown, ```json, ```bash).
- Never provide “floating” text without code fences when the user might need to copy/paste.
- Keep `/docs/` files as the **single source of truth** for project context, flows, and history.

### Handling Code Blocks and Rendering Issues
- When showing code fences **inside another fenced block** (e.g., ```markdown containing ```python), always escape the backticks so they render properly. Example:

  ```markdown
  \`\`\`python
  example code
  \`\`\`
- Alternatively, use indentation (4 spaces) to represent nested code fences:
    ```python
    example code
    ```
- For large files with many nested fences, prefer delivering via:
   1. Canvas update, or
   2. Downloadable file link.

