"""Utilities supporting scope access control and presentation."""
from __future__ import annotations

import json
from typing import Any, Optional

from models.scope import Scope
from models.task import Task
from models.user import User
from models.scope_share import ScopeShare, ScopeShareRole, ScopeShareStatus


def user_can_access_scope(user: User | None, scope: Scope | None) -> bool:
    """Return True when the given user can view the provided scope."""

    if user is None or scope is None:
        return False
    if scope.owner_id == user.id:
        return True
    share = get_scope_share(scope, user)
    return bool(share and share.status_enum == ScopeShareStatus.ACCEPTED)


def user_owns_scope(user: User | None, scope: Scope | None) -> bool:
    """Return True if the scope belongs to the supplied user."""
    return bool(user and scope and scope.owner_id == user.id)


def get_user_scopes(user: User | None) -> list[Scope]:
    """Return all scopes visible to the user ordered by rank."""

    if user is None:
        return []

    owned = list(user.owned_scopes)
    shared = [share.scope for share in user.scope_shares if share.is_active and share.scope is not None]
    scopes: list[Scope] = owned + shared
    seen: set[int] = set()
    unique_scopes: list[Scope] = []
    for scope in scopes:
        if scope.id in seen:
            continue
        seen.add(scope.id)
        unique_scopes.append(scope)
    unique_scopes.sort(key=lambda item: ((item.rank or 0), item.id))
    return unique_scopes


def get_next_scope_rank() -> int:
    """Return the next rank value for a new scope."""
    latest = Scope.query.order_by(Scope.rank.desc()).first()
    if latest is None:
        return 1
    max_rank = latest.rank or 0
    return max_rank + 1


def get_user_github_token(user: User | None) -> str | None:
    """Return the decrypted GitHub token for the user if available."""
    if not user or not user.github_integration_enabled:
        return None
    token = user.get_github_token()
    if not token:
        return None
    return token


def has_user_github_token(user: User | None) -> bool:
    """True when the user has GitHub integration enabled and a token stored."""
    return bool(get_user_github_token(user))


def validate_github_settings(
    form: Any, *, token_available: bool
) -> tuple[
    bool,
    Optional[dict[str, Any]],
    Optional[dict[str, Any]],
    Optional[dict[str, Any]],
]:
    """Validate GitHub integration fields on the given form.

    Returns a tuple of the desired integration state and parsed repository payloads.
    Validation errors are appended directly to the provided form fields.
    """
    enable_integration = bool(getattr(form, "github_enabled").data)
    repo_payload: Optional[dict[str, Any]] = None
    project_payload: Optional[dict[str, Any]] = None
    milestone_payload: Optional[dict[str, Any]] = None

    if enable_integration:
        if not token_available:
            form.github_enabled.errors.append(
                "A GitHub token must be configured in your user settings before enabling integration."
            )
        repo_value = (getattr(form, "github_repository").data or "").strip()
        if not repo_value:
            form.github_repository.errors.append(
                "A repository must be selected to enable GitHub integration for this scope."
            )
        else:
            try:
                repo_payload = json.loads(repo_value)
            except ValueError:
                form.github_repository.errors.append("Invalid repository selection.")

        project_value = (getattr(form, "github_project").data or "").strip()
        if project_value:
            try:
                project_payload = json.loads(project_value)
            except ValueError:
                form.github_project.errors.append("Invalid project selection.")

        milestone_value = (getattr(form, "github_milestone").data or "").strip()
        if milestone_value:
            try:
                milestone_payload = json.loads(milestone_value)
            except ValueError:
                form.github_milestone.errors.append("Invalid milestone selection.")

    return enable_integration, repo_payload, project_payload, milestone_payload


def build_scope_page_context(
    user: User | None,
    *,
    form: Any,
    show_modal: str | None = None,
) -> dict[str, Any]:
    """Return context payload for the scope management template."""
    context: dict[str, Any] = {
        "scopes": annotate_scope_sharing(get_user_scopes(user), user),
        "scope_form": form,
        "github_token_present": bool(user.github_token_encrypted) if user else False,
        "scope_form_state": build_scope_form_initial_state(form),
    }
    if show_modal:
        context["show_modal"] = show_modal
    return context


