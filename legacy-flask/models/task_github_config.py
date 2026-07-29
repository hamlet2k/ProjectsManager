"""GitHub configuration for a task scoped to a specific user."""
from __future__ import annotations

from datetime import datetime

from database import db


class TaskGitHubConfig(db.Model):
    __tablename__ = "task_github_config"

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(
        db.Integer,
        db.ForeignKey("task.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    github_issue_id = db.Column(db.BigInteger, nullable=True)
    github_issue_node_id = db.Column(db.String(100), nullable=True)
    github_issue_number = db.Column(db.Integer, nullable=True)
    github_issue_url = db.Column(db.String(255), nullable=True)
    github_issue_state = db.Column(db.String(32), nullable=True)
    github_repo_id = db.Column(db.BigInteger, nullable=True)
    github_repo_name = db.Column(db.String(200), nullable=True)
    github_repo_owner = db.Column(db.String(200), nullable=True)
    github_project_id = db.Column(db.String(100), nullable=True)
    github_project_name = db.Column(db.String(200), nullable=True)
    github_milestone_number = db.Column(db.Integer, nullable=True)
    github_milestone_title = db.Column(db.String(200), nullable=True)
    github_milestone_due_on = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    task = db.relationship("Task", back_populates="github_configs")
    user = db.relationship("User", back_populates="task_github_configs")

    __table_args__ = (
        db.UniqueConstraint("task_id", "user_id", name="uq_task_github_config_task_user"),
        db.Index("ix_task_github_config_task_user", "task_id", "user_id"),
    )

    def has_issue_link(self) -> bool:
        """Return True when this configuration references a GitHub issue."""
        return bool(self.github_issue_id and self.github_issue_number)

    def issue_is_open(self) -> bool:
        """Return True when the linked GitHub issue is in an open state."""
        if not self.has_issue_link():
            return False
        if self.github_issue_state is None:
            return True
        return self.github_issue_state.lower() == "open"
