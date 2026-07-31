# Rebuild notes (Vite + React + Supabase + Vercel)

_Status: **complete on `main`** (2026-07-31, PR #130). Prefer [../README.md](../README.md) for setup._

## Outcome

| Path | Role |
|------|------|
| `web/` | Production SPA (Vercel) |
| `supabase/` | Schema migrations, Edge Functions, auth email templates |
| `scripts/migrate-from-flask/` | One-shot data export/import from the old DB |
| `legacy-flask/` | Archived classic app (optional delete) |

## Lifecycle (done)

1. Develop SPA against Supabase.  
2. Migrate data from Postgres export where needed.  
3. Production on Vercel + Auth redirects.  
4. Feature work continues on product backlog — not “rebuild infrastructure.”

## Schema

Migrations under `supabase/migrations/` (apply in timestamp order). Notable later ones:

| Migration | Purpose |
|-----------|---------|
| `…_init.sql` | Core schema, profiles, scopes, tasks, tags, GitHub tables, RLS base |
| `…_github_visibility_rls.sql` | Member read of bindings, `close_issue_on_complete` |
| `…_github_binding_notifications.sql` | Binding change notify helpers |
| `…_github_blocked_by.sql` | Issue blocked-by payload on task GitHub config |
| `…_task_dependencies.sql` | App-native task dependencies |
| `…_scope_feature_flags.sql` | `dependencies_enabled`, `advanced_export_enabled` |

## Permission matrix (RLS / app)

| Action | Owner | Editor | Viewer |
|--------|:-----:|:------:|:------:|
| View project & tasks | ✅ | ✅ | ✅ |
| Create/edit/complete tasks | ✅ | ✅ | ❌ |
| Delete tasks | ✅ | ✅* | ❌ |
| Delete project | ✅ | ❌ | ❌ |
| Manage shares & invite links | ✅ | ❌ | ❌ |
| Configure GitHub binding | ✅ | ✅ (when allowed) | ❌ |
| GitHub mutations (create/sync/close) | ✅** | ✅** | ❌ |

\* Subject to app + RLS (editors can delete tasks they work on).  
\*\* Requires user GitHub preference ON + credentials + project linked.

## Related

- Product backlog: [product-backlog.md](product-backlog.md)  
- GitHub matrix: [github-integration-matrix.md](github-integration-matrix.md)  
