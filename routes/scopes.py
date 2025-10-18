"""Scope management blueprint."""
from __future__ import annotations

import json
from typing import Any, Dict

from flask import (
    Blueprint,
    abort,
    flash,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from flask_wtf.csrf import generate_csrf, validate_csrf
from sqlalchemy.exc import SQLAlchemyError
from wtforms.validators import ValidationError

from routes import safe_redirect, validate_request_csrf

from database import db
from forms import ScopeForm
from models.scope import Scope
from models.notification import NotificationStatus
from models.scope_share import ScopeShare, ScopeShareRole, ScopeShareStatus
from models.user import User
from services.scope_service import (
    build_scope_page_context,
    get_next_scope_rank,
    get_scope_share,
    get_user_github_token,
    serialize_scope,
    serialize_shares,
    serialize_task_for_clipboard,
    user_can_access_scope,
    user_owns_scope,
    validate_github_settings,
)
from services.notification_service import (
    create_scope_share_invite_notification,
    create_scope_share_response_notification,
    resolve_invite_notifications,
)

scopes_bp = Blueprint("scopes", __name__, url_prefix="/scope")


def _wants_json_response() -> bool:
    """Return True when the current request expects a JSON response."""
    accept = request.accept_mimetypes
    return (
        request.is_json
        or request.headers.get("X-Requested-With", "").lower() == "xmlhttprequest"
        or accept.best == "application/json"
        or accept["application/json"] >= accept["text/html"]
    )


def _is_truthy(value: Any) -> bool:
    """Return True when the provided value represents an enabled boolean."""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
    return False


def _populate_form_from_payload(form: ScopeForm, payload: Dict[str, Any]) -> None:
    """Populate the form with normalized JSON payload data."""
    normalized = {
        "name": (payload.get("name") or "").strip(),
        "description": payload.get("description") or "",
        "github_enabled": _is_truthy(payload.get("github_enabled")),
        "github_repository": payload.get("github_repository") or "",
        "github_project": payload.get("github_project") or "",
        "github_milestone": payload.get("github_milestone") or "",
    }
    form.process(data=normalized)


def _collect_form_values(form: ScopeForm) -> Dict[str, Any]:
    """Return the current values from the scope form."""
    github_field = getattr(form, "github_enabled", None)
    return {
        "name": form.name.data or "",
        "description": form.description.data or "",
        "github_enabled": bool(github_field.data) if github_field is not None else False,
        "github_repository": form.github_repository.data or "",
        "github_project": form.github_project.data or "",
        "github_milestone": form.github_milestone.data or "",
    }


def _validate_csrf_token(form: ScopeForm, token: str | None) -> bool:
    """Validate a CSRF token for JSON submissions."""
    message: str | None = None
    if not token:
        message = "The CSRF token is missing."
    else:
        try:
            validate_csrf(token)
        except ValidationError as exc:
            # Optionally log exc, but do not expose details to the user
            message = "The CSRF token is invalid or has expired. Please refresh and try again."
        except Exception:
            message = "The CSRF token is invalid."
    if message:
        field = getattr(form, "csrf_token", None)
        if field is not None:
            field.errors.append(message)
        form.errors.setdefault("csrf_token", []).append(message)
        return False
    return True


def _csrf_token_value() -> str:
    """Return a fresh CSRF token for subsequent submissions."""
    return generate_csrf()


def _scope_payload(scope: Scope) -> Dict[str, Any]:
    """Return serialized scope data augmented with related URLs."""
    payload = serialize_scope(scope, g.user)
    payload["urls"] = {
        "set": url_for("scopes.set_scope", scope_id=scope.id),
        "export": url_for("scopes.export_scope_tasks", scope_id=scope.id),
    }
    if user_owns_scope(g.user, scope):
        payload["urls"].update(
            {
                "edit": url_for("scopes.edit_scope", scope_id=scope.id),
                "delete": url_for("delete_item", item_type="scope", id=scope.id),
            }
        )
    return payload


def _json_form_error(form: ScopeForm, message: str | None = None, status: int = 400):
    """Return a JSON response detailing form errors."""
    effective_message = message or "Please correct the highlighted fields."
    csrf_errors = form.errors.get("csrf_token") if hasattr(form, "errors") else None
    if csrf_errors:
        effective_message = csrf_errors[0]
    return (
        jsonify(
            {
                "success": False,
                "message": effective_message,
                "errors": form.errors,
                "values": _collect_form_values(form),
                "csrf_token": _csrf_token_value(),
            }
        ),
        status,
    )


def _json_scope_success(scope: Scope, message: str, status: int = 200):
    """Return a JSON response with serialized scope data."""
    return (
        jsonify(
            {
                "success": True,
                "message": message,
                "scope": _scope_payload(scope),
                "csrf_token": _csrf_token_value(),
            }
        ),
        status,
    )


def _share_collection(scope: Scope) -> list[dict[str, Any]]:
    """Return serialized share entries for the provided scope."""

    visible_shares = [
        share
        for share in scope.shares
        if share.status_enum != ScopeShareStatus.REVOKED
    ]
    return serialize_shares(visible_shares, g.user)


def _share_success_response(scope: Scope, message: str, status: int = 200):
    """Return a consistent success payload for share operations."""

    return (
        jsonify(
            {
                "success": True,
                "message": message,
                "scope": serialize_scope(scope, g.user),
                "shares": _share_collection(scope),
                "csrf_token": _csrf_token_value(),
            }
        ),
        status,
    )


def _share_error_response(message: str, *, status: int = 400):
    """Return an error payload for share requests."""

    return (
        jsonify(
            {
                "success": False,
                "message": message,
                "csrf_token": _csrf_token_value(),
            }
        ),
        status,
    )


@scopes_bp.route("/<int:scope_id>")
def set_scope(scope_id: int):
    scope = Scope.query.get_or_404(scope_id)
    if not user_can_access_scope(g.user, scope):
        flash("You do not have access to that scope.", "danger")
        return redirect(url_for("scopes.list_scopes"))
    session["selected_scope"] = scope_id
    return redirect(url_for("task"))


@scopes_bp.route("/", strict_slashes=False)
def list_scopes():
    session.pop("selected_scope", None)
    g.scope = None
    form = ScopeForm()
    context = build_scope_page_context(g.user, form=form)
    return render_template("scope.html", **context)


@scopes_bp.route("/<int:scope_id>/shares", methods=["GET"])
def get_scope_shares(scope_id: int):
    """Return sharing information for the requested scope."""

    scope = Scope.query.get_or_404(scope_id)
    if not user_owns_scope(g.user, scope):
        return _share_error_response("You do not have permission to manage sharing for this scope.", status=403)
    return _share_success_response(scope, "Sharing settings loaded.")


@scopes_bp.route("/<int:scope_id>/share", methods=["POST"])
def share_scope(scope_id: int):
    """Add or update a share entry for the supplied scope."""

    scope = Scope.query.get_or_404(scope_id)
    if not user_owns_scope(g.user, scope):
        return _share_error_response("Only the scope owner can share it with others.", status=403)

    payload = request.get_json(silent=True) or {}
    csrf_valid, csrf_message = validate_request_csrf(payload.get("csrf_token"))
    if not csrf_valid:
        return _share_error_response(csrf_message or "Invalid CSRF token.", status=400)

    identifier = (payload.get("identifier") or "").strip()
    role_value = (payload.get("role") or ScopeShareRole.EDITOR.value).strip().lower()
    try:
        role_enum = ScopeShareRole(role_value)
    except ValueError:
        role_enum = ScopeShareRole.EDITOR

    if not identifier:
        return _share_error_response("A username or email is required to share this scope.")

    target = (
        User.query.filter_by(username=identifier).first()
        or User.query.filter_by(email=identifier).first()
    )
    if not target:
        return _share_error_response("No user was found with that username or email address.", status=404)
    if target.id == g.user.id:
        return _share_error_response("You already own this scope.")

    existing = get_scope_share(scope, target)
    message: str
    notification_created = False

    if existing:
        existing.role_enum = role_enum
        existing.inviter_id = g.user.id
        if existing.status_enum in {ScopeShareStatus.REJECTED, ScopeShareStatus.REVOKED}:
            existing.mark_pending()
            db.session.flush()
            create_scope_share_invite_notification(existing, resend=True)
            notification_created = True
            message = f"Invitation resent to {target.username}."
        elif existing.status_enum == ScopeShareStatus.PENDING:
            message = f"Updated invitation for {target.username}."
        else:
            message = f"Updated access for {target.username}."
        share = existing
    else:
        share = ScopeShare(
            scope=scope,
            user=target,
            inviter=g.user,
        )
        share.role_enum = role_enum
        share.mark_pending()
        db.session.add(share)
        db.session.flush()
        create_scope_share_invite_notification(share)
        notification_created = True
        message = f"Invitation sent to {target.username}."

    try:
        if not notification_created:
            db.session.flush()
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _share_error_response("Unable to update sharing settings. Please try again.", status=500)

    return _share_success_response(scope, message)


@scopes_bp.route("/<int:scope_id>/share/<int:share_id>", methods=["DELETE"])
def revoke_scope_share(scope_id: int, share_id: int):
    """Revoke access for a collaborator."""

    scope = Scope.query.get_or_404(scope_id)
    if not user_owns_scope(g.user, scope):
        return _share_error_response("You do not have permission to revoke sharing for this scope.", status=403)

    payload = request.get_json(silent=True) or {}
    csrf_valid, csrf_message = validate_request_csrf(payload.get("csrf_token"))
    if not csrf_valid:
        return _share_error_response(csrf_message or "Invalid CSRF token.", status=400)

    share = ScopeShare.query.get_or_404(share_id)
    if share.scope_id != scope.id:
        return _share_error_response("That share entry does not belong to this scope.", status=404)
    if share.status_enum == ScopeShareStatus.REVOKED:
        return _share_success_response(scope, "Share already revoked.")

    share.mark_revoked()
    resolve_invite_notifications(share, NotificationStatus.REJECTED)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _share_error_response("Unable to revoke access. Please try again.", status=500)

    return _share_success_response(scope, "Access revoked.")


@scopes_bp.route("/<int:scope_id>/share/<int:share_id>/resend", methods=["POST"])
def resend_scope_share(scope_id: int, share_id: int):
    """Resend an invitation to a collaborator."""

    scope = Scope.query.get_or_404(scope_id)
    if not user_owns_scope(g.user, scope):
        return _share_error_response("You do not have permission to manage sharing for this scope.", status=403)

    payload = request.get_json(silent=True) or {}
    csrf_valid, csrf_message = validate_request_csrf(payload.get("csrf_token"))
    if not csrf_valid:
        return _share_error_response(csrf_message or "Invalid CSRF token.")

    share = ScopeShare.query.get_or_404(share_id)
    if share.scope_id != scope.id:
        return _share_error_response("That share entry does not belong to this scope.", status=404)
    if share.status_enum == ScopeShareStatus.ACCEPTED:
        return _share_error_response("That collaborator already has access to this scope.")

    share.mark_pending()
    share.inviter_id = g.user.id
    db.session.flush()
    create_scope_share_invite_notification(share, resend=True)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _share_error_response("Unable to resend the invitation. Please try again.", status=500)

    collaborator_name = share.user.username if share.user else "collaborator"
    return _share_success_response(scope, f"Invitation resent to {collaborator_name}.")


@scopes_bp.route("/<int:scope_id>/share/self", methods=["DELETE"])
def reject_scope_share(scope_id: int):
    """Allow a collaborator to reject or leave a shared scope."""

    scope = Scope.query.get_or_404(scope_id)
    if g.user is None:
        return _share_error_response("Authentication required.", status=401)
    if scope.owner_id == g.user.id:
        return _share_error_response("Scope owners cannot leave their own scopes.")

    payload = request.get_json(silent=True) or {}
    csrf_valid, csrf_message = validate_request_csrf(payload.get("csrf_token"))
    if not csrf_valid:
        return _share_error_response(csrf_message or "Invalid CSRF token.", status=400)

    share = get_scope_share(scope, g.user)
    if not share or not share.is_active:
        return _share_error_response("You do not have access to this scope.", status=404)

    share.mark_rejected()
    resolve_invite_notifications(share, NotificationStatus.REJECTED)
    create_scope_share_response_notification(share, status=NotificationStatus.REJECTED, actor=g.user)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _share_error_response("Unable to update sharing settings. Please try again.", status=500)

    response = {
        "success": True,
        "message": "You have left the scope.",
        "removed": True,
        "scope_id": scope.id,
        "csrf_token": _csrf_token_value(),
    }
    return jsonify(response)


@scopes_bp.route("/<int:scope_id>/tasks/export", methods=["GET"])
def export_scope_tasks(scope_id: int):
    scope = Scope.query.get_or_404(scope_id)
    if not user_can_access_scope(g.user, scope):
        return (
            jsonify(
                {
                    "success": False,
                    "message": "You do not have permission to export tasks for this scope.",
                }
            ),
            403,
        )

    if g.user is None:
        return (
            jsonify({"success": False, "message": "You must be logged in to export tasks."}),
            401,
        )

    user_tasks = [task for task in scope.tasks if task.owner_id == g.user.id]
    user_tasks.sort(key=lambda item: ((item.rank or 0), item.id))

    payload = [serialize_task_for_clipboard(task) for task in user_tasks]

    return jsonify(
        {
            "success": True,
            "scope": {"id": scope.id, "name": scope.name or ""},
            "tasks": payload,
        }
    )


@scopes_bp.route("/add", methods=["GET", "POST"])
def add_scope():
    if g.user is None:
        abort(403)

    wants_json = _wants_json_response()

    if request.method == "POST" and request.is_json:
        payload = request.get_json(silent=True) or {}
        form = ScopeForm(meta={"csrf": False})
        _populate_form_from_payload(form, payload)
        is_valid = form.validate()
        csrf_valid = _validate_csrf_token(form, payload.get("csrf_token"))
        is_valid = is_valid and csrf_valid
    else:
        form = ScopeForm()
        is_valid = form.validate_on_submit()

    if request.method == "POST":
        if is_valid:
            (
                enable_integration,
                repo_payload,
                project_payload,
                milestone_payload,
            ) = validate_github_settings(
                form, token_available=bool(get_user_github_token(g.user))
            )

            if form.errors:
                if wants_json:
                    return _json_form_error(form)
                context = build_scope_page_context(g.user, form=form, show_modal="scope-modal")
                return render_template("scope.html", **context)

            scope = Scope()
            scope.owner_id = g.user.id
            scope.rank = get_next_scope_rank()
            scope.name = form.name.data
            scope.description = form.description.data
            scope.github_integration_enabled = enable_integration

            if enable_integration and repo_payload:
                scope.github_repo_id = repo_payload.get("id")
                scope.github_repo_name = repo_payload.get("name")
                scope.github_repo_owner = repo_payload.get("owner")
                if project_payload:
                    project_id = project_payload.get("id")
                    scope.github_project_id = str(project_id) if project_id else None
                    scope.github_project_name = project_payload.get("name")
                else:
                    scope.github_project_id = None
                    scope.github_project_name = None
                if milestone_payload:
                    scope.github_milestone_number = milestone_payload.get("number")
                    scope.github_milestone_title = milestone_payload.get("title")
                else:
                    scope.github_milestone_number = None
                    scope.github_milestone_title = None
            else:
                scope.github_repo_id = None
                scope.github_repo_name = None
                scope.github_repo_owner = None
                scope.github_project_id = None
                scope.github_project_name = None
                scope.github_milestone_number = None
                scope.github_milestone_title = None

            try:
                db.session.add(scope)
                db.session.commit()
            except SQLAlchemyError as exc:
                db.session.rollback()
                error_message = "An error occurred while creating the scope."
                if wants_json:
                    return jsonify({"success": False, "message": error_message}), 500
                flash(error_message, "error")
                return safe_redirect(request.referrer, "scopes.list_scopes")

            success_message = "Scope added!"
            if wants_json:
                return _json_scope_success(scope, success_message, status=201)
            flash(success_message, "success")
            return safe_redirect(request.referrer, "scopes.list_scopes")

        if wants_json:
            return _json_form_error(form)
        context = build_scope_page_context(g.user, form=form, show_modal="scope-modal")
        return render_template("scope.html", **context)

    show_modal = "scope-modal" if request.method == "GET" else None
    context = build_scope_page_context(g.user, form=form, show_modal=show_modal)
    return render_template("scope.html", **context)


@scopes_bp.route("/edit/<int:scope_id>", methods=["GET", "POST"])
def edit_scope(scope_id: int):
    scope = Scope.query.get_or_404(scope_id)
    wants_json = _wants_json_response()
    if not user_owns_scope(g.user, scope):
        if wants_json:
            return jsonify({"success": False, "message": "You do not have permission to edit this scope."}), 403
        abort(404)

    if request.method == "POST" and request.is_json:
        payload = request.get_json(silent=True) or {}
        form = ScopeForm(meta={"csrf": False})
        _populate_form_from_payload(form, payload)
        is_valid = form.validate()
        csrf_valid = _validate_csrf_token(form, payload.get("csrf_token"))
        is_valid = is_valid and csrf_valid
    else:
        form = ScopeForm(obj=scope)
        if not form.is_submitted():
            form.github_enabled.data = scope.github_integration_enabled
            if scope.github_repo_owner and scope.github_repo_name:
                form.github_repository.data = json.dumps(
                    {
                        "id": scope.github_repo_id,
                        "name": scope.github_repo_name,
                        "owner": scope.github_repo_owner,
                    }
                )
            if scope.github_project_id and scope.github_project_name:
                form.github_project.data = json.dumps(
                    {
                        "id": scope.github_project_id,
                        "name": scope.github_project_name,
                    }
                )
            if scope.github_milestone_number and scope.github_milestone_title:
                form.github_milestone.data = json.dumps(
                    {
                        "number": scope.github_milestone_number,
                        "title": scope.github_milestone_title,
                    }
                )
        is_valid = form.validate_on_submit()

    if request.method == "POST":
        if is_valid:
            (
                enable_integration,
                repo_payload,
                project_payload,
                milestone_payload,
            ) = validate_github_settings(
                form, token_available=bool(get_user_github_token(g.user))
            )

            if form.errors:
                if wants_json:
                    return _json_form_error(form)
                context = build_scope_page_context(g.user, form=form, show_modal="scope-modal")
                return render_template("scope.html", **context)

            scope.name = form.name.data
            scope.description = form.description.data
            scope.github_integration_enabled = enable_integration

            if enable_integration and repo_payload:
                scope.github_repo_id = repo_payload.get("id")
                scope.github_repo_name = repo_payload.get("name")
                scope.github_repo_owner = repo_payload.get("owner")
                if project_payload:
                    project_id = project_payload.get("id")
                    scope.github_project_id = str(project_id) if project_id else None
                    scope.github_project_name = project_payload.get("name")
                else:
                    scope.github_project_id = None
                    scope.github_project_name = None
                if milestone_payload:
                    scope.github_milestone_number = milestone_payload.get("number")
                    scope.github_milestone_title = milestone_payload.get("title")
                else:
                    scope.github_milestone_number = None
                    scope.github_milestone_title = None
            else:
                scope.github_repo_id = None
                scope.github_repo_name = None
                scope.github_repo_owner = None
                scope.github_project_id = None
                scope.github_project_name = None
                scope.github_milestone_number = None
                scope.github_milestone_title = None

            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()
                error_message = "An error occurred while updating the scope."
                if wants_json:
                    return jsonify({"success": False, "message": error_message}), 500
                flash(error_message, "error")
                return safe_redirect(request.referrer, "scopes.list_scopes")

            success_message = "Scope edited!"
            if wants_json:
                return _json_scope_success(scope, success_message)
            flash(success_message, "success")
            return safe_redirect(request.referrer, "scopes.list_scopes")

        if wants_json:
            return _json_form_error(form)
        context = build_scope_page_context(g.user, form=form, show_modal="scope-modal")
        return render_template("scope.html", **context)

    context = build_scope_page_context(g.user, form=form, show_modal="scope-modal")
    return render_template("scope.html", **context)
