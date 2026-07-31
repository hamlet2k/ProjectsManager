# Classic app parity backlog

_Last updated 2026-07-28._

Source: screenshots in `C:\Users\Fredek\Pictures\projects-manager` + legacy Flask UI.

## Done

- [x] Notebook-like light chrome / pill navbar
- [x] Scope cards: drag reorder (owners), copy, share, settings, delete, badges
- [x] Task filters: search, sort (rank/name/due/created), show completed
- [x] Tag multi-select filter (AND) + clear
- [x] Quick-add task bar
- [x] Compact task rows: grip, title, GH/milestone pills, complete/copy/edit/delete
- [x] Drag-and-drop task reorder (when sort = Rank, no filters)
- [x] Notifications dropdown (accept/decline invites)
- [x] Shortcuts: Ctrl/Cmd+↑ focus add, Ctrl/Cmd+Backspace clear search, Esc clear search, Ctrl+↓ detailed form from quick-add
- [x] Theme light/dark/system
- [x] **Lucide icons** (grip, check, copy, edit, trash, share, settings, github, etc.)
- [x] **Sticky filter bar** (collapses on scroll; manual toggle)
- [x] **Subtasks removed** — no parent/child hierarchy in the product UI
- [x] **GitHub create/sync from task row** (issue button; read-only when integration off)
- [x] **Inline tag editing** on task row (tag button → chip picker + new tag)
- [x] **Clipboard bulk import** (Import list on task page)
- [x] **Feedback modal** (question/enhancement/bug → clipboard + localStorage)
- [x] Scope GitHub modal: repo + milestone + project + label

## Still open / polish

Integration direction **superseded 2026-07-29** — see `docs/product-backlog.md` (one repo per scope; collaborator can link; owner override + notify; no detach).

1. ~~Full shared-repo lock/detach UX~~ **Dropped** (one binding per scope instead)
2. Feedback → real shared inbox (GitHub issue / table) instead of clipboard only
3. ~~Sticky header auto-collapse polish~~ **Done**
4. ~~Task detailed form accordion from quick-add~~ **Done**
5. Scope list badges: Shared + GitHub; richer states
6. ~~Group headers by tag~~ **Done**
7. Complete-task → auto close GitHub issue (optional) + harden two-way sync
8. Optional: full Bootswatch Sketchy CSS
9. Integration phases I1–I7 in `docs/product-backlog.md`

## Design notes (2026-07-29)

- **Style:** Bootswatch *Sketchy* inspired (hand-drawn borders, asymmetric radii, Neucha/Cabin Sketch fonts) — not a paper notebook.
- **Icons:** Bootstrap Icons (`bi bi-github`, etc.) via CDN — same set as classic Flask. Lucide removed (no real GitHub mark; we had wrongly used a git-branch icon).
- **Subtasks:** Fully removed from UI/API create paths. DB may still have `parent_task_id` for legacy rows; new tasks always `null`.

## Notes

- Prefer matching behavior in `legacy-flask/templates/task.html` and `legacy-flask/static/js/*`.
- Live: https://projects-manager-navy.vercel.app
- Local: `web/` → `npm run dev`

## Data migration source

| Attempt | Source | Result |
|---------|--------|--------|
| First | SQLite `instance/projectsmanager.db` (stale) | 13 scopes / 239 tasks |
| Correct | Postgres `projectsmanager_db` via `DATABASE_URL` | 17 scopes / 349 tasks |

Re-export:  
`python scripts/migrate-from-flask/export_json.py --database-url "$DATABASE_URL" --out scripts/migrate-from-flask/export-pg`
