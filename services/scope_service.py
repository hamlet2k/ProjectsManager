"""Utilities supporting scope access control and presentation."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Optional

from models.scope import Scope
from models.scope_github_config import ScopeGitHubConfig
from models.task import Task
from models.user import User
from models.scope_share import ScopeShare, ScopeShareRole, ScopeShareStatus


def _scope_owner_display_name(scope: Scope | None) -> str:
    if scope is None:
        return ""
    owner = getattr(scope, "owner", None)
    if owner is None and getattr(scope, "owner_id", None):
        owner = User.query.get(scope.owner_id)
    if owner is None:
        return ""
    for attr in ("name", "username", "email"):
        value = getattr(owner, attr, None)
        if value:
            return value
    return ""


def generate_default_label(scope_name: str | None) -> str:
    """Generate a default GitHub label from scope name."""
    if not scope_name:
        return "projectsmanager"
    
    # Convert to lowercase and replace spaces/underscores with hyphens
    label = scope_name.lower().strip()
    
    # Replace spaces and underscores with hyphens first
    label = re.sub(r'[\s_]+', '-', label)
    
    # Remove special characters except hyphens
    label = re.sub(r'[^\w-]', '', label)
    
    # Replace multiple hyphens with single hyphen
    label = re.sub(r'-+', '-', label)
    
    # Remove leading/trailing hyphens
    label = label.strip('-')
    
    # Ensure we have something
    if not label:
        return "projectsmanager"
    
    return label


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


@dataclass
class ScopeGitHubState:
    """Aggregate GitHub configuration details for a scope relative to a user."""

    user_config: ScopeGitHubConfig | None
    owner_config: ScopeGitHubConfig | None
    effective_config: ScopeGitHubConfig | None
    linked_to_owner: bool
    detached_from_owner: bool

    @property
    def integration_enabled(self) -> bool:
        config = self.effective_config
        return bool(config and config.github_integration_enabled)


def _iter_scope_configs(scope: Scope | None) -> list[ScopeGitHubConfig]:
    if scope is None:
        return []
    configs = getattr(scope, "github_configs", None)
    if configs is None:
        return []
    # The relationship returns an InstrumentedList which behaves like a list.
    return list(configs)


def _lookup_config(scope: Scope | None, user_id: int | None) -> ScopeGitHubConfig | None:
    if scope is None or user_id is None:
        return None
    for config in _iter_scope_configs(scope):
        if config.user_id == user_id:
            return config
    return ScopeGitHubConfig.query.filter_by(scope_id=scope.id, user_id=user_id).one_or_none()


def get_scope_owner_github_config(scope: Scope | None) -> ScopeGitHubConfig | None:
    if scope is None:
        return None
    return _lookup_config(scope, scope.owner_id)


def ensure_scope_github_config(scope: Scope, user: User) -> ScopeGitHubConfig:
    """Return an existing configuration or create a new one for the user."""

    config = _lookup_config(scope, user.id)
    if config:
        return config
    config = ScopeGitHubConfig(scope=scope, user_id=user.id)
    scope.github_configs.append(config)
    return config


def get_scope_github_config(
    scope: Scope | None,
    user: User | None,
    *,
    fallback_to_owner: bool = False,
) -> ScopeGitHubConfig | None:
    """Return the GitHub configuration for the user and scope if available."""

    if scope is None or user is None:
        return None
    config = _lookup_config(scope, user.id)
    if config:
        return config
    if fallback_to_owner:
        return get_scope_owner_github_config(scope)
    return None


def compute_scope_github_state(scope: Scope | None, user: User | None) -> ScopeGitHubState:
    """Return GitHub configuration state for the supplied scope and user."""

    if scope is None:
        return ScopeGitHubState(None, None, None, False, False)

    owner_config = get_scope_owner_github_config(scope)
    user_config = None
    if user and scope.owner_id == user.id:
        user_config = owner_config
    elif user:
        user_config = _lookup_config(scope, user.id)

    effective_config = user_config or owner_config
    linked = False
    detached = False

    if user_config and owner_config and user_config.user_id != owner_config.user_id:
        detached = bool(user_config.is_detached)
        if user_config.is_linked_to(owner_config):
            linked = True
            effective_config = owner_config

    if effective_config is None:
        effective_config = owner_config or user_config

    return ScopeGitHubState(user_config, owner_config, effective_config, linked, detached)


def _snapshot_repository_configuration(config: ScopeGitHubConfig) -> dict[str, Any]:
    """Return a snapshot of repository-related fields for replication."""

    return {
        "github_repo_id": config.github_repo_id,
        "github_repo_name": config.github_repo_name,
        "github_repo_owner": config.github_repo_owner,
        "github_project_id": config.github_project_id,
        "github_project_name": config.github_project_name,
        "github_milestone_number": config.github_milestone_number,
        "github_milestone_title": config.github_milestone_title,
        "github_label_name": config.github_label_name,
        "github_integration_enabled": config.github_integration_enabled,
    }


def _apply_repository_snapshot(config: ScopeGitHubConfig, snapshot: dict[str, Any]) -> None:
    """Apply a snapshot produced by :func:`_snapshot_repository_configuration`."""

    config.github_repo_id = snapshot.get("github_repo_id")
    config.github_repo_name = snapshot.get("github_repo_name")
    config.github_repo_owner = snapshot.get("github_repo_owner")
    config.github_project_id = snapshot.get("github_project_id")
    config.github_project_name = snapshot.get("github_project_name")
    config.github_milestone_number = snapshot.get("github_milestone_number")
    config.github_milestone_title = snapshot.get("github_milestone_title")
    config.github_label_name = snapshot.get("github_label_name")
    config.github_integration_enabled = snapshot.get("github_integration_enabled")


def detach_shared_repository_configs(scope: Scope, owner_config: ScopeGitHubConfig) -> None:
    """Detach collaborator configs when the owner's integration is disabled."""

    if scope is None or owner_config is None:
        return

    snapshot = _snapshot_repository_configuration(owner_config)

    for config in _iter_scope_configs(scope):
        if config.user_id == owner_config.user_id:
            continue
        if not config.shares_repository_with(owner_config):
            continue
        config.mark_as_detached_from(owner_config)
        _apply_repository_snapshot(config, snapshot)


