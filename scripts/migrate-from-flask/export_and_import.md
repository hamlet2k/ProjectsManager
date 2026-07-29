# Data migration: Flask DB → Supabase

The old Flask app lives in **`legacy-flask/`** until cutover. After you verify the
new app, run `scripts/remove-legacy.ps1` to delete it.

## Prerequisites

1. Supabase project with `supabase/migrations/20260727000000_init.sql` applied.
2. Service role key (Settings → API) — **never** put this in the Vite app.
3. Access to the old PostgreSQL or SQLite database.
4. Node 20+ and Python 3.10+ (for export).

## Step 1 — Export from Flask DB

### PostgreSQL

```bash
# From machine that can reach old DB
psql "$OLD_DATABASE_URL" -c "\copy (select * from \"user\") to 'export/users.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from scope) to 'export/scopes.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from task) to 'export/tasks.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from tag) to 'export/tags.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from task_tags) to 'export/task_tags.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from scope_shares) to 'export/scope_shares.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from notifications) to 'export/notifications.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from scope_github_config) to 'export/scope_github_config.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from task_github_config) to 'export/task_github_config.csv' csv header"
psql "$OLD_DATABASE_URL" -c "\copy (select * from sync_log) to 'export/sync_log.csv' csv header"
```

### Or JSON via Python (works for SQLite + Postgres)

```bash
cd scripts/migrate-from-flask
pip install sqlalchemy psycopg2-binary  # or only sqlalchemy for sqlite
# From repo root:
python scripts/migrate-from-flask/export_json.py \
  --database-url "sqlite:///legacy-flask/instance/projectsmanager.db" \
  --out scripts/migrate-from-flask/export

# Or Postgres:
# python scripts/migrate-from-flask/export_json.py --database-url "$DATABASE_URL" --out scripts/migrate-from-flask/export
```

## Step 2 — Create auth users + import rows

```bash
export SUPABASE_URL="https://xxxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."
export GITHUB_TOKEN_SECRET="same-secret-as-edge-functions"  # optional; for token re-encrypt
export OLD_FERNET_SECRET_KEY="flask-secret-key"              # only if migrating GitHub tokens

node import.mjs ./export
```

The importer:

1. Creates `auth.users` via Admin API for each exported user (random temp password + email).
2. Writes `profiles` with `legacy_id`.
3. Inserts scopes → shares → tags → tasks (parents first) → task_tags → github configs → notifications → sync_logs.
4. Writes `id-map.json` for audit.

**Passwords cannot be migrated** from Werkzeug hashes. After import, either:

- Ask each family member to use “Forgot password” / magic link, or
- Use the printed one-time temp passwords from the import log (if you enable that mode).

## Step 3 — Validate

```sql
select count(*) from profiles;
select count(*) from scopes;
select count(*) from tasks;
-- Compare to old DB counts
```

Log in as each user, open a shared scope, confirm tasks and tags.

## Step 4 — Cutover

1. Deploy `web/` to Vercel with `VITE_SUPABASE_*` env vars.
2. Deploy Edge Functions + set `GITHUB_TOKEN_SECRET`.
3. Confirm family can sign in and see migrated scopes/tasks.
4. Share the Vercel URL with family.

## Step 5 — Delete the old Flask app

When you are sure you do not need the old code or DB exports:

```powershell
# From repo root (Windows)
.\scripts\remove-legacy.ps1
# Type: DELETE LEGACY
```

That removes `legacy-flask/` and leaves only the modern stack (`web/`, `supabase/`, etc.).
