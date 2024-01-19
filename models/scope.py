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
from models.task_scope_association import task_scope_association


class Scope(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text, nullable=True)
    rank = db.Column(db.Integer, nullable=False, default=1)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)

    tasks = db.relationship("Task", secondary=task_scope_association, lazy="subquery", backref=db.backref("scopes", lazy=True))

    def __repr__(self):
        return f"<Scope {self.name}>"
