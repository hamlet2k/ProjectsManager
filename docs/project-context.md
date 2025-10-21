# ProjectsManager - Project Context (for IDE agents)
_Last updated: 2025-10-24 10:20:00_

This file gives **stable, high-signal context** for IDE-based AI agents (Copilot, KiloCode, Codex). It summarizes the app and points to deeper docs that prompts should load when designing or changing code.

## What this app is
**ProjectsManager** is an authenticated Flask web app for coordinating work across shared scopes. Members organise scopes (project spaces), manage hierarchical tasks with tags, collaborate via scope sharing, sync tasks with GitHub issues, and track collaboration through in-app notifications. The stack leans on SQLAlchemy models, Flask-Migrate migrations, server-rendered templates, and JSON endpoints that support dynamic UI updates.

## Repositories & paths
- **Remote**: https://github.com/hamlet2k/ProjectsManager
- **Local**: `F:\Projects\ProjectsManager\`
- **Docs**: `/docs/` in the repo

## Tech stack (current)
- Flask (Python 3.10+)
- SQLAlchemy + Flask-Migrate (Alembic)
- HTML templates (Mako/HTML)
- Static assets: `/static`
- Migrations: `/migrations`

## Architecture at a glance
- `app.py`: application factory, authentication/session handling, task CRUD, tag APIs, GitHub endpoints
- `routes/`: blueprints (`scopes`, `notifications`) serving scope management and notification UX
- `services/`: domain helpers for GitHub sync, notification assembly, scope orchestration
- `models/`: ORM classes covering scopes, tasks, tags, scope shares, notifications, sync logs, users
- `forms.py`: WTForms definitions shared across views and modals
- `templates/`: HTML layouts, partials, and HTMX-friendly fragments
- `migrations/`: Alembic migration history

## Deep context (load these too)
- **Flows**: `docs/project-flows.md` — User & system flows (CRUD, navigation, happy/edge paths)
- **Data model**: `docs/data-model.md` — Entities, fields, relationships, and migration notes

> Agents: When proposing non-trivial changes (models, endpoints, structure), read both files above first and include migration+diff deliverables in your answer.

## Goals & Roadmap

### Short-Term (MVP)
- Harden scope and task collaboration flows (share invites, permission edge cases, notification read state).
- Keep the GitHub sync happy path stable; document mismatch handling and surface actionable errors.
- Maintain docs hygiene across `/docs/project-context.md`, `/docs/project-flows.md`, `/docs/data-model.md`.
- Incrementally introduce automated checks (lint/tests) around the existing routes.

### Medium-Term
- Expand task metadata (statuses, scheduling, quick filters) and scope dashboards.
- Improve repo tooling (CI, DB reset/fixtures, sample data scripts).
- Capture AI/copilot prompts or history automatically for auditing.
- Shape the long-term sync model (local-first with optional cloud sharing) and record decisions in `/docs`.

### Long-Term Vision
- **Deployment flexibility:** Web app that can also run locally and be wrapped for desktop/mobile (Electron for desktop; Capacitor/Flutter options for mobile).  
- **Hybrid local/cloud:** Offline-capable; users choose which scopes/tasks sync to a group in the cloud for collaboration.  
- **Hands-free AI:** Push-to-talk or always-listening; AI parses intent → calls backend APIs → confirms or asks for clarifications.  
- **Collaboration & roles:** Gradual move to multi-user groups, permissions/roles, and AI-assisted conflict resolution for offline edits.  
- **Tech enablers:** Clear API surface for AI orchestration; STT + NLU pipeline; idempotent endpoints and machine-friendly responses.

## Setup (reference)
```bash
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1
# *nix:    source .venv/bin/activate
pip install -r requirements.txt
flask db upgrade
flask run
```

## Definition of done (per change)
- App runs; core CRUD unaffected (unless intended)
- Migrations created/updated; `flask db upgrade` clean
- Docs updated if structure/DB changed
