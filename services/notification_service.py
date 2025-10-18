"""Utilities for creating and presenting user notifications."""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

from flask_wtf.csrf import generate_csrf

from database import db
from models.notification import Notification, NotificationStatus, NotificationType
from models.scope_share import ScopeShare, ScopeShareStatus
from models.user import User
from services.scope_service import serialize_scope, serialize_share


def _notification_title_for_invite(share: ScopeShare) -> str:
    scope_name = share.scope.name if share.scope else "a scope"
    owner_name = share.scope.scope_owner.name if share.scope and share.scope.scope_owner else "A collaborator"
    return f"{owner_name} shared '{scope_name}' with you"


def _notification_message_for_invite(share: ScopeShare) -> str:
    scope_name = share.scope.name if share.scope else "a scope"
    owner_name = share.scope.scope_owner.name if share.scope and share.scope.scope_owner else "A collaborator"
    return (
        f"{owner_name} invited you to collaborate on the scope '{scope_name}'. "
        "Accept to gain access or reject to decline."
    )


def _notification_title_for_response(share: ScopeShare, status: NotificationStatus) -> str:
    scope_name = share.scope.name if share.scope else "your scope"
    collaborator = share.user.name if share.user and share.user.name else share.user.username if share.user else "A collaborator"
    verb = "accepted" if status == NotificationStatus.ACCEPTED else "rejected"
    return f"{collaborator} {verb} your invitation to '{scope_name}'"


def _notification_message_for_response(share: ScopeShare, status: NotificationStatus) -> str:
    collaborator = share.user.name if share.user and share.user.name else share.user.username if share.user else "A collaborator"
    if status == NotificationStatus.ACCEPTED:
        return f"{collaborator} accepted your scope sharing invitation."
    return f"{collaborator} declined access to the scope."


def create_scope_share_invite_notification(share: ScopeShare, *, resend: bool = False) -> Notification:
    """Create a notification prompting the collaborator to respond to an invitation."""

    notification = Notification(
        user_id=share.user_id,
        scope_id=share.scope_id,
        share_id=share.id,
        notification_type=NotificationType.SCOPE_SHARE_INVITE.value,
        title=_notification_title_for_invite(share),
        message=_notification_message_for_invite(share),
        status=NotificationStatus.PENDING.value,
        requires_action=True,
        payload={
            "resend": resend,
            "scope_name": share.scope.name if share.scope else None,
            "owner_name": share.scope.scope_owner.name if share.scope and share.scope.scope_owner else None,
        },
    )
    db.session.add(notification)
    return notification


def create_scope_share_response_notification(
    share: ScopeShare, *, status: NotificationStatus, actor: User | None
) -> Notification | None:
    """Notify the scope owner about a collaborator's decision."""

    scope = share.scope
    if scope is None or scope.owner_id is None:
        return None
    if scope.owner_id == share.user_id:
        return None
    owner_id = scope.owner_id
    notification = Notification(
        user_id=owner_id,
        scope_id=share.scope_id,
        share_id=share.id,
        notification_type=NotificationType.SCOPE_SHARE_RESPONSE.value,
        title=_notification_title_for_response(share, status),
        message=_notification_message_for_response(share, status),
        status=status.value,
        requires_action=False,
        payload={
            "actor_id": actor.id if actor else share.user_id,
            "actor_name": actor.name if actor and actor.name else share.user.name if share.user else None,
        },
    )
    db.session.add(notification)
    return notification


def resolve_invite_notifications(share: ScopeShare, status: NotificationStatus) -> None:
    """Mark outstanding invite notifications for the share as resolved."""

    for notification in share.notifications:
        if notification.type_enum == NotificationType.SCOPE_SHARE_INVITE and not notification.is_resolved:
            notification.resolve(status)


def get_pending_notifications(user: User | None) -> list[Notification]:
    """Return actionable notifications for the user."""

    if not user:
        return []
    return (
        Notification.query.filter_by(user_id=user.id, requires_action=True, status=NotificationStatus.PENDING.value)
        .order_by(Notification.created_at.desc())
        .all()
    )


