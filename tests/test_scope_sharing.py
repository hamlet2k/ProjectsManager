import os
import re
import tempfile
import unittest

from app import app, db
from models.scope import Scope
from models.user import User
from models.scope_share import ScopeShare, ScopeShareStatus
from services.scope_service import get_user_scopes, user_can_access_scope


class ScopeSharingTestCase(unittest.TestCase):
    csrf_pattern = re.compile(r'name="csrf_token" value="([^"]+)"')

    def setUp(self):
        self.db_fd, self.db_path = tempfile.mkstemp()
        self._original_database_uri = app.config.get("SQLALCHEMY_DATABASE_URI")
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{self.db_path}"

        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.create_all()

            owner = User(
                username="owner",
                name="Scope Owner",
                email="owner@example.com",
            )
            owner.set_password("password123")
            collaborator = User(
                username="collab",
                name="Collaborator",
                email="collab@example.com",
            )
            collaborator.set_password("password123")
            db.session.add_all([owner, collaborator])
            db.session.commit()
            self.owner_id = owner.id
            self.collaborator_id = collaborator.id

            scope = Scope(name="Team Scope", owner_id=self.owner_id)
            db.session.add(scope)
            db.session.commit()
            self.scope_id = scope.id

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

    def _login(self, user_id):
        with self.client.session_transaction() as client_session:
            client_session["user_id"] = user_id

    def _fetch_csrf_token(self):
        response = self.client.get("/scope/")
        self.assertEqual(response.status_code, 200)
        match = self.csrf_pattern.search(response.get_data(as_text=True))
        self.assertIsNotNone(match, "CSRF token should be present in scope page")
        return match.group(1)

    def test_share_and_reject_flow(self):
        self._login(self.owner_id)
        owner_token = self._fetch_csrf_token()

        share_response = self.client.post(
            f"/scope/{self.scope_id}/share",
            json={"identifier": "collab", "role": "editor", "csrf_token": owner_token},
        )
        self.assertEqual(share_response.status_code, 200)
        share_payload = share_response.get_json()
        self.assertTrue(share_payload["success"])
        self.assertEqual(len(share_payload["shares"]), 1)

        with app.app_context():
            shares = ScopeShare.query.filter_by(scope_id=self.scope_id).all()
            self.assertEqual(len(shares), 1)
            self.assertEqual(shares[0].user_id, self.collaborator_id)
            self.assertEqual(shares[0].status_enum, ScopeShareStatus.ACCEPTED)

            collaborator = User.query.get(self.collaborator_id)
            scopes = get_user_scopes(collaborator)
            self.assertEqual(len(scopes), 1)
            self.assertEqual(scopes[0].id, self.scope_id)

        # Collaborator leaves the scope
        self._login(self.collaborator_id)
        collaborator_token = self._fetch_csrf_token()

        leave_response = self.client.delete(
            f"/scope/{self.scope_id}/share/self",
            json={"csrf_token": collaborator_token},
        )
        self.assertEqual(leave_response.status_code, 200)
        leave_payload = leave_response.get_json()
        self.assertTrue(leave_payload["success"])
        self.assertTrue(leave_payload["removed"])

        with app.app_context():
            collaborator = User.query.get(self.collaborator_id)
            scopes = get_user_scopes(collaborator)
            self.assertFalse(scopes)

            share = ScopeShare.query.filter_by(scope_id=self.scope_id, user_id=self.collaborator_id).first()
            self.assertIsNotNone(share)
            self.assertEqual(share.status_enum, ScopeShareStatus.REJECTED)

            scope = Scope.query.get(self.scope_id)
            self.assertFalse(user_can_access_scope(collaborator, scope))
