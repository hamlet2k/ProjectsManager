"""Models representing scope sharing relationships."""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from database import db


class ScopeShareRole(StrEnum):
    """Role assigned to a user for a shared scope."""

    VIEWER = "viewer"
    EDITOR = "editor"


class ScopeShareStatus(StrEnum):
    """Lifecycle status for a scope share invitation."""

    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"
    REJECTED = "rejected"


class ScopeShare(db.Model):
    """Join model linking scopes to collaborating users."""

    __tablename__ = "scope_shares"

    id = db.Column(db.Integer, primary_key=True)
    scope_id = db.Column(db.Integer, db.ForeignKey("scope.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
    inviter_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True, index=True)
    role = db.Column(db.String(20), nullable=False, default=ScopeShareRole.EDITOR.value)
    status = db.Column(db.String(20), nullable=False, default=ScopeShareStatus.ACCEPTED.value)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    scope = db.relationship("Scope", back_populates="shares")
    user = db.relationship("User", back_populates="scope_shares", foreign_keys=[user_id])
    inviter = db.relationship(
        "User",
        back_populates="initiated_scope_shares",
        foreign_keys=[inviter_id],
    )

    __table_args__ = (db.UniqueConstraint("scope_id", "user_id", name="uq_scope_share_user"),)

    @property
    def role_enum(self) -> ScopeShareRole:
        """Return the role as an enum value."""

        return ScopeShareRole(self.role)

    @role_enum.setter
    def role_enum(self, value: ScopeShareRole) -> None:
        self.role = value.value

    @property
    def status_enum(self) -> ScopeShareStatus:
        """Return the status as an enum value."""

        return ScopeShareStatus(self.status)

    @status_enum.setter
    def status_enum(self, value: ScopeShareStatus) -> None:
        self.status = value.value

    @property
    def is_active(self) -> bool:
        """True when the share grants access to the scope."""

        return self.status_enum == ScopeShareStatus.ACCEPTED

    def mark_rejected(self) -> None:
        """Set the share status to rejected."""

        self.status_enum = ScopeShareStatus.REJECTED

    def mark_revoked(self) -> None:
        """Set the share status to revoked."""

        self.status_enum = ScopeShareStatus.REVOKED

    def accept(self) -> None:
        """Mark the share as accepted."""

        self.status_enum = ScopeShareStatus.ACCEPTED

    def to_dict(self) -> dict[str, str | int | None]:
        """Return a JSON-ready representation of the share."""

        return {
            "id": self.id,
            "scope_id": self.scope_id,
            "user_id": self.user_id,
            "role": self.role,
            "status": self.status,
        }