def get_recent_notifications(user: User | None, *, limit: int = 10) -> list[Notification]:
    """Return recent notifications for the user."""

    if not user:
        return []
    return (
        Notification.query.filter_by(user_id=user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def _format_notification_timestamp(value: datetime | None) -> str | None:
    """Return a human-friendly timestamp for notification display."""

    if value is None:
        return None
    month = value.strftime("%b")
    day = value.day
    year = value.year
    hour = value.hour % 12 or 12
    minute = value.minute
    meridiem = "AM" if value.hour < 12 else "PM"
    return f"{month} {day}, {year} at {hour}:{minute:02d} {meridiem}"


def serialize_notification(notification: Notification) -> dict[str, object]:
    """Serialize a notification for API responses."""

    payload = notification.to_dict()
    payload["created_display"] = _format_notification_timestamp(notification.created_at)
    payload["status_label"] = notification.status.replace("_", " ").title()
    payload["action_required"] = notification.requires_action and notification.status_enum == NotificationStatus.PENDING
    badge_map = {
        NotificationStatus.PENDING.value: "text-bg-warning",
        NotificationStatus.ACCEPTED.value: "text-bg-success",
        NotificationStatus.REJECTED.value: "text-bg-danger",
        NotificationStatus.READ.value: "text-bg-secondary",
    }
    payload["status_badge"] = badge_map.get(notification.status, "text-bg-secondary")
    return payload


def serialize_notifications(notifications: Iterable[Notification]) -> list[dict[str, object]]:
    """Serialize an iterable of notifications."""

    return [serialize_notification(notification) for notification in notifications]


def build_notifications_summary(user: User | None) -> dict[str, object]:
    """Return aggregated notification data for template rendering."""

    pending = get_pending_notifications(user)
    pending_ids = {note.id for note in pending}
    recent_candidates = get_recent_notifications(user)
    recent = [
        note
        for note in recent_candidates
        if note.id not in pending_ids
        and not (note.requires_action and note.status_enum == NotificationStatus.PENDING)
    ]
    return {
        "pending": serialize_notifications(pending),
        "recent": serialize_notifications(recent),
        "pending_count": len(pending),
        "csrf_token": generate_csrf() if user else None,
    }


def accept_share_invitation(notification: Notification, acting_user: User) -> ScopeShare:
    """Accept the invitation represented by the notification."""

    if notification.user_id != acting_user.id:
        raise PermissionError("You cannot respond to this notification.")
    if notification.type_enum != NotificationType.SCOPE_SHARE_INVITE:
        raise ValueError("This notification does not represent an invitation.")
    share = ScopeShare.query.get(notification.share_id)
    if share is None:
        notification.resolve(NotificationStatus.REJECTED)
        raise LookupError("This invitation is no longer available.")
    if share.status_enum == ScopeShareStatus.REVOKED:
        notification.resolve(NotificationStatus.REJECTED)
        raise ValueError("This invitation has been revoked.")

    share.accept()
    share.inviter_id = share.inviter_id or (share.scope.owner_id if share.scope else None)
    notification.resolve(NotificationStatus.ACCEPTED)
    resolve_invite_notifications(share, NotificationStatus.ACCEPTED)
    create_scope_share_response_notification(share, status=NotificationStatus.ACCEPTED, actor=acting_user)
    db.session.flush()
    return share


def reject_share_invitation(notification: Notification, acting_user: User) -> ScopeShare:
    """Reject the invitation represented by the notification."""

    if notification.user_id != acting_user.id:
        raise PermissionError("You cannot respond to this notification.")
    if notification.type_enum != NotificationType.SCOPE_SHARE_INVITE:
        raise ValueError("This notification does not represent an invitation.")
    share = ScopeShare.query.get(notification.share_id)
    if share is None:
        notification.resolve(NotificationStatus.REJECTED)
        raise LookupError("This invitation is no longer available.")

    share.mark_rejected()
    notification.resolve(NotificationStatus.REJECTED)
    resolve_invite_notifications(share, NotificationStatus.REJECTED)
    create_scope_share_response_notification(share, status=NotificationStatus.REJECTED, actor=acting_user)
    db.session.flush()
    return share


def load_notification(notification_id: int, user: User | None) -> Notification:
    """Return a notification for the current user or raise an error."""

    notification = Notification.query.get_or_404(notification_id)
    if user is None or notification.user_id != user.id:
        raise PermissionError("You do not have access to this notification.")
    return notification


def scope_payload_from_share(share: ScopeShare, user: User | None) -> dict[str, object]:
    """Return serialized scope data for the share if visible."""

    scope = share.scope
    if scope is None:
        return {}
    return serialize_scope(scope, user)


def share_payload_for_user(share: ScopeShare, user: User | None) -> dict[str, object]:
    """Serialize the share relative to the supplied user."""

    return serialize_share(share, user)
