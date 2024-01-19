"""A task represent an objective that needs to be completed

A Task can contain multiple Tasks (sub-taks)
A Task can be considered a project if it contains multiple sub-tasks.
A Task must belong to one or multiple Scopes
A Task cannot be completed if all its subtasks are not completed
A User can create multiple Tasks
A User is the owner of the Task he creates
A User can create Tasks in any Scope he has access to
A User cannot share individual Tasks with other Users
A User can complete any Task that belong to any Scope he has access to
A User can only delete Task he owns, or Tasks that belong to a Scope he owns

"""
from database import db

class Task(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    start_date = db.Column(db.DateTime, nullable=True)
    end_date = db.Column(db.DateTime, nullable=True)
    rank = db.Column(db.Integer, nullable=False, default=0)
    parent_task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    subtasks = db.relationship("Task", backref=db.backref("parent_task", remote_side=[id]), lazy=True)

    def __repr__(self):
        return f"<Task {self.name}>"
