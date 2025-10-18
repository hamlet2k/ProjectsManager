import os
import tempfile
import unittest

from datetime import datetime

from app import app, db
from models.notification import Notification, NotificationStatus, NotificationType
from models.user import User
from services.notification_service import build_notifications_summary, mark_notifications_read


class NotificationServiceTestCase(unittest.TestCase):
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
                username="notifier",
                name="Notifier",
                email="notify@example.com",
            )
            user.set_password("password123")
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

            pending = Notification(
                user_id=user.id,
                notification_type=NotificationType.SCOPE_SHARE_INVITE.value,
                title="Invitation",
                message="A collaborator invited you to a scope.",
                status=NotificationStatus.PENDING.value,
                requires_action=True,
            )
            response = Notification(
                user_id=user.id,
                notification_type=NotificationType.SCOPE_SHARE_RESPONSE.value,
                title="Response",
                message="A collaborator responded to your invitation.",
                status=NotificationStatus.ACCEPTED.value,
                requires_action=False,
            )
            history = Notification(
                user_id=user.id,
                notification_type=NotificationType.SCOPE_SHARE_RESPONSE.value,
                title="Historical",
                message="Previously read.",
                status=NotificationStatus.READ.value,
                requires_action=False,
                read_at=datetime.utcnow(),
            )
            db.session.add_all([pending, response, history])
            db.session.commit()
            self.pending_id = pending.id
            self.response_id = response.id

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()
            db.engine.dispose()
        os.close(self.db_fd)
        os.unlink(self.db_path)
        if self._original_database_uri is not None:
            app.config["SQLALCHEMY_DATABASE_URI"] = self._original_database_uri

    def test_badge_count_and_mark_read(self):
        with app.app_context():
            user = User.query.get(self.user_id)
            with app.test_request_context():
                summary = build_notifications_summary(user)
                self.assertEqual(summary.get("pending_count"), 1)
                self.assertEqual(summary.get("unread_count"), 1)
                self.assertEqual(summary.get("badge_count"), 2)

                updated = mark_notifications_read(user, [self.pending_id, self.response_id])
                self.assertEqual(updated, 2)
                db.session.commit()

                refreshed = build_notifications_summary(user)
                self.assertEqual(refreshed.get("pending_count"), 1)
                # After marking notifications as read, only actionable pending items should remain in the badge count.
                self.assertEqual(refreshed.get("badge_count"), 1)
                # Pending notifications remain actionable but are marked as read to avoid double counting.
                pending_entry = refreshed.get("pending", [])[0]
                self.assertEqual(pending_entry.get("id"), self.pending_id)
                self.assertTrue(pending_entry.get("is_read"))


if __name__ == "__main__":
    unittest.main()
