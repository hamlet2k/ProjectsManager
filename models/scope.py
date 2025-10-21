"""Scope is the parent element of a task. 

A Scope can be used as a group or as a category of Tasks
A Scope groups taks under a common theme
A User can define multiple Scopes
A User is the owner of the Scope he creates
A User can share the scope with other Users
A User with access to a Scope has access to all its Tasks
A User can only delete a Scope he owns

"""
from database import db
from models.scope_share import ScopeShareStatus

class Scope(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text, nullable=True)
    rank = db.Column(db.Integer, nullable=False, default=1)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    tasks = db.relationship("Task", backref="scope", lazy=True, cascade="all, delete-orphan")
    tags = db.relationship(
        "Tag",
        back_populates="scope",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    github_configs = db.relationship(
        "ScopeGitHubConfig",
        back_populates="scope",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    shares = db.relationship(
        "ScopeShare",
        back_populates="scope",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    notifications = db.relationship(
        "Notification",
        back_populates="scope",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Scope {self.name}>"

    @property
    def active_shares(self):
        """Return all accepted shares for this scope."""

        return [share for share in self.shares if share.status_enum == ScopeShareStatus.ACCEPTED]

    @property
    def pending_shares(self):
        """Return pending share invitations."""

        return [share for share in self.shares if share.status_enum == ScopeShareStatus.PENDING]
