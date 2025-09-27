# ProjectsManager — Project Context (for IDE agents)
_Last updated: 2025-09-26 08:02:32_

This file gives **stable, high-signal context** for IDE-based AI agents (Copilot, KiloCode, Codex). It summarizes the app and points to deeper docs that prompts should load when designing or changing code.

## What this app is
**ProjectsManager** is a small Flask web app to create and track projects for a family/small team. It uses SQLAlchemy models with Flask-Migrate, HTML templates, and standard Flask patterns.

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
- `app.py` → app factory / routes
- `database.py` → DB init
- `models/` → ORM classes
- `forms.py` → WTForms-style validation
- `templates/` → UI
- `migrations/` → schema history

## Deep context (load these too)
- **Flows**: `docs/project-flows.md` — User & system flows (CRUD, navigation, happy/edge paths)
- **Data model**: `docs/data-model.md` — Entities, fields, relationships, and migration notes

> Agents: When proposing non-trivial changes (models, endpoints, structure), read both files above first and include migration+diff deliverables in your answer.

## Goals & Roadmap

### Short-Term (MVP)
- Keep the ChatGPT bootstrap current (paste-ready prompts for Copilot / Kilo Code / Coding Agent).
- Ensure core CRUD flows are clean; migrations via Flask-Migrate stay green.
- Maintain docs hygiene across `/docs/project-context.md`, `/docs/project-flows.md`, `/docs/data-model.md`, and `/docs/ai-output-history.md`.

### Medium-Term
- Expand entities & relationships (projects ↔ tasks/notes/flows); introduce tags/metadata/hierarchy.
- Automate routine tasks (append AI history, generate migrations/templates).
- Improve repo tooling (lint/tests/CI, DB reset & fixtures, simple search/filters).
- Define early **sync model** (local-first with optional cloud upload of selected scopes/tasks); capture decisions in `/docs`.

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
