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

class Scope(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    description = db.Column(db.Text, nullable=True)
    rank = db.Column(db.Integer, nullable=False, default=1)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    github_integration_enabled = db.Column(db.Boolean, nullable=False, default=False)
    github_repo_id = db.Column(db.BigInteger, nullable=True)
    github_repo_name = db.Column(db.String(200), nullable=True)
    github_repo_owner = db.Column(db.String(200), nullable=True)

    tasks = db.relationship("Task", backref="scope", lazy=True, cascade="all, delete-orphan")
    tags = db.relationship(
        "Tag",
        back_populates="scope",
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Scope {self.name}>"
