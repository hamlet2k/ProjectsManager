# models/scope.py
from database import db

class Scope(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    rank = db.Column(db.Integer, nullable=False, default=1)
    projects = db.relationship('Project', backref='scope', lazy=True)

    def __repr__(self):
        return f'<Scope {self.name}>'
