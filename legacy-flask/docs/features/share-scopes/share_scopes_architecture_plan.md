# Share Scopes with Other Users — Architecture Overview & Plan

## 1) Architecture Overview

### Current Baseline
- **Data model:** A `Scope` belongs to a single owner (`owner_id`) and exposes relationships to tasks and tags, but has no built-in notion of per-user permissions beyond ownership.
- **User linkage:** `User` already distinguishes between scopes it owns (`owned_scopes`) and scopes granted through a simple many-to-many join table (`user_scope_association`), which supplies read/write access without granular roles or metadata.
- **Access control:** `user_can_access_scope` only checks ownership or presence in the existing join table, leaving no space for pending/revoked states or role-aware capabilities.
- **UI:** The scope list view surfaces whether a scope is shared (badge for non-owners) and exposes owner-only edit/delete controls, but lacks sharing controls or visibility into participants.
- **Client logic:** `scope_form.js` manages modal lifecycle, drag-sorting hooks, and JSON form submissions, giving us patterns to follow for a share modal and async updates.
- **Routing:** The `scopes` blueprint orchestrates scope CRUD, CSRF handling, and JSON responses—ideal for extending with new share APIs and permission decorators.

### Proposed Data Model Changes

#### `scope_shares` table (new model)
- Columns:
  - `id`, `scope_id` → FK `scope.id`
  - `user_id` → FK `user.id`
  - `inviter_id` (tracks who initiated the share, usually owner)
  - `role` (`viewer`, `editor`; default `editor`)
  - `status` (`pending`, `accepted`, `revoked`, `rejected`)
  - `created_at`, `updated_at`
- **Uniqueness:** Unique constraint on (`scope_id`, `user_id`, `status` in active set) to avoid duplicate active grants.
- **Soft-deletion:** Use `status` rather than row removal to preserve history/audit trails.

#### Scope enhancements
- Retain existing `owner_id` (already present).
- Relationship to `ScopeShare` entries for quick lookups (`shares`, `pending_shares`).

#### User enhancements
- Relationship for initiated shares to support notifications.
- Replace the plain `user_scope_association` usage in code paths with `scope_shares` query helpers to avoid double-bookkeeping. Retain legacy table temporarily for migration compatibility (Stage 1).

### ER Snapshot (textual)
```
User ───< Scope (owner)
  │         │
  │         └──< Task
  │
  └──< ScopeShare >── Scope
           │
           └── (role, status metadata)
```

### Data & Request Flow
1. **Owner opens share modal:** Frontend fetches `GET /scope/<id>/shares` to retrieve accepted & pending users, plus search suggestions.
2. **Owner adds collaborator:** `POST` payload (`user_identifier`, `role`) to `/scope/<id>/share`. Backend:
   - Validates ownership, prevents self-sharing.
   - Resolves user (username/email).
   - Creates or updates `ScopeShare` entry (`status=pending` by default).
   - Emits notification (flash + optional async email).
   - Returns updated share list and toggled icon state.
3. **Collaborator sees scope:** When `status` becomes `accepted`, `user_can_access_scope` returns true via new join logic, scope appears in list with “Shared” badge.
4. **Collaborator rejects:** `DELETE /scope/<id>/share/self` (or `PATCH status=rejected`) to mark share as rejected, cascades removal of derived permissions and notifies owner.
5. **Owner revokes:** `DELETE /scope/<id>/share/<user_id>` sets `status=revoked`, optionally auditing reason.

### Permission Matrix
| Action                         | Owner | Shared User (Editor) | Shared User (Viewer) | Pending/Revoked |
|--------------------------------|:-----:|:--------------------:|:--------------------:|:---------------:|
| View scope & tasks             |  ✅   |         ✅           |         ✅ (RO)      |       ❌        |
| Create/edit tasks              |  ✅   |         ✅           |          ❌          |       ❌        |
| Complete tasks                 |  ✅   |         ✅           |          ❌          |       ❌        |
| Rename/delete scope            |  ✅   |          ❌          |          ❌          |       ❌        |
| Manage shares                  |  ✅   |          ❌          |          ❌          |       ❌        |
| Reject share                   |  N/A  |         ✅           |         ✅           |       ❌        |
| Link to GitHub (owner repos)   |  ✅   |          ❌          |          ❌          |       ❌        |
| Link to personal GitHub        |  ✅   |         ✅           |         ✅           |       ❌        |

> Default plan assumes **no visibility** for `pending` to avoid surprising users. (Optionally configurable.)

---

## 2) Backend Logic & APIs

### Models / Services
- New SQLAlchemy model **`ScopeShare`** with helper enums and query scopes (`active()`, `for_scope(scope_id)`).
- Update **`user_can_access_scope`** to:
  - Accept optional `required_role`.
  - Check `ScopeShare.status == accepted`.
  - Cache results for request lifecycle.
- Introduce:
  - `user_scope_role(user, scope)`
  - `user_can_edit_tasks(user, scope)`
- Extend **`serialize_scope`** to expose `share_state` (`is_shared`, `shared_with_count`, `pending_invites` when owner) for UI toggles.
- Migration window: maintain compatibility with `user_scope_association` by **auto-synchronizing accepted shares** until table retired.