def serialize_task_for_clipboard(task: Task | None) -> dict[str, Any]:
    """Serialize a task (and subtasks) for clipboard export."""
    if task is None:
        return {}

    def _serialize_subtask(subtask: Task | None) -> dict[str, Any]:
        if subtask is None:
            return {}
        return {
            "id": subtask.id,
            "name": subtask.name or "",
            "description": subtask.description or "",
        }

    subtasks = sorted(
        (subtask for subtask in task.subtasks or []),
        key=lambda item: ((item.rank or 0), item.id),
    )

    return {
        "id": task.id,
        "name": task.name or "",
        "description": task.description or "",
        "due_date": task.end_date.isoformat() if task.end_date else None,
        "completed": bool(task.completed),
        "completed_date": task.completed_date.isoformat() if task.completed_date else None,
        "has_github_issue": task.has_github_issue,
        "github_issue_number": task.github_issue_number,
        "tags": [tag.name for tag in task.tags],
        "subtasks": [_serialize_subtask(subtask) for subtask in subtasks],
    }


def build_scope_form_initial_state(form: Any) -> dict[str, Any]:
    """Return serializable initial values and errors for the scope form."""
    errors = {key: list(value) for key, value in (form.errors or {}).items()}
    data = {
        "name": getattr(form, "name", None).data or "",
        "description": getattr(form, "description", None).data or "",
        "github_enabled": bool(getattr(form, "github_enabled", None).data),
        "github_repository": getattr(form, "github_repository", None).data or "",
        "github_project": getattr(form, "github_project", None).data or "",
        "github_milestone": getattr(form, "github_milestone", None).data or "",
    }
    return {"data": data, "errors": errors}


def serialize_scope(scope: Scope, current_user: User | None) -> dict[str, Any]:
    """Return a JSON-serializable representation of a scope for client updates."""
    if scope is None:
        return {}

    is_owner = bool(current_user and scope.owner_id == current_user.id)
    share_state = compute_share_state(scope, current_user)
    repo = None
    if scope.github_repo_owner and scope.github_repo_name:
        repo = {
            "id": scope.github_repo_id,
            "name": scope.github_repo_name,
            "owner": scope.github_repo_owner,
            "label": f"{scope.github_repo_owner}/{scope.github_repo_name}",
        }
    project = None
    if scope.github_project_id and scope.github_project_name:
        project = {
            "id": str(scope.github_project_id),
            "name": scope.github_project_name,
        }
    milestone = None
    if scope.github_milestone_number and scope.github_milestone_title:
        milestone = {
            "number": scope.github_milestone_number,
            "title": scope.github_milestone_title,
        }

    return {
        "id": scope.id,
        "name": scope.name or "",
        "description": scope.description or "",
        "owner_id": scope.owner_id,
        "is_owner": is_owner,
        "is_shared": share_state.get("shared_with_current_user", not is_owner),
        "github_integration_enabled": bool(scope.github_integration_enabled),
        "github_repository": repo,
        "github_project": project,
        "github_milestone": milestone,
        "share_state": share_state,
    }


def annotate_scope_sharing(scopes: list[Scope], current_user: User | None) -> list[Scope]:
    """Attach share metadata to the provided scopes for template rendering."""

    for scope in scopes:
        summary = compute_share_state(scope, current_user)
        scope.share_summary = {
            "accepted": summary.get("accepted_count", 0),
            "pending": summary.get("pending_count", 0),
            "rejected": summary.get("rejected_count", 0),
        }
    return scopes


