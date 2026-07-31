# Rebuild: Vite + React + Supabase + Vercel

Prefer the root [README.md](../README.md) for setup.

## Layout

| Path | Role |
|------|------|
| `web/` | New SPA — deploy to Vercel |
| `supabase/` | Schema + Edge Functions |
| `scripts/migrate-from-flask/` | Export/import old data |
| `scripts/remove-legacy.ps1` | Deletes old Flask app after cutover |
| `legacy-flask/` | Old app (temporary; remove when done) |

## Lifecycle

1. **Develop** against Supabase + `web/`.
2. **Migrate** data using scripts (reads DB; Flask code is only for reference/export).
3. **Verify** production login and scopes/tasks.
4. **Clean** — run `.\scripts\remove-legacy.ps1` so only the modern stack remains.

## Schema source of truth

- `supabase/migrations/20260727000000_init.sql`

## Permission matrix (RLS)

| Action | Owner | Editor | Viewer |
|--------|:-----:|:------:|:------:|
| View scope & tasks | ✅ | ✅ | ✅ |
| Create/edit/complete tasks | ✅ | ✅ | ❌ |
| Delete task (own) | ✅ | ✅ (if owner_id) | ❌ |
| Delete any task / scope | ✅ | ❌ | ❌ |
| Manage shares & invite links | ✅ | ❌ | ❌ |
| Own GitHub config rows | ✅ | ✅ | ✅ |
