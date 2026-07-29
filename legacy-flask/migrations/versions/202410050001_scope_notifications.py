"""Add notifications for scope sharing (SQLite-safe, idempotent)."""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202410050001_scope_notifications"
down_revision = "202410010001_scope_sharing"
branch_labels = None
depends_on = None


NOTIFICATION_TYPE_LENGTH = 50
NOTIFICATION_STATUS_LENGTH = 20


def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # --- Create notifications table if it doesn't already exist ---
    if "notifications" not in inspector.get_table_names():
        op.create_table(
            "notifications",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("scope_id", sa.Integer(), nullable=True),
            sa.Column("share_id", sa.Integer(), nullable=True),
            sa.Column(
                "notification_type",
                sa.String(length=NOTIFICATION_TYPE_LENGTH),
                nullable=False,
            ),
            sa.Column("title", sa.String(length=255), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column(
                "status",
                sa.String(length=NOTIFICATION_STATUS_LENGTH),
                nullable=False,
                server_default="pending",
            ),
            sa.Column(
                "requires_action",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            sa.Column("payload", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column("read_at", sa.DateTime(), nullable=True),
            sa.Column("resolved_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_notifications_user_id"),
            sa.ForeignKeyConstraint(["scope_id"], ["scope.id"], name="fk_notifications_scope_id"),
            sa.ForeignKeyConstraint(["share_id"], ["scope_shares.id"], name="fk_notifications_share_id"),
            sa.PrimaryKeyConstraint("id"),
        )

        op.create_index(
            "ix_notifications_user_status",
            "notifications",
            ["user_id", "status"],
        )
        print("[INFO] Created notifications table.")
    else:
        print("[INFO] Skipping notifications table creation (already exists).")

    # --- Safe alter_column handling for scope_shares.status ---
    if conn.dialect.name != "sqlite":
        op.alter_column(
            "scope_shares",
            "status",
            existing_type=sa.String(length=20),
            server_default="pending",
            existing_nullable=False,
        )
        print("[INFO] Updated default on scope_shares.status.")
    else:
        print("[INFO] Skipping ALTER COLUMN on SQLite (not supported).")


def downgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # --- Safe revert for ALTER COLUMN ---
    if conn.dialect.name != "sqlite":
        op.alter_column(
            "scope_shares",
            "status",
            existing_type=sa.String(length=20),
            server_default="accepted",
            existing_nullable=False,
        )
        print("[INFO] Reverted default on scope_shares.status.")
    else:
        print("[INFO] Skipping ALTER COLUMN revert on SQLite (not supported).")

    # --- Drop notifications table if it exists ---
    if "notifications" in inspector.get_table_names():
        op.drop_index("ix_notifications_user_status", table_name="notifications")
        op.drop_table("notifications")
        print("[INFO] Dropped notifications table.")
    else:
        print("[INFO] Skipping drop; notifications table not found.")
