""" Represents a user in the system.

Users have limited access to the system by default.
Users can login to the system to get acceess and manage Projects (Scopes/Tasks).
A User can change its password
A User can reset its password (get a temporary one that must be changed at first login)
A User can edit its profile (name, email, theme, etc)
A User can manage scopes (see Scope)
A User can manage Tasks (see Task)

"""

from werkzeug.security import generate_password_hash, check_password_hash
from database import db
from models.scope_share import ScopeShare, ScopeShareRole, ScopeShareStatus


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.Text)
    role = db.Column(db.String(80), nullable=False, default='user')
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(80), unique=True, nullable=False)
    theme = db.Column(db.String(50), nullable=False, default="light")
    github_integration_enabled = db.Column(db.Boolean, nullable=False, default=False)
    github_token_encrypted = db.Column(db.LargeBinary, nullable=True)

    owned_tasks = db.relationship("Task", backref="task_owner", lazy=True)
    owned_scopes = db.relationship("Scope", backref="scope_owner", lazy=True)
    scope_shares = db.relationship(
        "ScopeShare",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
        foreign_keys=[ScopeShare.user_id],
    )
    initiated_scope_shares = db.relationship(
        "ScopeShare",
        back_populates="inviter",
        lazy="selectin",
        foreign_keys=[ScopeShare.inviter_id],
    )
    notifications = db.relationship(
        "Notification",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    ADMIN = 'admin'
    USER = 'user'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def set_github_token(self, token: str | None):
        from services.github_service import encrypt_token

        if token:
            self.github_token_encrypted = encrypt_token(token)
        else:
            self.github_token_encrypted = None

    def get_github_token(self) -> str | None:
        from services.github_service import decrypt_token

        return decrypt_token(self.github_token_encrypted)

    def __repr__(self):
        return f"<User {self.id}>"

    @property
    def scopes(self):
        """Return scopes shared with the user (accepted shares only)."""

        return [share.scope for share in self.scope_shares if share.status_enum == ScopeShareStatus.ACCEPTED and share.scope]

    def share_for_scope(self, scope_id: int | None) -> ScopeShare | None:
        """Return the share entry for the supplied scope if present."""

        if scope_id is None:
            return None
        for share in self.scope_shares:
            if share.scope_id == scope_id:
                return share
        return None

    def can_edit_scope(self, scope_id: int | None) -> bool:
        """True when the user can modify tasks within the specified scope."""

        if scope_id is None:
            return False
        if any(scope.id == scope_id for scope in self.owned_scopes):
            return True
        share = self.share_for_scope(scope_id)
        if not share:
            return False
        return share.role_enum == ScopeShareRole.EDITOR and share.status_enum == ScopeShareStatus.ACCEPTED
