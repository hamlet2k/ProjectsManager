import os
import tempfile
import unittest
from unittest.mock import patch

from app import app, db
from models.user import User
from services.github_service import GitHubError


class GitHubApiTestCase(unittest.TestCase):
    def setUp(self):
        self.db_fd, self.db_path = tempfile.mkstemp()
        self._original_database_uri = app.config.get("SQLALCHEMY_DATABASE_URI")
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{self.db_path}"

        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.create_all()

            user = User(
                username="test-user",
                name="Test User",
                email="test@example.com",
            )
            user.set_password("password123")
            user.github_integration_enabled = True
            user.set_github_token("token-123")
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["user_id"] = self.user_id

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()

        os.close(self.db_fd)
        os.unlink(self.db_path)
        if self._original_database_uri is not None:
            app.config["SQLALCHEMY_DATABASE_URI"] = self._original_database_uri

    def test_github_projects_endpoint_success(self):
        repository = {"owner": "octocat", "name": "hello-world"}
        projects = [
            {"id": 1, "name": "Alpha"},
            {"id": 2, "name": "Beta"},
        ]

        with patch("app.list_repository_projects", return_value=projects) as mock_projects:
            response = self.client.post("/api/github/projects", json={"repository": repository})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["projects"], projects)
        mock_projects.assert_called_once_with("token-123", "octocat", "hello-world")

    def test_github_projects_endpoint_permission_error(self):
        repository = {"owner": "octocat", "name": "hello-world"}

        with patch(
            "app.list_repository_projects",
            side_effect=GitHubError("Forbidden", 403),
        ):
            response = self.client.post("/api/github/projects", json={"repository": repository})

        self.assertEqual(response.status_code, 403)
        payload = response.get_json()
        self.assertFalse(payload["success"])
        self.assertTrue(payload.get("permission_error"))
        self.assertIn("Ensure your token includes project access", payload["message"])

    def test_github_milestones_endpoint_success(self):
        repository = {"owner": "octocat", "name": "hello-world"}
        milestones = [
            {"number": 1, "title": "Sprint 1", "state": "open"},
            {"number": 2, "title": "Sprint 2", "state": "closed"},
        ]

        with patch(
            "app.list_repository_milestones",
            return_value=milestones,
        ) as mock_milestones:
            response = self.client.post(
                "/api/github/milestones",
                json={"repository": repository},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["milestones"], milestones)
        mock_milestones.assert_called_once_with("token-123", "octocat", "hello-world")

    def test_github_milestones_endpoint_permission_error(self):
        repository = {"owner": "octocat", "name": "hello-world"}

        with patch(
            "app.list_repository_milestones",
            side_effect=GitHubError("Forbidden", 403),
        ):
            response = self.client.post(
                "/api/github/milestones",
                json={"repository": repository},
            )

        self.assertEqual(response.status_code, 403)
        payload = response.get_json()
        self.assertFalse(payload["success"])
        self.assertTrue(payload.get("permission_error"))
        self.assertIn("Ensure your token includes milestone access", payload["message"])


if __name__ == "__main__":
    unittest.main()