def propagate_owner_github_configuration(scope: Scope, owner_config: ScopeGitHubConfig) -> None:
    """Synchronize shared repository collaborators with the owner's configuration."""

    if scope is None or owner_config is None:
        return

    has_repository = bool(owner_config.github_repo_owner and owner_config.github_repo_name)

    for config in _iter_scope_configs(scope):
        if config.user_id == owner_config.user_id:
            continue

        if not has_repository or not config.shares_repository_with(owner_config):
            if config.is_shared_repo and config.source_user_id == owner_config.user_id:
                config.clear_shared_flags()
            continue

        config.clone_repository_metadata_from(owner_config)
        config.clone_project_and_label_from(owner_config)
        config.clone_milestone_from(owner_config)
        config.github_integration_enabled = owner_config.github_integration_enabled
        config.mark_as_shared_with(owner_config)


def get_effective_github_label(scope: Scope | None, user: User | None) -> str | None:
    """Get the effective GitHub label for a user and scope."""
    if scope is None or user is None:
        return None
    
    state = compute_scope_github_state(scope, user)
    
    # If user has their own config with a label, use it
    if state.user_config and state.user_config.github_label_name:
        return state.user_config.github_label_name

    # If user shares repository with owner, use owner's label
    if state.linked_to_owner and state.owner_config and state.owner_config.github_label_name:
        return state.owner_config.github_label_name
    
    # If user has a config (even without sharing), use it or generate default
    if state.user_config:
        if state.user_config.github_label_name:
            return state.user_config.github_label_name
        else:
            # Generate default from scope name
            return generate_default_label(scope.name)
    
    # If owner has a config, use it or generate default
    if state.owner_config:
        if state.owner_config.github_label_name:
            return state.owner_config.github_label_name
        else:
            # Generate default from scope name
            return generate_default_label(scope.name)
    
    # Fallback to generated default
    return generate_default_label(scope.name)


