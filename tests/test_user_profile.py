import os
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta

if "github" not in sys.modules:
    github_module = types.ModuleType("github")

    class GithubIntegration:
        def __init__(self, *_args, **_kwargs):
            pass

        def get_access_token(self, _installation_id):
            return types.SimpleNamespace(
                token="test-token",
                expires_at=datetime.utcnow() + timedelta(hours=1),
            )

    github_module.GithubIntegration = GithubIntegration

    github_exception_module = types.ModuleType("github.GithubException")

    class GithubException(Exception):
        status = 403
        data = {}

    github_exception_module.GithubException = GithubException

    sys.modules["github"] = github_module
    sys.modules["github.GithubException"] = github_exception_module

from app import app, db
from models.user import User


class UserProfileTestCase(unittest.TestCase):
    def setUp(self):
        self.db_fd, self.db_path = tempfile.mkstemp()
        self._original_database_uri = app.config.get("SQLALCHEMY_DATABASE_URI")
        self._original_csrf_enabled = app.config.get("WTF_CSRF_ENABLED", True)
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{self.db_path}"
        app.config["WTF_CSRF_ENABLED"] = False

        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.create_all()

            primary_user = User(
                username="primary",
                name="Primary User",
                email="primary@example.com",
                theme="light",
            )
            primary_user.set_password("Password123")
            secondary_user = User(
                username="existing",
                name="Existing User",
                email="existing@example.com",
                theme="light",
            )
            secondary_user.set_password("Password123")
            db.session.add_all([primary_user, secondary_user])
            db.session.commit()
            self.primary_id = primary_user.id
            self.secondary_id = secondary_user.id

        self.client = app.test_client()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()
        os.close(self.db_fd)
        os.unlink(self.db_path)
        if self._original_database_uri is not None:
            app.config["SQLALCHEMY_DATABASE_URI"] = self._original_database_uri
        app.config["WTF_CSRF_ENABLED"] = self._original_csrf_enabled

    def _login(self, user_id):
        with self.client.session_transaction() as client_session:
            client_session["user_id"] = user_id

    def _visit_profile(self):
        response = self.client.get("/user")
        self.assertEqual(response.status_code, 200)

    def test_profile_update_rejects_duplicate_username(self):
        self._login(self.primary_id)
        self._visit_profile()

        response = self.client.post(
            "/user",
            data={
                "profile-username": "existing",
                "profile-name": "Primary User",
                "profile-email": "primary@example.com",
                "profile-theme": "light",
                "profile-submit": "Save Changes",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"This username is already in use.", response.data)

    def test_profile_update_persists_changes_and_updates_session_theme(self):
        self._login(self.primary_id)
        self._visit_profile()

        response = self.client.post(
            "/user",
            data={
                "profile-username": "updated",
                "profile-name": "Updated Name",
                "profile-email": "updated@example.com",
                "profile-theme": "dark",
                "profile-submit": "Save Changes",
            },
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302)

        with app.app_context():
            refreshed = User.query.get(self.primary_id)
            self.assertEqual(refreshed.username, "updated")
            self.assertEqual(refreshed.name, "Updated Name")
            self.assertEqual(refreshed.email, "updated@example.com")
            self.assertEqual(refreshed.theme, "dark")

        with self.client.session_transaction() as session_data:
            self.assertEqual(session_data.get("theme"), "dark")

    def test_password_change_requires_correct_current_password(self):
        self._login(self.primary_id)
        self._visit_profile()

        response = self.client.post(
            "/user",
            data={
                "password-current_password": "WrongPassword!",
                "password-new_password": "Newpass123",
                "password-confirm_password": "Newpass123",
                "password-submit": "Update Password",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Current password is incorrect.", response.data)

    def test_password_change_successfully_updates_hash(self):
        self._login(self.primary_id)
        self._visit_profile()

        response = self.client.post(
            "/user",
            data={
                "password-current_password": "Password123",
                "password-new_password": "BrandNew123",
                "password-confirm_password": "BrandNew123",
                "password-submit": "Update Password",
            },
            follow_redirects=False,
        )
        self.assertEqual(response.status_code, 302)

        with app.app_context():
            refreshed = User.query.get(self.primary_id)
            self.assertTrue(refreshed.check_password("BrandNew123"))
            self.assertFalse(refreshed.check_password("Password123"))


if __name__ == "__main__":
    unittest.main()
