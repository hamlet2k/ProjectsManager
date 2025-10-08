""" Represents a user in the system.

Users have limited access to the system by default.
Users can login to the system to get acceess and manage Projects (Scopes/Tasks).
A User can change its password
A User can reset its password (get a temporary one that must be changed at first login)
A User can edit its profile (name, email, theme, etc)
A User can manage scopes (see Scope)
A User can manage Tasks (see Task)

"""

from werkzeug.security import generate_password_hash, check_password_hash
from database import db
from models.user_scope_association import user_scope_association


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    role = db.Column(db.String(80), nullable=False, default='user')
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(80), unique=True, nullable=False)
    theme = db.Column(db.String(50), nullable=False, default="light")
    github_integration_enabled = db.Column(db.Boolean, nullable=False, default=False)
    github_token_encrypted = db.Column(db.LargeBinary, nullable=True)

    owned_tasks = db.relationship("Task", backref="task_owner", lazy=True)
    owned_scopes = db.relationship("Scope", backref="scope_owner", lazy=True)
    scopes = db.relationship("Scope", secondary=user_scope_association, lazy="subquery", backref=db.backref("users", lazy=True))

    ADMIN = 'admin'
    USER = 'user'

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def set_github_token(self, token: str | None):
        from services.github_service import encrypt_token

        if token:
            self.github_token_encrypted = encrypt_token(token)
        else:
            self.github_token_encrypted = None

    def get_github_token(self) -> str | None:
        from services.github_service import decrypt_token

        return decrypt_token(self.github_token_encrypted)

    def __repr__(self):
        return f"<User {self.id}>"
