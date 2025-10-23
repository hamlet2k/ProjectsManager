"""A task represent an objective that needs to be completed

A Task can contain multiple Tasks (sub-taks)
A Task can be considered a project if it contains multiple sub-tasks.
A Task cannot be completed if all its subtasks are not completed
A User can create multiple Tasks
A User is the owner of the Task he creates
A User can create Tasks in any Scope he has access to
A User cannot share individual Tasks with other Users
A User can complete any Task that belong to any Scope he has access to
A User can only delete Task he owns, or Tasks that belong to a Scope he owns

"""
from __future__ import annotations
from datetime import datetime
from typing import Optional, Iterable

import bleach
from database import db
from .tag import task_tags
from markdown import markdown as render_markdown
from markupsafe import Markup


def render_task_description_html(description: Optional[str]) -> Markup:
    """Render task description Markdown into sanitized HTML."""
    if not description:
        return Markup("")
    html = render_markdown(
        description,
        extensions=["extra", "sane_lists", "codehilite"],
        output_format="html5",
        tab_length=2,
    )
    allowed_tags = list(bleach.sanitizer.ALLOWED_TAGS) + [
        "p",
        "pre",
        "code",
        "ul",
        "ol",
        "li",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "div",
        "span",
        "strong",
        "em",
        "blockquote",
        "br",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "hr",
    ]
    allowed_attributes = {
        **bleach.sanitizer.ALLOWED_ATTRIBUTES,
        "a": ["href", "title", "target", "rel"],
        "img": ["src", "alt", "title"],
        "code": ["class"],
    }
    sanitized_html = bleach.clean(html, tags=allowed_tags, attributes=allowed_attributes)
    return Markup(sanitized_html)