def apply_scope_github_state(scope: Scope | None, current_user: User | None) -> ScopeGitHubState:
    """Attach derived GitHub attributes to the supplied scope for presentation."""

    state = compute_scope_github_state(scope, current_user)
    if scope is None:
        return state

    # DEBUG LOGGING: Add logging to track GitHub state decisions
    import logging
    logger = logging.getLogger(__name__)
    
    global_enabled = getattr(current_user, 'github_integration_enabled', False)
    scope_enabled = bool(state.effective_config and state.effective_config.github_integration_enabled)
    has_linked_tasks = any(getattr(task, "github_issue_number", None) for task in (getattr(scope, "tasks", None) or []))
    owner_repo_label = None
    if state.owner_config and state.owner_config.github_repo_owner and state.owner_config.github_repo_name:
        owner_repo_label = f"{state.owner_config.github_repo_owner}/{state.owner_config.github_repo_name}"
    
    logger.debug(f"GitHub state for scope {scope.id}, user {current_user.id}: global_enabled={global_enabled}, scope_enabled={scope_enabled}, has_linked_tasks={has_linked_tasks}, owner_repo_label={owner_repo_label}")

    effective = state.effective_config
    user_config = state.user_config or effective

    scope.github_state = state
    scope.github_config = user_config
    scope.github_owner_config = state.owner_config
    
    # NEW: Compute the effective UI state
    if not global_enabled:
        scope.github_integration_enabled = False
        scope.github_ui_state = "read-only"
        scope.github_ui_message = "GitHub integration disabled globally"
    elif not scope_enabled:
        scope.github_integration_enabled = False
        scope.github_ui_state = "read-only"
        scope.github_ui_message = "GitHub integration disabled for this scope"
    else:
        scope.github_integration_enabled = True
        scope.github_ui_state = "enabled"
        scope.github_ui_message = "GitHub integration enabled"

    if state.integration_enabled and effective:
        scope.github_repo_id = effective.github_repo_id
        scope.github_repo_name = effective.github_repo_name
        scope.github_repo_owner = effective.github_repo_owner
        scope.github_project_id = effective.github_project_id
        scope.github_project_name = effective.github_project_name
    else:
        scope.github_repo_id = None
        scope.github_repo_name = None
        scope.github_repo_owner = None
        scope.github_project_id = None
        scope.github_project_name = None

    milestone_source = state.user_config or effective
    if milestone_source and milestone_source.github_milestone_number and milestone_source.github_milestone_title:
        scope.github_milestone_number = milestone_source.github_milestone_number
        scope.github_milestone_title = milestone_source.github_milestone_title
    else:
        scope.github_milestone_number = None
        scope.github_milestone_title = None

    # Set the GitHub label from user config or effective config
    label_source = state.user_config or effective
    if label_source and label_source.github_label_name:
        scope.github_label_name = label_source.github_label_name
    else:
        scope.github_label_name = None

    owner_display_name = _scope_owner_display_name(scope)
    if not owner_display_name:
        owner_display_name = getattr(scope, "owner_name", "") or (
            f"User {scope.owner_id}" if getattr(scope, "owner_id", None) else ""
        )
    scope.owner_display_name = owner_display_name
    scope.owner_name = owner_display_name

    is_owner = bool(current_user and scope.owner_id == current_user.id)
    scope.is_owner_current_user = is_owner

    shared_locked = bool(state.linked_to_owner and not is_owner)
    scope.github_repository_locked = shared_locked
    scope.github_project_locked = shared_locked
    scope.github_label_locked = shared_locked
    scope.github_detached = bool(state.detached_from_owner and not is_owner)
    if scope.github_detached:
        scope.github_detached_message = (
            "You are now independently managing this repository since the owner's integration is disabled."
        )
    else:
        scope.github_detached_message = ""

    has_linked_tasks = any(getattr(task, "github_issue_number", None) for task in (getattr(scope, "tasks", None) or []))
    scope.has_github_linked_tasks = has_linked_tasks

    owner_repo_label = None
    if state.owner_config and state.owner_config.github_repo_owner and state.owner_config.github_repo_name:
        owner_repo_label = f"{state.owner_config.github_repo_owner}/{state.owner_config.github_repo_name}"

    user_repo_label = None
    user_integration_enabled = bool(state.user_config and state.user_config.github_integration_enabled)
    if state.user_config and state.user_config.github_repo_owner and state.user_config.github_repo_name:
        user_repo_label = f"{state.user_config.github_repo_owner}/{state.user_config.github_repo_name}"

    scope.owner_repository_label = owner_repo_label or ""
    scope.user_repository_label = user_repo_label or ""

    if owner_repo_label:
        owner_repo_message = f"Owner repository: {owner_repo_label}"
    else:
        owner_repo_message = "Owner repository: Not configured."
    scope.owner_repository_message = owner_repo_message

    show_owner_repo_line = bool(
        not is_owner
        and (
            has_linked_tasks
            or owner_repo_label
            or user_integration_enabled
        )
    )
    scope.show_owner_repository_line = show_owner_repo_line

    repo_differs = False
    if not is_owner and user_integration_enabled and user_repo_label and owner_repo_label:
        repo_differs = user_repo_label != owner_repo_label

    # Set appropriate icon and tooltip based on state
    if scope.github_ui_state == "read-only":
        scope.github_badge_icon = "bi bi-eye-slash"
        scope.github_badge_tooltip = scope.github_ui_message
    elif scope.github_ui_state == "enabled":
        # Existing logic for repo differentiation
        is_owner = bool(current_user and scope.owner_id == current_user.id)
        repo_differs = False
        user_repo_label = None
        if state.user_config and state.user_config.github_repo_owner and state.user_config.github_repo_name:
            user_repo_label = f"{state.user_config.github_repo_owner}/{state.user_config.github_repo_name}"
        
        if not is_owner and user_repo_label and owner_repo_label:
            repo_differs = user_repo_label != owner_repo_label
        
        scope.github_badge_icon = "bi bi-pencil" if repo_differs else "bi bi-github"

        if shared_locked and owner_repo_label:
            scope.github_badge_tooltip = f"Managed by owner for shared repository ({owner_repo_label})"
        elif shared_locked:
            scope.github_badge_tooltip = "Managed by owner for shared repository"
        elif user_repo_label:
            scope.github_badge_tooltip = f"Repository: {user_repo_label}"
        elif owner_repo_label:
            scope.github_badge_tooltip = f"Owner repository: {owner_repo_label}"
        else:
            scope.github_badge_tooltip = "GitHub integration enabled"
    else:
        scope.github_badge_icon = "bi bi-github"
        scope.github_badge_tooltip = "No GitHub integration"

    # UI visibility logic - show if there's any GitHub context
    scope.show_github_badge = bool(has_linked_tasks or owner_repo_label or scope.github_integration_enabled)

    scope.show_shared_badge = bool(not is_owner)
    shared_owner_label = owner_display_name or ""
    if scope.show_shared_badge and not shared_owner_label:
        shared_owner_label = "Unknown owner"
    scope.shared_badge_tooltip = (
        f"Owner: {shared_owner_label}" if scope.show_shared_badge else ""
    )

    logger.debug(f"Final GitHub UI state for scope {scope.id}: show_github_badge={scope.show_github_badge}, github_ui_state={scope.github_ui_state}, github_integration_enabled={scope.github_integration_enabled}")

    return state


