# ProjectsManager - Data Model
_Last updated: 2025-10-24 10:30:00_

This is the **single source** for entities, fields, relationships, and migration policy. Keep it in sync with `/models/*.py` and `/migrations/`.

## Entities (current)

### Scope
Columns (`models/scope.py`):
- `id` (PK, int)
- `name` (str, required)
- `description` (text, optional)
- `rank` (int, default 1) for ordering in dashboards
- `owner_id` (FK -> `user.id`, nullable for legacy scopes)
Relationships:
- `tasks` 1:N Task (cascade delete-orphan)
- `tags` 1:N Tag (cascade delete-orphan)
- `shares` 1:N ScopeShare (cascade delete-orphan)
- `notifications` 1:N Notification (cascade delete-orphan)
- `github_configs` 1:N ScopeGitHubConfig (cascade delete-orphan)

### ScopeGitHubConfig
Columns (`models/scope_github_config.py`):
- `id` (PK, int)
- `scope_id` (FK -> `scope.id`, indexed)
- `user_id` (FK -> `user.id`, indexed)
- `github_integration_enabled` (bool)
- `github_repo_id`, `github_repo_name`, `github_repo_owner`
- `github_project_id`, `github_project_name`
- `github_milestone_number`, `github_milestone_title`
- `github_hidden_label` (str, optional) for user-specific GitHub synchronization label
Constraints & relationships:
- Unique constraint `uq_scope_github_config_scope_user` on (`scope_id`, `user_id`)
- Index `ix_scope_github_config_scope_user` on (`scope_id`, `user_id`)
- Many configs per scope; each user maintains their own GitHub settings
- Label is configurable per user per scope and propagates to collaborators sharing the same repository

### Task
Columns (`models/task.py`):
- `id` (PK, int)
- `name` (text, required)
- `description` (text, optional; rendered via Markdown + bleach)
- `start_date`, `end_date` (datetime, optional)
- `rank` (int, default 0)
- `parent_task_id` (FK -> `task.id`, optional) for hierarchy
- `owner_id` (FK -> `user.id`, optional)
- `completed` (bool, default False)
- `completed_date` (datetime, optional)
- GitHub issue linkage: `github_issue_id`, `github_issue_node_id`, `github_issue_number`, `github_issue_url`, `github_issue_state`
- GitHub repo cache: `github_repo_id`, `github_repo_name`, `github_repo_owner`
- GitHub project/milestone cache: `github_project_id`, `github_project_name`, `github_milestone_number`, `github_milestone_title`, `github_milestone_due_on`
- `scope_id` (FK -> `scope.id`, nullable for legacy tasks)
Relationships:
- `subtasks` self-referential 1:N (cascade delete-orphan)
- `tags` many-to-many via `task_tags`
- `sync_logs` 1:N SyncLog (cascade delete-orphan)

### Tag
Columns (`models/tag.py`):
- `id` (PK, int)
- `name` (str, required)
- `scope_id` (FK -> `scope.id`, nullable to allow shared tags)
Constraints & relationships:
- Unique constraint `uq_tag_scope_name` on (`scope_id`, `name`)
- Many-to-many with Task via `task_tags`

### ScopeShare
Columns (`models/scope_share.py`):
- `id` (PK, int)
- `scope_id` (FK -> `scope.id`, indexed)
- `user_id` (FK -> `user.id`, indexed)
- `inviter_id` (FK -> `user.id`, nullable)
- `role` (str enum: `viewer`, `editor`; default `editor`)
- `status` (str enum: `pending`, `accepted`, `revoked`, `rejected`; default `pending`)
- `created_at`, `updated_at` (datetime, auto-managed)
Constraints & relationships:
- Unique constraint `uq_scope_share_user` on (`scope_id`, `user_id`)
- `notifications` relationship for invite/response tracking

