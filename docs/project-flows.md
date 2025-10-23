# ProjectsManager - Flows
_Last updated: 2025-10-24 10:25:00_

This document describes the current and target **flows**. Keep it terse and implementation-friendly for AI agents.

## Actors
- **Member**: authenticated user who owns scopes and tasks.
- **Collaborator**: invited via scope sharing; can view or edit depending on role.
- **Admin** (future): manage users and settings once role support lands.

## Primary flows (current)
1. **Authenticate and onboard**
   - GET `/login`, POST `/login`
   - GET `/signup`, POST `/signup`
   - GET `/logout`
   - GET/POST `/user` for profile and password updates
   - GET/POST `/settings` to manage GitHub integration toggle/token
2. **Scope dashboard**
   - GET `/scope/` lists scopes, share state, and select links
   - GET `/scope/<id>` stores the active scope in session then redirects to tasks
   - GET `/task` renders the scoped task board (HTML or JSON payloads)
3. **Manage scopes**
   - GET/POST `/scope/add` creates a scope (supports modal/JSON submissions)
   - GET/POST `/scope/edit/<id>` updates scope metadata + GitHub settings
   - POST `/<item_type>/delete/<id>` with `item_type="scope"` deletes a scope owned by the user
   - GET `/scope/<id>/tasks/export` returns a clipboard-friendly task payload
4. **Collaborate on scopes**
   - GET `/scope/<id>/shares` returns current share records
   - POST `/scope/<id>/share` invites collaborators (role + email/username)
   - DELETE `/scope/<id>/share/<share_id>` revokes a collaborator
   - POST `/scope/<id>/share/<share_id>/resend` resends the invite notification
   - DELETE `/scope/<id>/share/self` lets invitees leave a shared scope
5. **Task board CRUD**
   - GET `/task` lists active/inactive tasks for the selected scope
   - GET/POST `/task/add` creates a task (modal form responds with HTML/JSON)
   - GET/POST `/task/edit/<id>` edits an existing task
   - POST `/<item_type>/delete/<id>` with `item_type="task"` deletes a task (handles confirms and flashes)
6. **Task progression and ordering**
   - POST `/complete_task/<id>` toggles completion, cascades to subtasks, and syncs GitHub when linked
   - POST `/<string:item_type>/rank` reorders tasks or scopes via drag-and-drop payloads
   - POST `/api/tasks/<task_id>/milestone` updates the stored GitHub milestone mapping
7. **Tag management**
   - GET `/tags` returns tag suggestions for the active scope
   - POST `/tags` creates tags scoped to the current user scope
   - DELETE `/tags/<id>` removes a tag (if unused elsewhere)
   - GET `/tasks/<task_id>/tags`, POST `/tasks/<task_id>/tags`, DELETE `/tasks/<task_id>/tags/<tag_id>` manage assignments
8. **Notifications and collaboration responses**
   - GET `/notifications/` renders pending + recent notifications
   - GET `/notifications/list` returns JSON payloads for HTMX/async refreshes
   - POST `/notifications/mark-read` marks notifications as read
   - POST `/notifications/<id>/accept` and `/notifications/<id>/reject` respond to share invitations
9. **GitHub integration**
   - POST `/api/github/connect` stores or tests an access token
   - POST `/api/github/repos`, `/api/github/projects`, `/api/github/milestones` fetch metadata for the picker widgets
   - POST `/api/github/issue/create` creates a linked issue for a task with configurable synchronization label
   - POST `/api/github/issue/sync` syncs fields for an existing link (labels, status, milestone)
   - POST `/api/github/issue/close` closes the linked GitHub issue when a task completes
   - POST `/api/github/refresh` refreshes cached GitHub data for a task
   - GitHub label configuration per user per scope with automatic propagation to collaborators sharing the same repository
10. **Feedback loop**
    - POST `/api/feedback` submits feedback issues to the configured GitHub repository

## Secondary flows (planned)
- Global search/filter across scopes and tasks (UI + backend query support)
- Project dashboards that aggregate multiple scopes and milestones
- Import/export beyond clipboard payloads (CSV/JSON packages)
- Expanded role management (admin console, viewer-only experiences)
- Offline-friendly desktop/mobile wrappers once sync story solidifies

## Validation & errors
- All mutating routes enforce CSRF via Flask-WTF tokens
- Scope/task edits validate required fields (`name` at minimum) and surface flash or JSON error messages
- Share invites guard against duplicates and return role/status metadata

## UI notes
- Templates in `/templates` with HTMX fragments under `templates/components`
- Bootstrap-based layout; modals handle scope/task creation and edits
- Keep routes REST-ish and prefer POST for side effects (complete, delete, reorder)

## Non-functional
- Logging captures database and GitHub sync failures (see `app.py` and `services/github_service.py`)
- CSRF protection for forms and JSON submissions (helpers in `routes/__init__.py`)
- Basic 404/500 handling via Flask defaults; customize as UX matures
