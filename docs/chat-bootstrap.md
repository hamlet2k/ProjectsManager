# ProjectsManager — Chat Bootstrap Instructions

This short note lives in the project’s **Instructions** field and points all AI agents to the canonical docs inside the repo. Keep this snippet as-is and update the docs in `/docs/` as the single source of truth.

---

## Canonical Docs (Repository)
- **Repo (remote):** https://github.com/hamlet2k/ProjectsManager
- **Local path:** `F:\Projects\ProjectsManager\`
- **Docs folder:** `/docs/`
  - `project-context.md` – technical context for IDE agents
  - `ai-project-prompt.md` – how AI should collaborate & pick models
  - `ai-output-history.md` – append-only history of AI runs
  - `chat-boostrap.md` – AI chatbot instructions (this file)

> Always treat `/docs/` as the **source of truth**. Do not maintain separate local copies outside the repo.

---

## How assistants should operate (TL;DR)
1. **Load context first:** Read `/docs/project-context.md` and `/docs/ai-output-history.md` before proposing changes.
2. **Cost-aware tools:** Prefer low-cost agents (Copilot Pro/Kilo Code with `grok-code-fast-1`) and escalate only if attempts fail twice or task complexity requires it.
3. **Deliverables for each change:**
   - Complete file diffs or full file contents (no placeholders).
   - Migrations compatible with Flask-Migrate when models change.
   - Update `requirements.txt` when adding dependencies.
   - Append a short summary to `/docs/ai-output-history.md`.
4. **Documentation hygiene:** If structure/architecture changes, update `/docs/project-context.md` in the same PR.

---

## Access Notes
- If the repo is **public and browsing is enabled**, assistants may fetch these docs directly each chat.
- If the repo is **private or browsing is disabled**, the user may paste relevant doc sections; otherwise assistants should proceed using the latest versions available in this conversation.

---

## Mini Prompt Template
```
Project: ProjectsManager (Flask).
Load first:
- docs/project-context.md
- docs/ai-output-history.md

Task: <describe the concrete change>
Constraints:
- Keep Flask-Migrate compatibility; create/adjust migrations if models change.
- Provide complete code blocks/diffs.
- Maintain readability (PEP 8).

Deliverables:
1) File diffs or full contents.
2) Brief rationale.
3) Entry to append to docs/ai-output-history.md (YYYY-MM-DD – <task> – summary & follow-ups).
```