def validate_github_settings(
    form: Any, *, token_available: bool
) -> tuple[
    bool,
    Optional[dict[str, Any]],
    Optional[dict[str, Any]],
    Optional[dict[str, Any]],
    Optional[str],
]:
    """Validate GitHub integration fields on the given form.

    Returns a tuple of the desired integration state and parsed repository payloads.
    Validation errors are appended directly to the provided form fields.
    """
    enable_integration = bool(getattr(form, "github_enabled").data)
    repo_payload: Optional[dict[str, Any]] = None
    project_payload: Optional[dict[str, Any]] = None
    milestone_payload: Optional[dict[str, Any]] = None
    github_label: Optional[str] = None

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

        # Validate GitHub label
        label_value = (getattr(form, "github_label", None) and getattr(form, "github_label").data) or ""
        label_value = label_value.strip()
        
        if label_value:
            # Validate label format (GitHub labels can contain letters, numbers, hyphens, and underscores)
            if not re.match(r'^[a-zA-Z0-9_-]+$', label_value):
                form.github_label.errors.append(
                    "Label can only contain letters, numbers, hyphens, and underscores."
                )
            elif len(label_value) > 50:
                form.github_label.errors.append(
                    "Label must be 50 characters or fewer."
                )
            else:
                github_label = label_value
        else:
            # If no label provided, we'll generate a default from scope name later
            github_label = None

    return enable_integration, repo_payload, project_payload, milestone_payload, github_label


