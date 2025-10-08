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
from datetime import datetime

import bleach
from database import db
from .tag import task_tags
from markdown import markdown as render_markdown
from markupsafe import Markup

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    start_date = db.Column(db.DateTime, nullable=True)
    end_date = db.Column(db.DateTime, nullable=True)
    rank = db.Column(db.Integer, nullable=False, default=0)
    parent_task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    completed = db.Column(db.Boolean, default=False, nullable=False)
    completed_date = db.Column(db.DateTime, nullable=True)

    github_issue_id = db.Column(db.BigInteger, nullable=True)
    github_issue_number = db.Column(db.Integer, nullable=True)
    github_issue_url = db.Column(db.String(255), nullable=True)
    github_issue_state = db.Column(db.String(32), nullable=True)
    github_repo_id = db.Column(db.BigInteger, nullable=True)
    github_repo_name = db.Column(db.String(200), nullable=True)
    github_repo_owner = db.Column(db.String(200), nullable=True)

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

    @property
    def has_github_issue(self) -> bool:
        return bool(self.github_issue_id and self.github_issue_number)

    @property
    def github_issue_is_open(self) -> bool:
        if not self.has_github_issue:
            return False
        if self.github_issue_state is None:
            return True
        return self.github_issue_state.lower() == "open"
    @property
    def description_html(self):
        if not self.description:
            return Markup("")
        html = render_markdown(
            self.description,
            extensions=["extra", "sane_lists", "codehilite"],
            output_format="html5",
        )
        allowed_tags = list(bleach.sanitizer.ALLOWED_TAGS) + [
            "p", "pre", "code", "ul", "ol", "li",
            "strong", "em", "blockquote", "br", "h1", "h2", "h3", "h4", "h5", "hr"
        ]
        allowed_attributes = {
            **bleach.sanitizer.ALLOWED_ATTRIBUTES,
            "a": ["href", "title", "target", "rel"],
            "img": ["src", "alt", "title"],
            "code": ["class"],
        }
        sanitized_html = bleach.clean(html, tags=allowed_tags, attributes=allowed_attributes)
        return Markup(sanitized_html)

    def __repr__(self):
        return f"<Task {self.name}>"
