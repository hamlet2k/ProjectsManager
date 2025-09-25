# AI Project Prompt — ProjectsManager
_Last updated: 2025-09-25 22:24:30_

This document tells AI coding agents how to collaborate on **ProjectsManager** in VS Code.

## Tooling & Cost Strategy
Use the lowest‑cost tools that can reliably complete the task:
1. **Copilot Pro** (prefer model `grok-code-fast-1`) for inline edits and short prompts.
2. **Kilo Code** (prefer `grok-code-fast-1`) for structured refactors within the editor.
3. **ChatGPT Business (Codex/Code Interpreter)** for larger design changes or multi‑file edits.
4. Escalate to higher‑tier models only if attempts fail twice or task complexity warrants it.

> Consider available credits (Kilo Code, OpenAI, xAI) and prefer free/low‑cost options first.

## Always Load Context
All prompts to any AI agent **must** reference:
- `docs/project-context.md`
- `docs/ai-output-history.md` (append‑only log)

## Standard Prompt Template (copy/paste into your AI agent)
```
You are assisting on the Flask app "ProjectsManager".
Context files to load first:
- docs/project-context.md
- docs/ai-output-history.md

Task:
<describe the concrete change to make>

Constraints:
- Keep Flask-Migrate compatible; create/adjust migrations when models change.
- Provide complete code blocks (no placeholders).
- Maintain readability (PEP8), small focused commits.
- If structure changes, update docs/project-context.md.

Deliverables:
1) The exact file diffs or full file contents to apply.
2) A brief summary of what changed and why.
3) A short entry to append to docs/ai-output-history.md titled:
   "YYYY-MM-DD – <task name> – summary & follow-ups".
```

## Debug/Refactor Workflow
1. Create a short **issue / goal** in the prompt.
2. Provide current file excerpts that matter.
3. Ask for a minimal, testable patch.
4. Run locally; if failing, paste the error and rerun the template above.
5. Once merged, append a summary to `docs/ai-output-history.md`.

## Definition of Done
- App runs (`flask run`).
- CRUD unaffected unless intentionally modified.
- New/changed models have migrations.
- The summary was appended to `docs/ai-output-history.md`.

## Commit & Branching
- Branch names: `feat/<scope>`, `fix/<issue>`, `docs/<topic>`, `refactor/<area>`.
- Conventional commits:
  - `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`
- After each significant change, ensure `docs/project-context.md` is accurate.

## Notes
- `docs/ai-output-history.md` is **append‑only**. Do not edit previous entries.
- Prefer reading these docs directly from the repository to avoid local/remote drift.
