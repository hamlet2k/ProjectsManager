# Product backlog (Supabase + React stack)

_Last updated 2026-07-31._ On **`main`** after PR #130.

Source: integration design, classic GitHub issues, and ongoing product decisions.  
Repo: https://github.com/hamlet2k/ProjectsManager  

---

## Integration contract (agreed)

- **One project → one default GitHub repository** (historical multi-repo links may still exist as read-only).  
- **Canonical binding on the project** (collaborators can set when unlocked; owner override).  
- **Owner override:** confirm + notify members (no collaborator veto by default).  
- **User opt-in** for GitHub mutations (preference + credentials).  
- **Visibility:** hide GitHub chrome when preference is OFF **except** on projects already integrated.  
- **Two-way status:** pull/sync issue closed → task complete; complete → close optional (`close_issue_on_complete`). Webhooks later.  
- **Issue links are project-global** (one linked issue per task under the binding model).  
- **List badges:** Shared + GitHub.  

### Implementation phases

| Phase | Scope | Status |
|-------|--------|--------|
| **I1–I3** | Visibility, badges, single binding, preference OFF read-only | **Done** |
| **I4** | Owner override + notifications | **Done** |
| **I5** | Complete↔close, project board on create, labels | **Done** |
| **I6** | Link/import issue; webhooks; OAuth login | Link/import + OAuth **done**; webhooks **open** |
| **I7** | Generic multi-provider integrations | Deferred |

---

## Already solid (do not re-open unless regression)

Projects, tasks, tags, filters, rank + tag-group drag, due groups, sticky chrome, share/invites, notifications, theme, confirms, Import/Export, dependencies UI, GitHub create/link/import/sync, option-C delete, group complete/delete, create-issue-on-add, feature flags, OAuth, password recovery, email templates, Feedback Bot path, Ko-fi link, mobile nav.

---

## Near-term backlog

### P0 — Foundation

- [x] I1–I4 GitHub visibility, binding, override, notifications  
- [x] Complete → close optional; pull sync  
- [x] Migrations including feature flags (`dependencies_enabled`, `advanced_export_enabled`)  
- [x] Branded auth email templates applied to hosted project  

### P1 — UX

- [x] Scroll/flash to task (create, deps, tag move, import)  
- [x] Esc / shortcuts / mobile filter collapse  
- [x] Due-date groups; within-tag reorder; group complete/delete  
- [x] Tag chip delete (corner badge, no reflow on mobile)  
- [x] Navbar home + edit project; mobile overflow menu  
- [x] Markdown help; last tags remembered on create  
- [x] Ko-fi support control  

### P2 — GitHub depth

- [x] Link / import issue; Project board add; blocked-by pills  
- [x] App dependencies + bidirectional GH dep reconcile  
- [x] Repo filter chips; no #github system-tag primary UX  
- [x] Create issue when adding task (opt-in)  
- [x] Delete: unlink and/or close open issue  
- [ ] **Webhooks** for two-way without manual refresh  
- [x] SSO GitHub/Google (Auth OAuth)  

### P3 — Chatbot / voice / AI

- [x] **MVP voice assistant** on project page: mic (browser STT) + typed fallback → Edge Function plan → create / complete / uncomplete (+ tags, due)  
- [x] Ambiguous complete: pick from candidate chips  
- [x] Push-to-talk FAB + hold/lock; add_tags / update_task on existing tasks  
- [x] Smart create (title/description/tags) + set_view (search/sort/completed/tag filter)  
- [x] Per-project AI context prompt (user brief → generated prompt → save)  
- [x] AI enhance title/description/tags on task create/edit  
- [ ] Richer chat history / multi-turn memory  
- [ ] Delete / reorder / GitHub link tools (with confirms)  
- [ ] Create task from image  
- [ ] Optional MCP surface over the same tools  
- [ ] **Admin page: manage LLM configuration** (provider, model, base URL, keys via secure flow, test call, defaults) — currently secrets are set only via Supabase CLI/dashboard  

### P4 — Platform / release

- [ ] Automated tests (unit + e2e)  
- [x] Ko-fi / support affordance in UI  
- [ ] **PWA installable + offline app shell** (deferred — install shell complicated mic STT without clear benefit)  
- [ ] Offline task data / background sync (long-term)  
- [ ] Help site + contextual help links  
- [x] Advanced import/export + project simple-copy flag  
- [x] UI “projects” (DB still `scopes`)  
- [x] Shared project live-ish updates (Realtime + focus/poll fallback)  

### Partially done

| Item | Status |
|------|--------|
| Feedback | GitHub issue via Feedback Bot when configured; not a full in-app inbox |
| Multi-repo history | Filter chips + accents; default repo for new issues |
| Voice assistant | Live; LLM via Edge secrets (OpenAI / xAI / OpenRouter). Admin UI still backlog |
| Shared sync | Realtime subscribed; refetch on focus + periodic poll as safety net |

---

## How we’ll use this

1. **Next focus:** admin LLM config page, webhooks (P2), or help (P4).  
2. GitHub behavior: **`docs/github-integration-matrix.md`**.  
3. Voice setup: **`docs/voice-assistant.md`**.  
4. This file is the **authoritative** backlog for the SPA stack.  

---

## Historical AI export intake

Source: AI backlog export (2026-07-30). Treat as **knowledge only**; many items were Flask-era. Remap to the current stack; do not re-implement obsolete details.