def compute_share_state(scope: Scope, current_user: User | None) -> dict[str, Any]:
    """Return share summary data for the scope and current user."""

    accepted = [share for share in scope.shares if share.status_enum == ScopeShareStatus.ACCEPTED]
    pending = [share for share in scope.shares if share.status_enum == ScopeShareStatus.PENDING]
    rejected = [share for share in scope.shares if share.status_enum == ScopeShareStatus.REJECTED]
    current_share = get_scope_share(scope, current_user) if current_user else None

    return {
        "accepted_count": len(accepted),
        "pending_count": len(pending),
        "rejected_count": len(rejected),
        "shared_with_current_user": bool(current_share and current_share.status_enum == ScopeShareStatus.ACCEPTED),
        "current_role": current_share.role if current_share else ("owner" if current_user and scope.owner_id == current_user.id else None),
    }


def get_scope_share(scope: Scope | None, user: User | None) -> ScopeShare | None:
    """Return the share entry linking the user to the scope if present."""

    if not scope or not user:
        return None
    if scope.owner_id == user.id:
        return None
    for share in scope.shares:
        if share.user_id == user.id:
            return share
    return None


def user_scope_role(user: User | None, scope: Scope | None) -> str | None:
    """Return the role granted to the user for the provided scope."""

    if not user or not scope:
        return None
    if scope.owner_id == user.id:
        return "owner"
    share = get_scope_share(scope, user)
    if not share or not share.is_active:
        return None
    return share.role


def user_can_edit_scope_tasks(user: User | None, scope: Scope | None) -> bool:
    """True when the user can modify tasks within the supplied scope."""

    if not user or not scope:
        return False
    if scope.owner_id == user.id:
        return True
    share = get_scope_share(scope, user)
    return bool(share and share.is_active and share.role_enum == ScopeShareRole.EDITOR)


def user_can_view_task(user: User | None, task: Task | None) -> bool:
    """True when the user can view the specified task."""

    if not user or not task:
        return False
    if task.owner_id == user.id:
        return True
    return user_can_access_scope(user, task.scope)


def user_can_edit_task(user: User | None, task: Task | None) -> bool:
    """True when the user can update the supplied task."""

    if not user or not task:
        return False
    if task.scope is None:
        return False
    if task.scope.owner_id == user.id:
        return True
    share = get_scope_share(task.scope, user)
    if not share or not share.is_active:
        return False
    if share.role_enum == ScopeShareRole.EDITOR:
        return True
    return task.owner_id == user.id


def serialize_share(share: ScopeShare, current_user: User | None) -> dict[str, Any]:
    """Serialize a share relationship for API responses."""

    user = share.user
    status_label = share.status.replace("_", " ").title()
    badge_map = {
        ScopeShareStatus.ACCEPTED.value: "text-bg-success",
        ScopeShareStatus.PENDING.value: "text-bg-warning",
        ScopeShareStatus.REJECTED.value: "text-bg-danger",
        ScopeShareStatus.REVOKED.value: "text-bg-secondary",
    }
    scope_owner_id = share.scope.owner_id if share.scope else None
    return {
        "id": share.id,
        "role": share.role,
        "status": share.status,
        "is_pending": share.status_enum == ScopeShareStatus.PENDING,
        "can_remove": bool(current_user and (current_user.id == share.scope.owner_id or current_user.id == share.user_id)),
        "is_self": bool(current_user and share.user_id == current_user.id),
        "can_resend": bool(
            current_user
            and scope_owner_id == current_user.id
            and share.status_enum in {ScopeShareStatus.REJECTED, ScopeShareStatus.REVOKED}
        ),
        "status_label": status_label,
        "status_badge": badge_map.get(share.status, "text-bg-secondary"),
        "updated_at": share.updated_at.isoformat() if share.updated_at else None,
        "user": {
            "id": user.id if user else None,
            "username": getattr(user, "username", ""),
            "name": getattr(user, "name", ""),
            "email": getattr(user, "email", ""),
        },
    }


def serialize_shares(shares: list[ScopeShare], current_user: User | None) -> list[dict[str, Any]]:
    """Serialize a list of shares."""

    return [serialize_share(share, current_user) for share in shares]