### Notification
Columns (`models/notification.py`):
- `id` (PK, int)
- `user_id` (FK -> `user.id`, indexed)
- `scope_id` (FK -> `scope.id`, nullable)
- `share_id` (FK -> `scope_shares.id`, nullable)
- `notification_type` (str enum: `scope_share_invite`, `scope_share_response`)
- `title`, `message` (text payload)
- `status` (str enum: `pending`, `accepted`, `rejected`, `read`; default `pending`)
- `requires_action` (bool)
- `payload` (JSON blob)
- `created_at`, `updated_at`, `read_at`, `resolved_at` (datetime)
Indexes & relationships:
- Index `ix_notifications_user_status` on (`user_id`, `status`)
- Backrefs to `User`, `Scope`, `ScopeShare`

### SyncLog
Columns (`models/sync_log.py`):
- `id` (PK, int)
- `task_id` (FK -> `task.id`)
- `action` (str)
- `status` (str)
- `message` (text, optional)
- `created_at` (datetime, default `datetime.utcnow`)
Used to audit GitHub sync attempts per task.

### User
Columns (`models/user.py`):
- `id` (PK, int)
- `username` (str, unique, required)
- `password_hash` (text)
- `role` (str, default `user`)
- `name` (str, required)
- `email` (str, unique, required)
- `theme` (str, default `light`)
- `github_integration_enabled` (bool)
- `github_token_encrypted` (bytes, encrypted via `services/github_service.py`)
Relationships:
- `owned_tasks`, `owned_scopes`
- `scope_shares` (collaborations where the user is invitee)
- `initiated_scope_shares` (collaborations initiated by the user)
- `notifications` (messages targeted to the user)

### Association tables
- `task_tags` (Task <> Tag link table; PK on both columns)
- `user_scope_association` (legacy link retained for backwards compatibility; sharing now uses `scope_shares`)

## Conventions
- Timestamps stored in UTC (`datetime.utcnow` defaults in models)
- Hard deletes only; cascading relationships remove dependent rows
- Status/role enums stored as strings; helper properties map to `ScopeShareRole`, `ScopeShareStatus`, `NotificationType`, `NotificationStatus`
- Markdown task descriptions are sanitised via bleach before rendering
- GitHub metadata cached on scopes/tasks to limit external calls; verify freshness before sync operations

## Migration policy
- Use **Flask-Migrate (Alembic)** for every schema change
- Never edit historical migrations; create a new revision instead
- When altering models with GitHub metadata or enums, include data migration steps for defaults/backfills
- Commands:
  ```bash
  flask db migrate -m "<reason>"
  flask db upgrade
  ```

## Sample ER (text)
```
User (1) --< Scope (1) --< Task
              |             \
              |              > Task (self) hierarchy
              |--< Tag >--< Task
              |--< ScopeShare >-- User
              |--< Notification (optional via scope_id)
Task --< SyncLog
```

## Multiple database support
The app runs on PostgreSQL (production) and SQLite (local/dev). Provide `DATABASE_URL` to target Postgres; otherwise it falls back to `sqlite:///instance/projectsmanager.db`.

All Alembic migrations guard PostgreSQL-specific statements with dialect checks so the same history upgrades both engines. SQLite remains the quick local default; validate destructive changes on Postgres before release.

### Upgrading both databases
1. **PostgreSQL**
   - Set `DATABASE_URL` to the Postgres connection string
   - Run `flask db upgrade`
   - Optional: verify with `psql "$DATABASE_URL" -c "select version_num from alembic_version;"`
2. **SQLite**
   - Clear `DATABASE_URL`
   - Run `flask db upgrade` again (targets `instance/projectsmanager.db`)
   - Optional: `sqlite3 instance/projectsmanager.db "select version_num from alembic_version;"`
3. Restore your usual environment settings afterwards

### Encryption reminder
GitHub tokens are encrypted using a key derived from `SECRET_KEY`. Rotating the Flask secret requires rotating stored tokens or providing migration tooling.
