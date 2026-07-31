# ProjectsManager: PostgreSQL Migration Notes

## Rationale

ProjectsManager started on SQLite for quick iteration, but the team needed
stronger concurrency guarantees, richer data types (JSON, big integers),
and consistent behaviour between development and production. PostgreSQL
became the long-term target while keeping SQLite available for local work.

## What Changed

- `DATABASE_URL` is now read from `.env` (via `python-dotenv`); no credentials
  live in the repository.
- When `DATABASE_URL` is absent the app falls back to
  `sqlite:///instance/projectsmanager.db`, keeping a zero-config local workflow.
- Alembic migrations were updated to run safely on both PostgreSQL and SQLite.
- Tests dynamically provision a PostgreSQL database when credentials are
  available and fall back to temporary SQLite files otherwise.
- `tools/reset_sequences.sql` adds a one-shot helper to realign PostgreSQL
  sequences after manual data loads.

## Keeping Both Databases Up to Date

You may occasionally want both backends migratable—PostgreSQL for production,
SQLite for local/dev. Use this sequence whenever you add a new migration.

1. **Upgrade PostgreSQL**
   ```bash
   # point DATABASE_URL at your Postgres instance (e.g. in .env or shell)
   flask db upgrade
   ```
   Verify:
   ```bash
   psql "$DATABASE_URL" -c "select version_num from alembic_version;"
   ```

2. **Upgrade SQLite**
   ```bash
   # clear DATABASE_URL so the app uses the default SQLite file
   unset DATABASE_URL        # bash/zsh
   set DATABASE_URL=         # PowerShell/CMD
   flask db upgrade
   ```
   Confirm:
   ```bash
   sqlite3 instance/projectsmanager.db "select version_num from alembic_version;"
   ```

3. **Restore Normal Settings**
   ```bash
   # reapply DATABASE_URL if you usually run against PostgreSQL
   ```

Whenever you restore data into PostgreSQL manually (for example using the old
SQLite dump), remember to realign sequence counters:

```bash
psql "$DATABASE_URL" -f tools/reset_sequences.sql
```

## Best Practices Going Forward

- Develop locally with SQLite when you need fast iteration, then validate on
  PostgreSQL before shipping.
- Do not hard-code connection strings; keep `.env` out of version control if it
  contains secrets.
- When writing migrations, guard PostgreSQL-only features (`JSONB`, partial
  indexes, boolean defaults) with dialect checks so SQLite stays functional.
- Run `pytest` with `TEST_DATABASE_ADMIN_URL` configured to get full coverage
  on PostgreSQL during continuous integration.
