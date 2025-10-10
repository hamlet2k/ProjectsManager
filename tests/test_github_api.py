import os
import tempfile
import unittest
from datetime import datetime
from unittest.mock import patch

from app import app, db
from models.scope import Scope
from models.task import Task
from models.user import User
from services.github_service import GitHubError, GitHubIssue


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

            scope = Scope(
                name="Test Scope",
                owner_id=user.id,
                github_integration_enabled=True,
                github_repo_owner="octocat",
                github_repo_name="hello-world",
            )
            db.session.add(scope)
            db.session.commit()
            self.scope_id = scope.id

        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["user_id"] = self.user_id
            session["scope_id"] = self.scope_id
            session["selected_scope"] = self.scope_id

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

    def test_github_projects_endpoint_projects_gone(self):
        repository = {"owner": "octocat", "name": "hello-world"}

        with patch(
            "app.list_repository_projects",
            side_effect=GitHubError(
                "GitHub repository projects are not available for this repository.",
                410,
            ),
        ):
            response = self.client.post("/api/github/projects", json={"repository": repository})

        self.assertEqual(response.status_code, 410)
        payload = response.get_json()
        self.assertFalse(payload["success"])
        self.assertTrue(payload.get("permission_error"))
        self.assertIn("classic projects", payload["message"])

    def test_github_milestones_endpoint_success(self):
        repository = {"owner": "octocat", "name": "hello-world"}
        milestones = [
            {"number": 1, "title": "Sprint 1", "state": "open", "due_on": "2024-01-15T00:00:00Z"},
            {"number": 2, "title": "Sprint 2", "state": "closed", "due_on": None},
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

    def test_github_milestones_endpoint_projects_gone(self):
        repository = {"owner": "octocat", "name": "hello-world"}

        with patch(
            "app.list_repository_milestones",
            side_effect=GitHubError(
                "GitHub repository projects are not available for this repository.",
                410,
            ),
        ):
            response = self.client.post(
                "/api/github/milestones",
                json={"repository": repository},
            )

        self.assertEqual(response.status_code, 410)
        payload = response.get_json()
        self.assertFalse(payload["success"])
        self.assertTrue(payload.get("permission_error"))
        self.assertIn("milestone access", payload["message"])

    def test_update_task_milestone_success(self):
        with app.app_context():
            task = Task(
                name="Linked task",
                owner_id=self.user_id,
                scope_id=self.scope_id,
                github_issue_number=101,
                github_issue_id=1001,
                github_repo_owner="octocat",
                github_repo_name="hello-world",
            )
            db.session.add(task)
            db.session.commit()
            task_id = task.id

        issue_response = GitHubIssue(
            id=1001,
            number=101,
            title="Issue",
            body="",
            url="https://github.com/octocat/hello-world/issues/101",
            state="open",
            labels=[],
            milestone_number=5,
            milestone_title="Sprint 5",
            milestone_state="open",
            milestone_due_on="2024-02-01T00:00:00Z",
        )

        with patch("app.update_issue", return_value=issue_response):
            response = self.client.post(
                f"/api/tasks/{task_id}/milestone",
                json={
                    "milestone": {
                        "number": 5,
                        "title": "Sprint 5",
                        "state": "open",
                        "due_on": "2024-02-01T00:00:00Z",
                    }
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertIn("Sprint 5", payload["message"])
        self.assertIn("milestone", payload)
        self.assertEqual(payload["milestone"]["number"], 5)
        self.assertEqual(payload["milestone"]["due_on"], "2024-02-01T00:00:00Z")

        with app.app_context():
            updated = Task.query.get(task_id)
            self.assertEqual(updated.github_milestone_number, 5)
            self.assertEqual(updated.github_milestone_title, "Sprint 5")
            self.assertIsNotNone(updated.github_milestone_due_on)
            self.assertEqual(
                updated.github_milestone_due_on,
                datetime.fromisoformat("2024-02-01T00:00:00"),
            )

    def test_update_task_milestone_remove(self):
        with app.app_context():
            task = Task(
                name="With milestone",
                owner_id=self.user_id,
                scope_id=self.scope_id,
                github_issue_number=202,
                github_issue_id=2002,
                github_repo_owner="octocat",
                github_repo_name="hello-world",
                github_milestone_number=3,
                github_milestone_title="Sprint 3",
                github_milestone_due_on=datetime.fromisoformat("2024-01-01T00:00:00+00:00"),
            )
            db.session.add(task)
            db.session.commit()
            task_id = task.id

        issue_response = GitHubIssue(
            id=2002,
            number=202,
            title="Issue",
            body="",
            url="https://github.com/octocat/hello-world/issues/202",
            state="open",
            labels=[],
            milestone_number=None,
            milestone_title="",
            milestone_state=None,
            milestone_due_on=None,
        )

        with patch("app.update_issue", return_value=issue_response):
            response = self.client.post(f"/api/tasks/{task_id}/milestone", json={"milestone": None})

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["success"])
        self.assertIn("Milestone removed", payload["message"])
        self.assertNotIn("milestone", payload)

        with app.app_context():
            updated = Task.query.get(task_id)
            self.assertIsNone(updated.github_milestone_number)
            self.assertIsNone(updated.github_milestone_title)
            self.assertIsNone(updated.github_milestone_due_on)


if __name__ == "__main__":
    unittest.main()
