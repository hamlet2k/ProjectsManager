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
from urllib.parse import urlparse
def safe_redirect(referrer, fallback_endpoint):
    """Redirect to referrer if it's a safe internal (relative) URL, otherwise to fallback endpoint."""
    if not referrer:
        return redirect(url_for(fallback_endpoint))
    sanitized_referrer = referrer.replace('\\', '')
    test_url = urlparse(sanitized_referrer)
    if not test_url.scheme and not test_url.netloc:
        return redirect(sanitized_referrer)
    return redirect(url_for(fallback_endpoint))

from database import db
from forms import ScopeForm
from models.scope import Scope
from services.scope_service import (
    build_scope_page_context,
    get_next_scope_rank,
    get_user_github_token,
    serialize_scope,
    serialize_task_for_clipboard,
    user_can_access_scope,
    user_owns_scope,
    validate_github_settings,
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
            enable_integration, repo_payload = validate_github_settings(
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
            else:
                scope.github_repo_id = None
                scope.github_repo_name = None
                scope.github_repo_owner = None

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
        is_valid = form.validate_on_submit()

    if request.method == "POST":
        if is_valid:
            enable_integration, repo_payload = validate_github_settings(
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
            else:
                scope.github_repo_id = None
                scope.github_repo_name = None
                scope.github_repo_owner = None

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