### Routes / Controllers
- `GET /scope/<id>/shares` — **Owner-only.** Returns accepted, pending, and suggestions.
- `POST /scope/<id>/share` — **Owner-only.** Payload: `identifier`, `role`. Creates **pending** share.
- `PATCH /scope/<id>/share/<share_id>` — Owner can change role/resend; shared user can set `status=rejected`.
- `DELETE /scope/<id>/share/<share_id>` — Owner revokes share.
- `DELETE /scope/<id>/share/self` — Collaborator rejects.
- `POST /scope/<id>/share/<share_id>/accept` — Collaborator accepts invite (if invite flow used).

**Supporting elements**
- Decorators: `@scope_access(role='owner')`, `@scope_access(role='editor')`.
- Flash messaging consistent with existing patterns.
- Optional server-side notifications (email queue) flagged for later stage.

### Query Updates
- Task fetch routines (task list, clipboard export) must respect new role logic.
- Owner-scope selection and dashboard counts include shared scopes once accepted.

---

## 3) Frontend Integration

### Components
- **`share_icon.html` partial**
  - Props: `scope_id`, `is_owner`, `shared_count`, `has_pending`.
  - Button with tooltip/active state, accessible label.
- **`scope_share_modal.html`**
  - **Current collaborators** (list with role badges, remove buttons).
  - **Pending invites** (resend/cancel).
  - **Add user** form (search-as-you-type; fallback manual entry).
  - CSRF hidden field.

### JavaScript
- New module `static/js/scope_share.js`:
  - Binds share icon → open modal → fetch via `GET /scope/<id>/shares`.
  - Handles add/remove/reject with optimistic updates.
  - Integrates with Bootstrap modal API similar to `scope_form.js`.
  - Emits events so scope cards refresh share badge state.

### Templates
- Modify `templates/scope.html` card header to include share icon for owners and dynamic shared state indicator for all users.
- Include modal partial and script bundle via `scripts` block.
- Subtle share state indicator (filled icon when `shared_count > 0` or `has_pending`).

### Accessibility / UX
- Keyboard navigable modal controls; ARIA labels.
- Inline validation for username/email resolution.
- Toast notifications after share/revoke operations.

---

## 4) Role & Permission Handling
- Introduce **`ScopeRole`** enum on backend mapping to capabilities (viewer vs editor).
- Update task routes/services to guard destructive operations:
  - Task creation/edit/complete: **editor or owner**.
  - Task deletion: owner-only (or feature-flag `allow_editor_delete`).

### GitHub operations
- When interacting with **owner-linked GitHub** data, enforce **owner** role.
- Allow editors to attach **their own tokens** at task level; flows remain independent.

### Activity logging (optional)
- `ScopeShareEvent` record to audit share invites and rejections (future stage).

---

## 5) Migration Plan
- **Alembic migration:**
  - Create `scope_shares` table with constraints and indexes.
  - Backfill `owner_id` on scopes if any `NULL` (shouldn’t happen; enforce).
  - Populate `scope_shares` by scanning `user_scope_association`; mark entries as **accepted** with `role='editor'`.
  - Optionally add DB trigger or scheduled job to keep tables in sync during transition.
- **Data cleanup:**
  - Remove duplicates.
  - Ensure owners implicitly treated as editors via logic (no extra rows).

---

## 6) Phased Implementation Plan

### Stage 1 – Backend Foundations
- Build `ScopeShare` model, enums, migrations.
- Update services and route guards to use new logic; keep legacy table for read-backward-compat.
- Add API endpoints with JSON responses (**cURL-testable**).
- Feature flag: `ENABLE_SCOPE_SHARING` (return 404 when disabled).

### Stage 2 – Frontend & Modal UX
- Implement share icon partial, modal template, and JS module.
- Wire endpoints to modal (list/add/remove).
- Update scope list rendering to show share status and handle dynamic updates.

### Stage 3 – Permissions & Collaborator Controls
- Enforce task-level permissions using new role checks.
- Add **reject-share** flow for collaborators and owner notifications.
- Remove legacy `user_scope_association` writes; optionally keep read for fallback with warning logs.

### Stage 4 – Notifications & Polish
- Integrate flash/toast messages, optional email/push notifications.
- Add analytics/logging for share events.
- UX refinements (search suggestions, invite link, role management).
- Remove feature flag; deprecate legacy association table once confidence achieved.

---

## 7) Testing & Validation

### Unit tests
- **Model:** unique constraints; status transitions (`pending → accepted → revoked`).
- **Service helpers:** `user_can_access_scope`, role checks, serialization output.
- **API endpoints:** share creation, duplicate invites, revocation, rejection.

### Integration tests
- Authenticated flows verifying shared scopes appear/disappear correctly.
- Task CRUD under shared scopes with different roles.
- CSRF handling for AJAX requests mirroring existing patterns.

### Migration tests
- Alembic upgrade/downgrade in staging DB snapshots.
- Data backfill correctness (owners unaffected, share counts accurate).

### Manual QA checklist
- Owner share/unshare, collaborator rejection, pending states.
- UI responsiveness, accessibility tab order, screen reader labels.
- Cross-browser (Chrome/Firefox/Safari) modals.
- GitHub integration unaffected for existing scopes.

### UX validation
- Usability tests for discoverability of share icon and clarity of roles.
- Feedback on notifications and share rejection messaging.

---

## 8) Deployment & Rollout Notes
- Launch Stage 1 behind **config flag** (`ENABLE_SCOPE_SHARING`).
- Monitor DB load; ensure indexes on `(scope_id, status)` and `(user_id, status)`.
- Provide admin tooling (temporary CLI or admin view) to inspect share relationships for support.
- Communicate change to users with release notes and an inline tooltip that explains the share icon.
