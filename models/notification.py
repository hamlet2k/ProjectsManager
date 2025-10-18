"""Notification models for user-facing alerts."""
from __future__ import annotations
from datetime import datetime
from enum import StrEnum

from database import db


class NotificationType(StrEnum):
    """Supported notification categories."""

    SCOPE_SHARE_INVITE = "scope_share_invite"
    SCOPE_SHARE_RESPONSE = "scope_share_response"


class NotificationStatus(StrEnum):
    """Lifecycle states for notifications."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    READ = "read"


class Notification(db.Model):
    """Persisted message for a user with optional actions."""

    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    scope_id = db.Column(db.Integer, db.ForeignKey("scope.id"), nullable=True, index=True)
    share_id = db.Column(db.Integer, db.ForeignKey("scope_shares.id"), nullable=True, index=True)
    notification_type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), nullable=False, default=NotificationStatus.PENDING.value)
    requires_action = db.Column(db.Boolean, nullable=False, default=False)
    payload = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    read_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship("User", back_populates="notifications", foreign_keys=[user_id])
    scope = db.relationship("Scope", back_populates="notifications", foreign_keys=[scope_id])
    share = db.relationship("ScopeShare", back_populates="notifications", foreign_keys=[share_id])

    __table_args__ = (
        db.Index("ix_notifications_user_status", "user_id", "status"),
    )

    @property
    def status_enum(self) -> NotificationStatus:
        """Return the status as an enum value."""

        return NotificationStatus(self.status)

    @status_enum.setter
    def status_enum(self, value: NotificationStatus) -> None:
        self.status = value.value

    @property
    def type_enum(self) -> NotificationType:
        """Return the notification type as an enum value."""

        return NotificationType(self.notification_type)

    @type_enum.setter
    def type_enum(self, value: NotificationType) -> None:
        self.notification_type = value.value

    @property
    def is_resolved(self) -> bool:
        """True when the notification no longer requires attention."""

        return self.resolved_at is not None or self.status_enum in {
            NotificationStatus.ACCEPTED,
            NotificationStatus.REJECTED,
            NotificationStatus.READ,
        }

    def mark_read(self) -> None:
        """Record that the notification has been seen."""

        if self.read_at is None:
            self.read_at = datetime.utcnow()
        if self.status_enum == NotificationStatus.PENDING and not self.requires_action:
            self.status_enum = NotificationStatus.READ

    def resolve(self, status: NotificationStatus | None = None) -> None:
        """Mark the notification as resolved with an optional terminal status."""

        if status is not None:
            self.status_enum = status
        if self.resolved_at is None:
            self.resolved_at = datetime.utcnow()
        self.mark_read()

    def to_dict(self) -> dict[str, object]:
        """Return a serialized representation of the notification."""

        return {
            "id": self.id,
            "user_id": self.user_id,
            "scope_id": self.scope_id,
            "share_id": self.share_id,
            "title": self.title,
            "message": self.message,
            "status": self.status,
            "requires_action": self.requires_action,
            "notification_type": self.notification_type,
            "payload": self.payload or {},
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }
