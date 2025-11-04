"""GitHub configuration for a scope scoped to a specific user."""
from __future__ import annotations

from database import db


class ScopeGitHubConfig(db.Model):
    __tablename__ = "scope_github_config"

    id = db.Column(db.Integer, primary_key=True)
    scope_id = db.Column(db.Integer, db.ForeignKey("scope.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id", ondelete="CASCADE"), nullable=False)
    github_integration_enabled = db.Column(db.Boolean, nullable=False, default=False)
    github_repo_id = db.Column(db.BigInteger, nullable=True)
    github_repo_name = db.Column(db.String(200), nullable=True)
    github_repo_owner = db.Column(db.String(200), nullable=True)
    github_project_id = db.Column(db.String(100), nullable=True)
    github_project_name = db.Column(db.String(200), nullable=True)
    github_milestone_number = db.Column(db.Integer, nullable=True)
    github_milestone_title = db.Column(db.String(200), nullable=True)
    github_label_name = db.Column(db.String(200), nullable=True)
    is_shared_repo = db.Column(db.Boolean, nullable=False, default=False)
    source_user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_detached = db.Column(db.Boolean, nullable=False, default=False)

    scope = db.relationship("Scope", back_populates="github_configs")
    user = db.relationship(
        "User",
        back_populates="scope_github_configs",
        foreign_keys=[user_id],
    )
    source_user = db.relationship(
        "User",
        foreign_keys=[source_user_id],
        back_populates="managed_scope_github_configs",
    )

    __table_args__ = (
        db.UniqueConstraint("scope_id", "user_id", name="uq_scope_github_config_scope_user"),
        db.Index("ix_scope_github_config_scope_user", "scope_id", "user_id"),
    )

    def shares_repository_with(self, other: "ScopeGitHubConfig" | None) -> bool:
        """Return True if both configs reference the same GitHub repository."""
        if other is None:
            return False
        if not self.github_repo_owner or not self.github_repo_name:
            return False
        if not other.github_repo_owner or not other.github_repo_name:
            return False
        if self.github_repo_id and other.github_repo_id:
            try:
                return int(self.github_repo_id) == int(other.github_repo_id)
            except (TypeError, ValueError):
                return str(self.github_repo_id) == str(other.github_repo_id)
        return (
            self.github_repo_owner.lower() == other.github_repo_owner.lower()
            and self.github_repo_name.lower() == other.github_repo_name.lower()
        )

    def is_linked_to(self, owner: "ScopeGitHubConfig" | None) -> bool:
        """Return True when this config mirrors the provided owner's repository."""

        if owner is None:
            return False
        if owner.user_id == self.user_id:
            return False
        if self.is_detached:
            return False
        if not self.is_shared_repo:
            return False
        if self.source_user_id and self.source_user_id != owner.user_id:
            return False
        return self.shares_repository_with(owner)

    def clone_repository_metadata_from(self, other: "ScopeGitHubConfig") -> None:
        """Copy repository derived fields from another configuration."""
        self.github_repo_id = other.github_repo_id
        self.github_repo_name = other.github_repo_name
        self.github_repo_owner = other.github_repo_owner

    def clone_project_and_label_from(self, other: "ScopeGitHubConfig") -> None:
        """Copy project and hidden label information from another configuration."""
        self.github_project_id = other.github_project_id
        self.github_project_name = other.github_project_name
        self.github_label_name = other.github_label_name

    def clone_milestone_from(self, other: "ScopeGitHubConfig") -> None:
        """Copy milestone metadata from another configuration."""
        self.github_milestone_number = other.github_milestone_number
        self.github_milestone_title = other.github_milestone_title

    def mark_as_shared_with(self, owner: "ScopeGitHubConfig") -> None:
        """Mark this configuration as sharing repository details with the owner."""

        self.is_shared_repo = True
        self.is_detached = False
        self.source_user_id = owner.user_id

    def mark_as_detached_from(self, owner: "ScopeGitHubConfig") -> None:
        """Mark this configuration as detached from the supplied owner."""

        self.is_shared_repo = False
        self.is_detached = True
        self.source_user_id = owner.user_id

    def clear_shared_flags(self) -> None:
        """Reset shared repository tracking flags."""

        self.is_shared_repo = False
        self.is_detached = False
        self.source_user_id = None

