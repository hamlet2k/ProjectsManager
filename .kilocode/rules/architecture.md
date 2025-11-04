# Architecture & Structure Rules

- ProjectsManager is a **Flask web app** with modular blueprints and SQLAlchemy ORM.
- Directory conventions:
  - `app.py`: main application factory and route registration
  - `/routes/`: blueprints for scopes, tasks, notifications
  - `/services/`: logic for GitHub sync, notification dispatch, scope management
  - `/models/`: ORM entities (Scope, Task, Tag, ScopeShare, Notification)
  - `/templates/` and `/static/js/`: UI, scripts, and HTMX fragments
- New backend modules must register through the Flask app factory.
- Migrations must accompany any model changes using **Flask-Migrate**.
- Always update `/docs/project-context.md`, `/docs/project-flows.md`, and `/docs/data-model.md` when architecture or database structure changes.