class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=True)
    start_date = db.Column(db.DateTime, nullable=True)
    end_date = db.Column(db.DateTime, nullable=True)
    rank = db.Column(db.Integer, nullable=False, default=0)
    parent_task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    completed_date = db.Column(db.DateTime, nullable=True)

    scope_id = db.Column(db.Integer, db.ForeignKey('scope.id'), nullable=True)
    subtasks = db.relationship("Task", backref=db.backref("parent_task", remote_side=[id]), lazy=True, cascade="all, delete-orphan")
    tags = db.relationship(
        "Tag",
        secondary=task_tags,
        back_populates="tasks",
        lazy="selectin",
    )
    sync_logs = db.relationship(
        "SyncLog",
        back_populates="task",
        lazy="dynamic",
        cascade="all, delete-orphan",
    )
    github_configs = db.relationship(
        "TaskGitHubConfig",
        back_populates="task",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    
    def complete_task(self):
        self.completed = True
        self.completed_date = datetime.utcnow()
        for subtask in self.subtasks:
            subtask.complete_task()
            
    def uncomplete_task(self):
        self.completed = False
        self.completed_date = None
        for subtask in self.subtasks:
            subtask.uncomplete_task()
            
    def has_info(self):
        if self.description or self.end_date or self.subtasks or self.tags:
            return True
        else:
            return False

    def iter_github_configs(self) -> Iterable["TaskGitHubConfig"]:
        """Return all GitHub configurations associated with this task."""
        return tuple(self.github_configs or [])

    def get_github_config_for_user(self, user_id: int | None) -> "TaskGitHubConfig" | None:
        """Return the GitHub configuration for a specific user if present."""

        if user_id is None:
            return None
        for config in self.iter_github_configs():
            if config.user_id == user_id:
                return config
        return None

    def _active_github_config(self) -> "TaskGitHubConfig" | None:
        from flask import g
        from services.task_service import get_task_github_config

        user = getattr(g, "user", None)
        return get_task_github_config(self, user)

    def _ensure_active_github_config(self) -> "TaskGitHubConfig" | None:
        from flask import g
        from services.task_service import (
            ensure_task_github_config,
            get_task_owner_github_config,
        )
        from models.user import User

        user = getattr(g, "user", None)
        if user is not None:
            return ensure_task_github_config(self, user)
        owner_config = get_task_owner_github_config(self)
        if owner_config is not None:
            return owner_config
        owner_id = getattr(self, "owner_id", None)
        if owner_id:
            owner = User.query.get(owner_id)
            if owner is not None:
                return ensure_task_github_config(self, owner)
        if user is not None:
            return ensure_task_github_config(self, user)
        return None

    def _get_github_attr(self, attribute: str):
        config = self._active_github_config()
        return getattr(config, attribute) if config else None

    def _set_github_attr(self, attribute: str, value) -> None:
        config = self._ensure_active_github_config()
        if config is not None:
            setattr(config, attribute, value)

    @property
    def has_github_issue(self) -> bool:
        config = self._active_github_config()
        return bool(config and config.has_issue_link())

    @property
    def github_issue_is_open(self) -> bool:
        config = self._active_github_config()
        return bool(config and config.issue_is_open())

    @property
    def github_issue_id(self):
        return self._get_github_attr("github_issue_id")

    @github_issue_id.setter
    def github_issue_id(self, value):
        self._set_github_attr("github_issue_id", value)

    @property
    def github_issue_node_id(self):
        return self._get_github_attr("github_issue_node_id")

    @github_issue_node_id.setter
    def github_issue_node_id(self, value):
        self._set_github_attr("github_issue_node_id", value)

    @property
    def github_issue_number(self):
        return self._get_github_attr("github_issue_number")

    @github_issue_number.setter
    def github_issue_number(self, value):
        self._set_github_attr("github_issue_number", value)

    @property
    def github_issue_url(self):
        return self._get_github_attr("github_issue_url")

    @github_issue_url.setter
    def github_issue_url(self, value):
        self._set_github_attr("github_issue_url", value)

    @property
    def github_issue_state(self):
        return self._get_github_attr("github_issue_state")

    @github_issue_state.setter
    def github_issue_state(self, value):
        self._set_github_attr("github_issue_state", value)

    @property
    def github_repo_id(self):
        return self._get_github_attr("github_repo_id")

    @github_repo_id.setter
    def github_repo_id(self, value):
        self._set_github_attr("github_repo_id", value)

    @property
    def github_repo_name(self):
        return self._get_github_attr("github_repo_name")

    @github_repo_name.setter
    def github_repo_name(self, value):
        self._set_github_attr("github_repo_name", value)

    @property
    def github_repo_owner(self):
        return self._get_github_attr("github_repo_owner")

    @github_repo_owner.setter
    def github_repo_owner(self, value):
        self._set_github_attr("github_repo_owner", value)

    @property
    def github_project_id(self):
        return self._get_github_attr("github_project_id")

    @github_project_id.setter
    def github_project_id(self, value):
        self._set_github_attr("github_project_id", value)

    @property
    def github_project_name(self):
        return self._get_github_attr("github_project_name")

    @github_project_name.setter
    def github_project_name(self, value):
        self._set_github_attr("github_project_name", value)

    @property
    def github_milestone_number(self):
        return self._get_github_attr("github_milestone_number")

    @github_milestone_number.setter
    def github_milestone_number(self, value):
        self._set_github_attr("github_milestone_number", value)

    @property
    def github_milestone_title(self):
        return self._get_github_attr("github_milestone_title")

    @github_milestone_title.setter
    def github_milestone_title(self, value):
        self._set_github_attr("github_milestone_title", value)

    @property
    def github_milestone_due_on(self):
        return self._get_github_attr("github_milestone_due_on")

    @github_milestone_due_on.setter
    def github_milestone_due_on(self, value):
        self._set_github_attr("github_milestone_due_on", value)
    @property
    def description_html(self):
        return render_task_description_html(self.description)

    def __repr__(self):
        return f"<Task {self.name}>"
