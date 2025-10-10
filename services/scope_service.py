"""Utilities supporting scope access control and presentation."""
from __future__ import annotations

import json
from typing import Any, Optional

from models.scope import Scope
from models.task import Task
from models.user import User


def user_can_access_scope(user: User | None, scope: Scope | None) -> bool:
    """Return True when the given user can view the provided scope."""
    if user is None or scope is None:
        return False
    if scope.owner_id == user.id:
        return True
    return any(shared_scope.id == scope.id for shared_scope in user.scopes)


def user_owns_scope(user: User | None, scope: Scope | None) -> bool:
    """Return True if the scope belongs to the supplied user."""
    return bool(user and scope and scope.owner_id == user.id)


def get_user_scopes(user: User | None) -> list[Scope]:
    """Return all scopes visible to the user ordered by rank."""
    if user is None:
        return []
    scopes: list[Scope] = list(user.owned_scopes) + list(user.scopes)
    scopes.sort(key=lambda item: ((item.rank or 0), item.id))
    return scopes


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
        "scopes": get_user_scopes(user),
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
        "is_shared": not is_owner,
        "github_integration_enabled": bool(scope.github_integration_enabled),
        "github_repository": repo,
        "github_project": project,
        "github_milestone": milestone,
    }
