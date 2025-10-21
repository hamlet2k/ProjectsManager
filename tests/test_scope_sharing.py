import re
import unittest

from app import app, db
from models.scope import Scope
from models.user import User
from models.scope_share import ScopeShare, ScopeShareStatus
from models.notification import Notification, NotificationStatus, NotificationType
from services.scope_service import get_user_scopes, user_can_access_scope
from tests.utils.db import (
    cleanup_test_database,
    provision_test_database,
    rebuild_database_engine,
)


class ScopeSharingTestCase(unittest.TestCase):
    csrf_pattern = re.compile(r'name="csrf_token" value="([^"]+)"')

    def setUp(self):
        self._original_database_uri = app.config.get("SQLALCHEMY_DATABASE_URI")
        self._original_testing = app.config.get("TESTING", False)
        self._original_csrf_enabled = app.config.get("WTF_CSRF_ENABLED", True)
        (
            self._test_db_name,
            test_database_uri,
            self._managed_test_db,
        ) = provision_test_database()
        app.config["TESTING"] = True
        app.config["SQLALCHEMY_DATABASE_URI"] = test_database_uri
        app.config["WTF_CSRF_ENABLED"] = False

        with app.app_context():
            db.session.remove()
            rebuild_database_engine(db, app.config["SQLALCHEMY_DATABASE_URI"])
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

        if self._managed_test_db:
            cleanup_test_database(self._test_db_name)
        if self._original_database_uri is not None:
            app.config["SQLALCHEMY_DATABASE_URI"] = self._original_database_uri
        app.config["TESTING"] = self._original_testing
        app.config["WTF_CSRF_ENABLED"] = self._original_csrf_enabled

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
            share = shares[0]
            self.assertEqual(share.user_id, self.collaborator_id)
            self.assertEqual(share.status_enum, ScopeShareStatus.PENDING)

            collaborator = User.query.get(self.collaborator_id)
            scopes = get_user_scopes(collaborator)
            self.assertFalse(scopes)

            notifications = Notification.query.filter_by(user_id=self.collaborator_id).all()
            self.assertEqual(len(notifications), 1)
            invite_notification = notifications[0]
            self.assertTrue(invite_notification.requires_action)
            self.assertEqual(invite_notification.status_enum, NotificationStatus.PENDING)

        # Collaborator accepts the invitation via notifications
        self._login(self.collaborator_id)
        collaborator_token = self._fetch_csrf_token()

        accept_response = self.client.post(
            f"/notifications/{invite_notification.id}/accept",
            json={"csrf_token": collaborator_token},
        )
        self.assertEqual(accept_response.status_code, 200)
        accept_payload = accept_response.get_json()
        self.assertTrue(accept_payload["success"])

        with app.app_context():
            share = ScopeShare.query.filter_by(scope_id=self.scope_id, user_id=self.collaborator_id).first()
            self.assertIsNotNone(share)
            self.assertEqual(share.status_enum, ScopeShareStatus.ACCEPTED)

            collaborator = User.query.get(self.collaborator_id)
            scopes = get_user_scopes(collaborator)
            self.assertEqual(len(scopes), 1)
            self.assertEqual(scopes[0].id, self.scope_id)

            refreshed_notification = Notification.query.get(invite_notification.id)
            self.assertIsNotNone(refreshed_notification)
            self.assertEqual(refreshed_notification.status_enum, NotificationStatus.ACCEPTED)

            owner_notifications = Notification.query.filter_by(user_id=self.owner_id).all()
            self.assertTrue(
                any(
                    note.notification_type == NotificationType.SCOPE_SHARE_RESPONSE.value
                    and note.status_enum == NotificationStatus.ACCEPTED
                    for note in owner_notifications
                )
            )

        # Collaborator leaves the scope
        self._login(self.collaborator_id)

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

            owner_notifications = Notification.query.filter_by(user_id=self.owner_id).all()
            self.assertTrue(
                any(
                    note.notification_type == NotificationType.SCOPE_SHARE_RESPONSE.value
                    and note.status_enum == NotificationStatus.REJECTED
                    for note in owner_notifications
                )
            )
