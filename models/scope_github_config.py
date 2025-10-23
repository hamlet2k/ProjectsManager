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

    scope = db.relationship("Scope", back_populates="github_configs")
    user = db.relationship("User", back_populates="scope_github_configs")

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

