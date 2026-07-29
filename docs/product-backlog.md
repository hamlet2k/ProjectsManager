# Product backlog (Supabase + React stack)

_Last updated 2026-07-29._

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
- [ ] Scope GitHub settings polish (enable switch layout; populated edit modal if still broken)
- [ ] Apply migration `20260729000000_github_visibility_rls.sql` on Supabase (member SELECT + close_issue_on_complete)

### P1 — UX polish from your list (still valid)

- [ ] Scroll to newly added task + temporary highlight
- [ ] Esc cancels task edit / closes expanded edit contexts
- [ ] Auto-collapse filters after selection on mobile
- [ ] Global + contextual keyboard shortcuts consolidated; alt-text for keybound buttons
- [ ] Select which icons show collapsed vs expanded on task rows
- [ ] Rename UI “end date” → “due date” everywhere
- [ ] Due-date group sort (today / tomorrow / …) if not fully parity
- [ ] Delete tag from filter chips with confirm when in use
- [ ] Search also matches GitHub issue numbers / milestones when GH active
- [ ] Navbar: home icon; less “back”; edit-scope affordance if desired
- [ ] Spinner on sync/transactional actions
- [ ] Signup/login polish (profile standards, register↔login links, password strength)
- [ ] Scope title font bolder (not hollow sketch font only)
- [ ] Dark mode: selected-tag border greyer (not bright blue)
- [ ] Markdown help file + link from description UI
- [ ] Token/help links in Settings

### P2 — GitHub depth

- [ ] I4 Owner override + notifications (+ optional lock)
- [ ] Link existing issue / import task from GitHub
- [ ] Ensure label; add issue to Project on create
- [ ] Blocked-by issue pill (red) from GitHub relationships
- [ ] Webhooks for two-way without manual sync
- [ ] SSO GitHub/Google (broader than PAT)

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
- [ ] Help index + navbar help
- [ ] Advanced import/export configuration
- [ ] Rename scopes → projects/groups/lists in UI (product naming)

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

1. **Next engineering focus:** Integration phases **I1–I3** (+ complete↔close if you want it in the same slice).  
2. Your long list stays context; this file is the **authoritative** backlog for the new repo.  
3. Chatbot/AI and multi-provider stay **after** GitHub contract is implemented and stable.

When you say go, start with **I1–I3** (visibility, badges, single binding, restrictions).
