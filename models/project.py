# models/project.py
from database import db

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    scope_id = db.Column(db.Integer, db.ForeignKey('scope.id'), nullable=False)
    tasks = db.relationship('Task', backref='project', lazy=True)

    def __repr__(self):
        return f'<Project {self.name}>'
