# Database Schema & Migration Rules

- All Alembic migrations must support both **PostgreSQL** and **SQLite** backends.
- Use `DATABASE_URL` from `.env` to determine target backend; fallback to SQLite for local runs.
- New tables must define constraints:
  - Primary keys as `Integer` autoincrement.
  - Foreign keys with explicit `ondelete='CASCADE'` when cascade behavior is desired.
- Add indexes for frequent joins (e.g., `(scope_id, user_id)`).
- When migrating data:
  - Include both upgrade and downgrade logic.
  - Update `/docs/data-model.md` with new or changed fields.
- Sensitive columns (e.g., GitHub tokens) must be **encrypted using the Flask `SECRET_KEY`**.
