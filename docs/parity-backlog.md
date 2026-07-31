# Classic app parity backlog

_Last updated 2026-07-31._ Compared to the Flask UI + screenshots; tracked against the **current** Supabase SPA.

**Live:** https://projects-manager-navy.vercel.app  
**Local:** `web/` → `npm run dev`

## Done (parity achieved or intentionally improved)

- [x] Sketchy / notebook-inspired chrome, sticky filters, floating add/filter pills  
- [x] Project cards: reorder (owners), copy, share, settings, delete, Shared + GitHub badges  
- [x] Task filters: search, sort (rank / name / due groups / created / tags), show completed  
- [x] Tag multi-select filter (AND) + clear; delete tag from chips (confirm + usage count)  
- [x] Quick-add + details accordion; new-task modal  
- [x] Compact task rows: grip, title, GH/milestone/dep pills, complete / copy / edit / delete  
- [x] Drag reorder on **Rank**; **within tag groups** when sort = Tags  
- [x] Notifications (dropdown + page; accept/decline invites)  
- [x] Keyboard shortcuts (focus add, clear search/filters, quick details, save, etc.)  
- [x] Theme light / dark / system  
- [x] **Bootstrap Icons** (same family as classic; not Lucide)  
- [x] Subtasks removed by product decision  
- [x] GitHub create / sync / link / import; read-only when preference off on integrated projects  
- [x] Inline tag editing + minimal `+tag`  
- [x] Import / Export modal (Text, JSON, CSV, AI backlog) + simple copy mode  
- [x] Feedback modal (can open GitHub issues via Feedback Bot when configured)  
- [x] Project GitHub settings: repo, milestone, project board, label, close-on-complete  
- [x] Group headers (tags + due): export, complete group, delete group, add-with-tag  
- [x] App dependencies + GitHub blocked-by pills  
- [x] OAuth Google / GitHub, password recovery, branded auth emails  

## Still open / optional polish

1. Feedback as a first-class in-app inbox (beyond GitHub issue / local) — optional  
2. Richer project list badge states if needed  
3. Full Bootswatch Sketchy CSS port (visual only; not required for parity)  
4. GitHub **webhooks** (two-way without manual refresh) — see product backlog P2  
5. Help site + contextual help links — product backlog P4  

## Design notes

- **Style:** Bootswatch *Sketchy*-inspired (borders, radii, display fonts) — not a paper notebook.  
- **Icons:** Bootstrap Icons via CDN.  
- **Subtasks:** Not in product; `parent_task_id` may exist on legacy rows only.  
- **Internal names:** UI “project” = DB `scopes`.  

## Data migration (historical)

| Source | Result |
|--------|--------|
| Stale SQLite | 13 scopes / 239 tasks (discarded) |
| Postgres `projectsmanager_db` | 17 scopes / 349 tasks (used) |

Re-export helper: `scripts/migrate-from-flask/` (see that folder’s README if present).

## Superseded

Shared multi-repo lock/detach and multi-user-repo mental model → **one repo per project** ([github-integration-matrix.md](github-integration-matrix.md), [product-backlog.md](product-backlog.md)).
