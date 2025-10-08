# ProjectsManager — Data Model
_Last updated: 2025-09-26 08:02:32_

This is the **single source** for entities, fields, relationships, and migration policy. Keep in sync with `/models/*.py`.

## Entities (current + planned)

### Scope (current)
- `id` – PK, int
- `name` – str, required
- `description` – text, optional
- `rank` – int ordering field
- `owner_id` – FK → `user.id`
- GitHub integration fields
  - `github_integration_enabled` – bool
  - `github_repo_id`, `github_repo_name`, `github_repo_owner`
  - `github_project_id`, `github_project_name`
  - `github_project_column_id`, `github_project_column_name`
  - `github_milestone_number`, `github_milestone_title`
- Relationships: 1–N `Task`, 1–N `Tag`

### Task (current)
- `id` – PK, int
- `name` – str, required
- `description` – text, optional
- `start_date`, `end_date` – datetime, optional
- `completed`, `completed_date`
- `owner_id` – FK → `user.id`
- `scope_id` – FK → `scope.id`
- GitHub fields
  - `github_issue_id`, `github_issue_number`, `github_issue_url`, `github_issue_state`
  - `github_repo_id`, `github_repo_name`, `github_repo_owner`
  - `github_milestone_number`, `github_milestone_title` _(new)_
- Relationships: 1–N `Tag` (via association), self-referential subtasks

### Project (current)
Fields (baseline; confirm with `models/*.py` and update):
- `id` – PK, int
- `name` – str, required
- `description` – str, optional
- `status` – enum/str (e.g., active, on_hold, done) – optional
- `created_at` – datetime
- `updated_at` – datetime

Indexes:
- `(name)` for quick search (optional)

### Task (planned)
- `id` – PK
- `project_id` – FK → Project.id
- `title` – str, required
- `description` – str, optional
- `status` – enum (todo, doing, done)
- `due_date` – date, optional
- `priority` – smallint, optional
- `created_at`, `updated_at` – datetime

Relationships:
- Project 1–N Task

### User (future)
- `id`, `email`, `password_hash`, `role`
- Relationship: User 1–N Project (owner), optional collaborators

## Conventions
- Timestamps: UTC, set defaults in DB/model
- Soft deletes: **not** enabled (hard delete). If added, document `deleted_at` and adjust queries.
- Status enums: keep simple; validate at form level.

## Migration policy
- Use **Flask-Migrate (Alembic)** for all schema changes.
- Every PR that touches models includes a migration:
  ```bash
  flask db migrate -m "<reason>"
  flask db upgrade
  ```
- Never edit old migrations; create new ones.
- If a destructive change is needed, include data migration steps or transitional fields.

## Sample ER (text)
```
Project (1) ───< (N) Task
User (1) ───< (N) Project   [future]
```
