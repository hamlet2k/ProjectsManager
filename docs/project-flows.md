# ProjectsManager — Flows
_Last updated: 2025-10-09 14:30:00_

This document describes the current and target **flows**. Keep it terse and implementation-friendly for AI agents.

## Actors
- **Member**: person creating and tracking projects
- **Viewer** (optional): read-only access (future)
- **Admin** (optional): can manage users/settings (future)

## Primary flows (current)
1. **List Projects**
   - GET `/` or `/projects` → Render list of projects.
2. **Create Project**
   - GET `/projects/new` → form
   - POST `/projects` → validate, create, redirect to list/detail
3. **Edit Project**
   - GET `/projects/<id>/edit` → form
   - POST `/projects/<id>` → update and redirect
4. **Delete Project**
   - POST `/projects/<id>/delete` → delete and redirect
5. **Manage Scopes**
   - GET `/scope/` → list available scopes and management actions.
   - GET `/scope/<id>` → select scope and redirect to tasks.
   - POST `/scope/add` → create new scope (modal submission; returns JSON for AJAX requests).
   - POST `/scope/edit/<id>` → update existing scope (modal submission; returns JSON for AJAX requests).
   - GET `/scope/<id>/tasks/export` → export owned tasks to clipboard payload.

> Adjust URLs to match `app.py`; if they differ, update this doc and `project-context.md` in the same PR.

## Secondary flows (planned)
- **Project details page** with related items (e.g., tasks/milestones)
- **Search/filter** on the list
- **User auth**: login/logout, ownership and roles
- **Import/export** basic CSV

## Validation & errors
- Required fields: project `name` at minimum
- Friendly form errors; preserve entered values
- Flash messages for create/update/delete outcomes

## UI notes
- Templates in `/templates`
- Consider Bootstrap for forms & list layout
- Keep routes REST-ish; avoid side effects on GET

## Non-functional
- Logging of key events (creation, deletion)
- CSRF protection for forms
- Basic 404/500 pages
