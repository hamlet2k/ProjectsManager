"""Notification management routes."""
from __future__ import annotations

from flask import Blueprint, abort, g, jsonify, render_template, request
from flask_wtf.csrf import generate_csrf, validate_csrf
from sqlalchemy.exc import SQLAlchemyError
from wtforms.validators import ValidationError

from database import db
from services.notification_service import (
    accept_share_invitation,
    build_notifications_summary,
    load_notification,
    reject_share_invitation,
    scope_payload_from_share,
    serialize_notification,
    share_payload_for_user,
)

notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")


def _validate_request_csrf(token: str | None) -> tuple[bool, str | None]:
    """Validate CSRF tokens supplied with JSON payloads."""

    if not token:
        return False, "The CSRF token is missing."
    try:
        validate_csrf(token)
    except ValidationError:
        return False, "The CSRF token is invalid or has expired. Please refresh and try again."
    except Exception:
        return False, "The CSRF token is invalid."
    return True, None


def _json_error(message: str, *, status: int = 400):
    """Return a JSON error response with a refreshed CSRF token."""

    return (
        jsonify(
            {
                "success": False,
                "message": message,
                "csrf_token": generate_csrf(),
            }
        ),
        status,
    )


@notifications_bp.route("/", methods=["GET"])
def list_notifications():
    """Render the notifications page."""

    if g.user is None:
        abort(401)
    summary = build_notifications_summary(g.user)
    return render_template(
        "notifications.html",
        notifications=summary.get("recent", []),
        pending=summary.get("pending", []),
        pending_count=summary.get("pending_count", 0),
        csrf_token=summary.get("csrf_token"),
    )


@notifications_bp.route("/list", methods=["GET"])
def list_notifications_json():
    """Return pending and recent notifications for the current user."""

    if g.user is None:
        return _json_error("Authentication required.", status=401)
    summary = build_notifications_summary(g.user)
    return jsonify(
        {
            "success": True,
            "pending": summary.get("pending", []),
            "recent": summary.get("recent", []),
            "pending_count": summary.get("pending_count", 0),
            "csrf_token": summary.get("csrf_token"),
        }
    )


def _handle_notification_action(notification_id: int, action):
    if g.user is None:
        return _json_error("Authentication required.", status=401)

    payload = request.get_json(silent=True) or {}
    csrf_valid, csrf_message = _validate_request_csrf(payload.get("csrf_token"))
    if not csrf_valid:
        return _json_error(csrf_message or "Invalid CSRF token.")

    try:
        notification = load_notification(notification_id, g.user)
    except PermissionError:
        return _json_error("You do not have access to that notification.", status=403)

    try:
        if action == "accept":
            share = accept_share_invitation(notification, g.user)
            message = "Invitation accepted."
        else:
            share = reject_share_invitation(notification, g.user)
            message = "Invitation rejected."
    except PermissionError as exc:
        return _json_error(str(exc), status=403)
    except LookupError as exc:
        return _json_error(str(exc) or "That invitation is no longer available.", status=404)
    except ValueError as exc:
        return _json_error(str(exc) or "Unable to process this notification.")

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return _json_error("Unable to update the notification. Please try again.", status=500)

    summary = build_notifications_summary(g.user)
    response_payload = {
        "success": True,
        "message": message,
        "notification": serialize_notification(notification),
        "scope": scope_payload_from_share(share, g.user),
        "share": share_payload_for_user(share, g.user),
        "pending": summary.get("pending", []),
        "pending_count": summary.get("pending_count", 0),
        "recent": summary.get("recent", []),
        "csrf_token": summary.get("csrf_token"),
    }
    return jsonify(response_payload)


@notifications_bp.route("/<int:notification_id>/accept", methods=["POST"])
def accept_notification(notification_id: int):
    """Accept a scope sharing invitation."""

    return _handle_notification_action(notification_id, "accept")


@notifications_bp.route("/<int:notification_id>/reject", methods=["POST"])
def reject_notification(notification_id: int):
    """Reject a scope sharing invitation."""

    return _handle_notification_action(notification_id, "reject")
