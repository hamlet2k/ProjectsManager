"""Scope management blueprint."""
from __future__ import annotations

import json

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
from sqlalchemy.exc import SQLAlchemyError

from database import db
from forms import ScopeForm
from models.scope import Scope
from services.scope_service import (
    build_scope_page_context,
    get_next_scope_rank,
    get_user_github_token,
    serialize_task_for_clipboard,
    user_can_access_scope,
    user_owns_scope,
    validate_github_settings,
)

scopes_bp = Blueprint("scopes", __name__, url_prefix="/scope")


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

    form = ScopeForm()
    show_modal = "scope-modal" if request.method == "GET" else None

    if form.validate_on_submit():
        enable_integration, repo_payload = validate_github_settings(
            form, token_available=bool(get_user_github_token(g.user))
        )

        if form.errors:
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
            flash("Scope added!", "success")
            return redirect(request.referrer or url_for("scopes.list_scopes"))
        except SQLAlchemyError as exc:
            db.session.rollback()
            flash(f"An error occurred: {exc}", "error")
            return redirect(request.referrer or url_for("scopes.list_scopes"))

    context = build_scope_page_context(g.user, form=form, show_modal=show_modal or None)
    return render_template("scope.html", **context)


@scopes_bp.route("/edit/<int:scope_id>", methods=["GET", "POST"])
def edit_scope(scope_id: int):
    scope = Scope.query.get_or_404(scope_id)
    if not user_owns_scope(g.user, scope):
        abort(404)

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

    if form.validate_on_submit():
        enable_integration, repo_payload = validate_github_settings(
            form, token_available=bool(get_user_github_token(g.user))
        )

        if form.errors:
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
            flash("Scope edited!", "success")
            return redirect(request.referrer or url_for("scopes.list_scopes"))
        except SQLAlchemyError as exc:
            db.session.rollback()
            flash(f"An error occurred: {exc}", "error")
            return redirect(request.referrer or url_for("scopes.list_scopes"))

    context = build_scope_page_context(g.user, form=form, show_modal="scope-modal")
    return render_template("scope.html", **context)
