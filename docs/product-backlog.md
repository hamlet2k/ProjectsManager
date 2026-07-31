# Product backlog (Supabase + React stack)

_Last updated 2026-07-30._

Source: agreed integration design + user’s master task list + classic GitHub issues context  
(https://github.com/hamlet2k/ProjectsManager/issues).

---

## Integration contract (agreed)

- **One scope → one GitHub repository** (no detach / multi-repo).
- **Canonical binding on the scope** (not per-user repos). Collaborators may configure when unlocked; owner can override.
- **Owner override:** confirm impact + notify (no collaborator veto by default; optional later).
- **User opt-in** to integrations (GitHub now; Outlook/Google later with possible `per_user_mirror` mode).
- **Visibility:** hide GitHub chrome when user preference is OFF **except** on scopes already integrated (self or shared).
- **Mutations** (create/sync/close/config): need preference ON + credentials (+ role).
- **Two-way sync:** issue closed → task complete (pull/sync now; webhooks later); complete → close optional.
- **Issue links scope-global** (one issue per task under the one repo).
- **List badges:** Shared + GitHub (later other providers).

### Implementation phases (next engineering)

| Phase | Scope |
|-------|--------|
| **I1** | Visibility helpers + hide/show GitHub UI + list badges (Shared / GitHub) |
| **I2** | Single scope binding model in UI/API; migrate mental model off multi-user-repo |
| **I3** | Restrictions when preference OFF; read-only on integrated scopes |
| **I4** | Owner override + notifications |
| **I5** | Two-way: complete↔close options; harden sync; project-add on create; ensure labels |
| **I6** | Link existing issue; webhooks; OAuth (optional) |
| **I7** | Generic `user_integrations` / `task_external_links` when second provider starts |

---

## Already solid on new stack (do not re-open unless regression)

UI/UX core: scopes, tasks, tags, filters, sort (incl. tag groups), sticky chrome, share, invites, notifications, theme, confirm modals, import/export clipboard basics, drag reorder, markdown expand, feedback (local), Edge Functions for PAT + create/sync/close API, data migration from Postgres.

---

## Near-term product backlog (new stack)

Prioritized for a solid product before deep GitHub, then chatbot/AI.

### P0 — Integration foundation (next)

- [x] I1–I3: preference + integrated-scope visibility; scope list badges; read-only vs actions
- [x] I2: one binding per scope (collaborator can set; owner override via owner-preferred canonical binding)
- [x] Complete → close GitHub (optional `close_issue_on_complete` on scope binding) — pull/sync already closes→complete path where implemented
- [x] GitHub UI hidden when preference off (except integrated scopes)
- [x] Project GitHub settings polish (link toggle, status banner, loading/saving states)
- [ ] Apply migration `20260729000000_github_visibility_rls.sql` on Supabase (member SELECT + close_issue_on_complete) — run in SQL Editor if not done

### P1 — UX polish from your list (still valid)

- [x] Scroll to newly added task + temporary highlight
- [x] Esc cancels task tag editor / closes expanded task details (modals already Esc)
- [x] Auto-collapse filters after tag selection / search Enter on mobile
- [ ] Global + contextual keyboard shortcuts consolidated; alt-text for keybound buttons
- [ ] Select which icons show collapsed vs expanded on task rows
- [x] Rename UI “end date” → “due date” everywhere (labels already Due date)
- [x] Clearer drag-reorder hints when sort is Tags / not Rank
- [ ] Due-date group sort (today / tomorrow / …) if not fully parity
- [ ] Delete tag from filter chips with confirm when in use
- [x] Search also matches GitHub issue numbers / milestones when GH active
- [ ] Navbar: home icon; less “back”; edit-project affordance if desired
- [x] Spinner on GitHub create/sync task actions
- [x] Signup/login polish (OAuth Google/GitHub, password recovery)
- [x] Project title font bolder (not hollow sketch font only)
- [x] Dark mode: selected-tag border greyer (not bright blue)
- [ ] Markdown help file + link from description UI
- [x] Token/help links in Settings

### P2 — GitHub depth

- [x] I4 Owner override + notifications (confirm + notify members on link/change/disable)
- [x] User vs project enable/disable matrix (issue #35 adapted) — see `docs/github-integration-matrix.md`
- [x] Link existing issue / import task from GitHub (picker + From GitHub button)
- [x] Ensure label; add issue to Project board on create/link/import when project board is set
- [x] Blocked-by issue pill (red) from GitHub relationships (sync/link/import refresh `github_blocked_by`)
- [ ] Webhooks for two-way without manual sync
- [x] SSO GitHub/Google sign-in (Auth OAuth; see docs/auth-oauth-smtp.md)

### P3 — Chatbot / voice / AI (large epic)

- [ ] Header chatbot icon (always visible) + overlay + ESC + shortcut
- [ ] Chat endpoints + action mapping to APIs
- [ ] Mic toggle / PTT + shortcuts + device settings
- [ ] STT → chatbot submit
- [ ] AI suggest title/description; per-scope AI prompt
- [ ] Create task from image

### P4 — Platform / release

- [ ] Testing strategy (unit + e2e) for new stack
- [ ] Donation, naming, deploy plans, desktop/LAN executable
- [ ] Offline SQLite → sync (long-term; different architecture)
- [ ] **Comprehensive help site/page** explaining the app and features (GitHub matrix, share roles, tags, sync LWW, etc.)
- [ ] Contextual **Help links** from Settings / GitHub modal / Share / empty states into the right help section
- [ ] Help index entry in navbar (once help content exists)
- [x] Advanced import/export (issue #49 core): unified modal, formats (plain/checklist/AI backlog/JSON/CSV), full metadata toggle, AI instructions field, copy + download, paste/upload import with preview — user/scope `advanced_export_enabled` DB prefs still optional polish
- [x] Rename scopes → projects in UI (internal DB still `scopes`)

### Explicitly deferred / N/A on new stack

| Old item | Why |
|----------|-----|
| Flask SECRET_KEY / session cookies / Flask blueprints / WTForms | Old stack; Supabase Auth + Vercel HTTPS cover many |
| Subtasks / drag to subtasks | Removed by product decision |
| Decouple GH per user per scope/task as multi-repo | Superseded by **one repo per scope** |
| Shared-repo detach logic | Dropped |
| Hardcoded Flask secrets checklist | Track only if any secret still in client (there should be none) |

### Partially done / verify in new app

| Item | Status |
|------|--------|
| Feedback button | Done (local/clipboard); not yet GH issue auto-create |
| Confirm modals | Done (themed) |
| Sticky header / floating pills | Done |
| Share scopes | Done |
| Markdown in expanded task | Done |
| Copy scope/tasks | Done |
| Theme light/dark/system | Done (device localStorage + profile seed) |

---

## How we’ll use this

1. **Next engineering focus:** remaining P2 (link existing issue, Project board on create), then help system, then polish/AI.  
2. Integration enable/disable matrix: **`docs/github-integration-matrix.md`** (issue #35 adapted).  
3. Your long list stays context; this file is the **authoritative** backlog for the new repo.  
4. **Historical AI export** (below) informs priorities but does not replace this file.

---

## Historical project export (AI backlog intake)

Source export: `projects-manager-app-tasks.md` (206 tasks, 2026-07-30) via Import/Export → AI backlog.

### Instructions for the AI (from that export — keep applying)

1. These tasks live on the **Projects Manager App** backlog in the product.  
2. They **may be outdated** and were often written for the **old Flask app**.  
3. **Intake as knowledge** to inform the **future** backlog — do not re-implement Flask-era details blindly; re-map to the Supabase/React stack and current product decisions.

### Status map (new stack) — high-signal items from that export

| Theme / old # | Intent | New-stack stance |
|---------------|--------|------------------|
| #1 Signup ↔ profile | Consistency, validation, security | Largely done (Supabase Auth, OAuth, recovery); no Flask CSRF |
| #2 Scope edit modal empty | Bug | Verify / fix if still present on project edit |
| #3 PR/commit review | Process | Ongoing |
| #4 GH switch overlaps label | UI bug | Check Settings / project GitHub modal |
| #5 / #35 GH UI when disabled | Read-only chrome | **Done** (matrix + soft-disable) |
| #9–16, #19–20, #26, #38, #49–50 Chatbot/voice/AI | Epic | **P3** |
| #12 Chevron expand | Expand task details | Partially done (title expand); chevron polish optional |
| #17 / #44 Import from GitHub | Link existing issue | **P2 open** |
| #18 Per-user scope GH config | Multi-binding | Superseded: **one repo/project** + user PAT |
| #21 Mobile auto-collapse filters | UX | **Done** |
| #22 Keyboard shortcuts | Consolidate | **P1 open** |
| #23 Scopes → projects | Rename UI | **Done** |
| #25 Separate GH tables | Schema | Done conceptually (scope/task github configs) |
| #27 Delete task group | Tag group bulk delete | Still useful |
| #28 Help system | Help modal + index | **P4 open** |
| #29 / #49 Advanced import/export | Modal + formats | **Core done**; user/scope advanced flag optional |
| #30 Multi-integration link modal | Jira etc. | Deferred until 2nd provider |
| #35 Flash new task | Scroll + highlight | **Done** |
| #36 Collapsed vs expanded icons | Row chrome | **P1 open** |
| #39 End → due date | Labels | **Done** |
| #41 Feedback | Navbar feedback | **Done** (Feedback Bot → GH issue) |
| #42 SSO | Google/GitHub | **Done** |
| #43 Spinners on sync | UX | Largely done on GH actions |
| #44–48 Testing, donate, name, deploy, LAN exee | Platform | **P4** |
| #51 Task dependencies | Graph | Deferred / backlog |
| #52 Dark selected-tag border | Theme | **Done** |

Flask-specific notes in long descriptions (WTForms, CSRF, `task.html`, etc.) are **not** implementation targets on this stack.
