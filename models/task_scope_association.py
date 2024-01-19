""" Many to Many association betweet Scopes and Tasks

A Scope can have contain multiple Tasks
A Task can belong to Multiple Scopes
"""
from sqlalchemy import Table, Column, Integer, ForeignKey
from database import db

# Association table
task_scope_association = Table(
    "task_scope_association",
    db.Model.metadata,
    Column("task_id", Integer, ForeignKey("task.id"), primary_key=True),
    Column("scope_id", Integer, ForeignKey("scope.id"), primary_key=True),
)
