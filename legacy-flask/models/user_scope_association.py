""" Many to Many association betweet Users and Scopes

A User can have access to many Scopes
A Scope can be accessed by many Users
"""
from sqlalchemy import Table, Column, Integer, ForeignKey
from database import db

# Association table
user_scope_association = Table(
    "user_scope_association",
    db.Model.metadata,
    Column("user_id", Integer, ForeignKey("user.id"), primary_key=True),
    Column("scope_id", Integer, ForeignKey("scope.id"), primary_key=True),
)