def build_scope_page_context(
    user: User | None,
    *,
    form: Any,
    show_modal: str | None = None,
) -> dict[str, Any]:
    """Return context payload for the scope management template."""
    scopes = get_user_scopes(user)
    for scope in scopes:
        apply_scope_github_state(scope, user)
    context: dict[str, Any] = {
        "scopes": annotate_scope_sharing(scopes, user),
        "scope_form": form,
        "github_token_present": bool(user.github_token_encrypted) if user else False,
        "scope_form_state": build_scope_form_initial_state(form, user),
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


def build_scope_form_initial_state(form: Any, user: User | None = None) -> dict[str, Any]:
    """Return serializable initial values and errors for the scope form."""
    errors = {key: list(value) for key, value in (form.errors or {}).items()}
    data = {
        "name": getattr(form, "name", None).data or "",
        "description": getattr(form, "description", None).data or "",
        "github_enabled": bool(getattr(form, "github_enabled", None).data),
        "github_repository": getattr(form, "github_repository", None).data or "",
        "github_project": getattr(form, "github_project", None).data or "",
        "github_milestone": getattr(form, "github_milestone", None).data or "",
        "github_label": getattr(form, "github_label", None).data or "",
        # For creating a new scope, the current user is the owner
        "is_owner": True,
        "can_edit_metadata": True,
        "owner_name": "",
        "owner_repository_label": "",
        "show_owner_repository_line": False,
        "github_repository_locked": False,
        "github_project_locked": False,
        "github_label_locked": False,
        "github_detached": False,
        "github_detached_message": "",
    }
    return {"data": data, "errors": errors}


def serialize_scope(scope: Scope, current_user: User | None) -> dict[str, Any]:
    """Return a JSON-serializable representation of a scope for client updates."""
    if scope is None:
        return {}

    state = apply_scope_github_state(scope, current_user)
    is_owner = bool(current_user and scope.owner_id == current_user.id)
    share_state = compute_share_state(scope, current_user)

    form_config = state.user_config or state.effective_config
    project_source = form_config
    milestone_source = state.user_config or state.effective_config

    repo = None
    if form_config and form_config.github_repo_owner and form_config.github_repo_name:
        repo = {
            "id": form_config.github_repo_id,
            "name": form_config.github_repo_name,
            "owner": form_config.github_repo_owner,
            "label": f"{form_config.github_repo_owner}/{form_config.github_repo_name}",
        }

    project = None
    if project_source and project_source.github_project_id and project_source.github_project_name:
        project = {
            "id": str(project_source.github_project_id),
            "name": project_source.github_project_name,
        }

    milestone = None
    if (
        milestone_source
        and milestone_source.github_milestone_number
        and milestone_source.github_milestone_title
    ):
        milestone = {
            "number": milestone_source.github_milestone_number,
            "title": milestone_source.github_milestone_title,
        }

    # Get the label from the effective config
    github_label = None
    if form_config and form_config.github_label_name:
        github_label = form_config.github_label_name

    config_source = "none"
    if state.user_config:
        config_source = "user"
    elif state.effective_config:
        config_source = "owner"

    owner_display = getattr(scope, "owner_display_name", _scope_owner_display_name(scope))
    owner_name_value = "" if is_owner else owner_display

    return {
        "id": scope.id,
        "name": scope.name or "",
        "description": scope.description or "",
        "owner_id": scope.owner_id,
        "is_owner": is_owner,
        "is_shared": share_state.get("shared_with_current_user", not is_owner),
        "github_integration_enabled": state.integration_enabled,
        "github_repository": repo,
        "github_project": project,
        "github_milestone": milestone,
        "github_label": github_label,
        "github_repository_locked": bool(getattr(scope, "github_repository_locked", False)),
        "github_project_locked": bool(getattr(scope, "github_project_locked", False)),
        "github_label_locked": bool(getattr(scope, "github_label_locked", False)),
        "github_detached": bool(getattr(scope, "github_detached", False)),
        "github_detached_message": getattr(scope, "github_detached_message", ""),
        "owner_name": owner_name_value,
        "owner_display_name": getattr(scope, "owner_display_name", owner_name_value),
        "show_github_badge": bool(getattr(scope, "show_github_badge", False)),
        "github_badge_icon": getattr(scope, "github_badge_icon", "bi bi-github"),
        "has_github_linked_tasks": bool(getattr(scope, "has_github_linked_tasks", False)),
        "show_shared_badge": bool(getattr(scope, "show_shared_badge", False)),
        "shared_badge_tooltip": getattr(scope, "shared_badge_tooltip", ""),
        "github_config_source": config_source,
        "github_config_user_id": state.user_config.user_id if state.user_config else None,
        "github_config_owner_id": state.owner_config.user_id if state.owner_config else None,
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
