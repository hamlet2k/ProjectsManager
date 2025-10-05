# ProjectsManager — TODO
_Last updated: 2025-09-26 18:57:24_

A single, living backlog for this project. Keep it terse and implementation-friendly. Check items off and move them between sections as we go.

> Source of truth for project docs remains `/docs/` in the repo. This file is for *work tracking*.

---

## Now (Top 5)
- [ ] **Document endpoints**: enumerate current routes in `app.py` with brief purpose; add to `/docs/project-flows.md`.
- [ ] **Blueprint refactor (plan)**: propose module layout, file moves, and migration of routes to Blueprints; produce diffs.
- [ ] **Data model review**: confirm `Project` fields and decide on `Task` entity; generate initial migration if adding `Task`.
- [ ] **Bootstrap in ChatGPT**: ensure the Project’s Instructions use the latest `projectsmanager-chat-bootstrap.md` (link here in chat).
- [ ] **CSRF & basic error pages**: verify CSRF enabled; add friendly 404/500 templates.

---

## Next (Shortlist)
- [ ] **Auth (scaffold)**: login/logout; protect create/edit/delete; add roles (optional).
- [ ] **.env config**: standardize config via `python-dotenv`; document in `/docs/project-context.md`.
- [ ] **UI polish**: introduce Bootstrap; unify form layout and flash messaging.
- [ ] **Search/filters**: add simple search by project name/status on list page.
- [ ] **Import/Export CSV**: minimal CSV export of projects; optional CSV import.
- [ ] **Hybrid sync design**: define selective sync of scopes/tasks, groups, and basic permissions; document flows in `/docs/project-flows.md`.
- [ ] **Wrappers research**: compare Electron (desktop) vs. Capacitor / Flutter (mobile); capture pros/cons & packaging steps in `/docs/project-context.md`.
- [ ] **AI voice prototype**: push-to-talk + STT selection; intent → API mapping → confirmation loop; log ambiguities and ask follow-ups.
- [ ] **API surface for AI**: ensure endpoints for projects/tasks/notes are idempotent and machine-friendly; draft a minimal OpenAPI or endpoints table.

---

## Backlog
- [ ] **Dockerfile & compose**: local DB + app service; document dev workflow.
- [ ] **Logging**: structured logs for create/update/delete operations.
- [ ] **Soft deletes (optional)**: decide policy; implement `deleted_at` if adopted.
- [ ] **CI smoke test**: GitHub Actions to run `flake8`/`pytest` (if tests exist) and `flask db upgrade`.
- [ ] **Project detail page**: show project with related tasks.
- [ ] **Role-based access**: owner/admin permissions for edit/delete.
- [ ] **Export data model diagram**: auto-generate ER from SQLAlchemy (optional).
- [ ] **Offline conflict resolution**: policy + UX; AI-assisted merge prompts when edits diverge.
- [ ] **Roles & permissions**: model access for local/cloud groups.
- [ ] **Packaging pipelines**: build scripts for desktop/mobile wrappers; env/config strategy.
- [ ] **Proactive assistant**: suggestions, blockers, and flow-changing prompts based on context.
- [ ] **Update TODO.md**: periodically review and prune; keep actionable.

---

## Done
- [x] **Split docs** into `project-context.md`, `project-flows.md`, `data-model.md`. _(2025-09-26)_
- [x] **Consolidate model/cost strategy** into ChatGPT bootstrap; remove `ai-project-prompt.md` from repo (pending PR). _(2025-09-26)_

---

## Decisions Log (brief)
- **Behavior/cost strategy** belongs in ChatGPT **bootstrap**, not repo docs.
- Repo docs are for IDE agents: context, flows, data model, history.

---

## Conventions
- Keep tasks **atomic**; aim for PRs that do one thing well.
- If a task changes models, include **migration** in the PR and update `/docs/data-model.md`.
- If routes/UX change, update `/docs/project-flows.md`.
- Always append a summary of meaningful changes to `/docs/ai-output-history.md`.

---

## AI Assistant Usage
Whenever a task involves code changes, provide BOTH:
1) **Paste-ready prompt** for the chosen tool (Copilot / Kilo Code / Coding Agent).  
2) **Code/diff snippets** in chat.

### Task Prompt Template (drop into your tool)
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
- Flask-Migrate compatibility for any model change.
- Provide complete code blocks/diffs (no placeholders).
- Minimal, focused changes; PEP 8.

Deliverables:
1) Exact file diffs or full contents.
2) Brief rationale.
3) Migration commands (if any).
4) Entry text for docs/ai-output-history.md.
```

---

## Quick Links
- Repo: https://github.com/hamlet2k/ProjectsManager
- Local: `F:\Projects\ProjectsManager\`
- Docs: `/docs/`

