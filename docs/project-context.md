# ProjectsManager — Project Context
_Last updated: 2025-09-25 22:24:30_

## Overview
**ProjectsManager** is a web application built with **Python (Flask)** that allows a family or small team to create and track projects. This document provides the minimum, stable context AI coding agents need inside the IDE.

## Repositories & Paths
- **Local**: `F:\Projects\ProjectsManager\`
- **Remote**: https://github.com/hamlet2k/ProjectsManager.git
- **Docs location in repo**: `/docs/`

## Tech Stack
- **Backend**: Flask + Flask‑Migrate (Alembic)
- **Templating**: HTML + Mako
- **Languages (approx.)**: Python (~48%), HTML (~51%)
- **DB**: Relational (SQLAlchemy models; migrations via Flask‑Migrate)

## Project Structure (key files)
```
ProjectsManager/
  app.py                # App entry point, main routes
  database.py           # DB connection & initialization
  forms.py              # WTForms (or similar) validations
  models/               # SQLAlchemy models
  migrations/           # Alembic migration scripts
  templates/            # HTML templates (Mako)
  static/               # CSS, JS, images
  requirements.txt      # Python dependencies
  docs/
    project-context.md
    ai-project-prompt.md
    ai-output-history.md
```
> Note: Structure may evolve (e.g., modular Blueprints). Keep this file updated as changes land.

## Prerequisites
- Python 3.10+ (recommend 3.11)
- pip
- (Optional) Virtualenv

## Setup
### 1) Create & activate a virtual environment
**Windows (PowerShell)**
```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS/Linux**
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2) Install dependencies
```bash
pip install -r requirements.txt
```

### 3) Environment
Create a `.env` (or export env vars in your shell). Suggested keys:
```
FLASK_APP=app.py
FLASK_ENV=development
DATABASE_URL=sqlite:///projects.db
SECRET_KEY=change-me
```

### 4) Database migrations (first run)
```bash
flask db init
flask db migrate -m "initial"
flask db upgrade
```

### 5) Run the server
```bash
flask run
```
(Optional) Enable live reload/debug:
```bash
flask run --debug
```

## Expected Functionality
- Project CRUD (create, list, edit, delete)
- Web forms with validation
- Relational persistence
- HTML templates UI

## Near‑Term Objectives
1. **Document endpoints** (routes + purpose).
2. **Document data models** (entities, attributes, relationships).
3. Refactor into **Blueprints** for modularity.
4. Strengthen **forms & validations**.
5. Add **user authentication** (login/logout, roles).
6. Introduce **.env**‑based configuration and optional Dockerfile.
7. Improve templates with a CSS framework (e.g., Bootstrap).

## Work Guidelines for AI Agents
- Provide complete, runnable code blocks (no ellipses).
- Explain intent briefly with each change.
- Maintain Flask‑Migrate compatibility.
- Prefer readability and modularity; adhere to PEP 8.
- When adding dependencies, update `requirements.txt`.
- If you change structure (e.g., Blueprints), update this document.

## Definition of Done (per task)
- Code compiles, `flask run` works.
- Existing features unaffected (smoke test: create/list/edit/delete project).
- Migrations up to date (`flask db upgrade` runs cleanly).
- `docs/project-context.md` updated if architecture/flow changed.
