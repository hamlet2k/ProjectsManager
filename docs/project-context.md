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
