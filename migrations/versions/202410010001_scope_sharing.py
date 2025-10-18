"""Introduce scope share relationships."""
from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202410010001_scope_sharing"
down_revision = "202409250005"
branch_labels = None
depends_on = None


scope_shares_table = sa.Table(
    "scope_shares",
    sa.MetaData(),
    sa.Column("id", sa.Integer, primary_key=True),
    sa.Column("scope_id", sa.Integer, nullable=False),
    sa.Column("user_id", sa.Integer, nullable=False),
    sa.Column("inviter_id", sa.Integer),
    sa.Column("role", sa.String(length=20), nullable=False),
    sa.Column("status", sa.String(length=20), nullable=False),
    sa.Column("created_at", sa.DateTime, nullable=False),
    sa.Column("updated_at", sa.DateTime, nullable=False),
)


def upgrade():
    op.create_table(
        "scope_shares",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("scope_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("inviter_id", sa.Integer(), nullable=True),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="editor"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="accepted"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["scope_id"], ["scope.id"], name="fk_scope_shares_scope_id"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], name="fk_scope_shares_user_id"),
        sa.ForeignKeyConstraint(["inviter_id"], ["user.id"], name="fk_scope_shares_inviter_id"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("scope_id", "user_id", name="uq_scope_share_user"),
    )
    op.create_index("ix_scope_shares_scope_id", "scope_shares", ["scope_id"])
    op.create_index("ix_scope_shares_user_id", "scope_shares", ["user_id"])

    connection = op.get_bind()
    metadata = sa.MetaData()
    user_scope = sa.Table(
        "user_scope_association",
        metadata,
        sa.Column("user_id", sa.Integer),
        sa.Column("scope_id", sa.Integer),
    )
    scope_table = sa.Table(
        "scope",
        metadata,
        sa.Column("id", sa.Integer),
        sa.Column("owner_id", sa.Integer),
    )

    scope_owners = {
        row.id: row.owner_id
        for row in connection.execute(sa.select(scope_table.c.id, scope_table.c.owner_id))
    }

    existing_shares = connection.execute(sa.select(user_scope.c.scope_id, user_scope.c.user_id))
    share_rows = existing_shares.fetchall()

    if share_rows:
        insert_values: list[dict[str, object]] = []
        now = datetime.utcnow()
        for scope_id, user_id in share_rows:
            owner_id = scope_owners.get(scope_id)
            if owner_id is None or owner_id == user_id:
                continue
            insert_values.append(
                {
                    "scope_id": scope_id,
                    "user_id": user_id,
                    "inviter_id": owner_id,
                    "role": "editor",
                    "status": "accepted",
                    "created_at": now,
                    "updated_at": now,
                }
            )
        if insert_values:
            connection.execute(sa.insert(scope_shares_table), insert_values)


def downgrade():
    op.drop_index("ix_scope_shares_user_id", table_name="scope_shares")
    op.drop_index("ix_scope_shares_scope_id", table_name="scope_shares")
    op.drop_table("scope_shares")
