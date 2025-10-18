"""Add notifications for scope sharing."""
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
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("scope_id", sa.Integer(), nullable=True),
        sa.Column("share_id", sa.Integer(), nullable=True),
        sa.Column("notification_type", sa.String(length=NOTIFICATION_TYPE_LENGTH), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=NOTIFICATION_STATUS_LENGTH), nullable=False, server_default="pending"),
        sa.Column("requires_action", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_notifications_user_id"),
        sa.ForeignKeyConstraint(["scope_id"], ["scope.id"], name="fk_notifications_scope_id"),
        sa.ForeignKeyConstraint(["share_id"], ["scope_shares.id"], name="fk_notifications_share_id"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_notifications_user_status", "notifications", ["user_id", "status"])

    op.alter_column(
        "scope_shares",
        "status",
        existing_type=sa.String(length=20),
        server_default="pending",
        existing_nullable=False,
    )


def downgrade():
    op.alter_column(
        "scope_shares",
        "status",
        existing_type=sa.String(length=20),
        server_default="accepted",
        existing_nullable=False,
    )
    op.drop_index("ix_notifications_user_status", table_name="notifications")
    op.drop_table("notifications")
