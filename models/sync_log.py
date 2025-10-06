"""Persistence for GitHub synchronisation events."""

from datetime import datetime

from database import db


class SyncLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey("task.id"), nullable=False)
    action = db.Column(db.String(80), nullable=False)
    status = db.Column(db.String(32), nullable=False)
    message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    task = db.relationship("Task", back_populates="sync_logs")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<SyncLog task={self.task_id} action={self.action} status={self.status}>"
