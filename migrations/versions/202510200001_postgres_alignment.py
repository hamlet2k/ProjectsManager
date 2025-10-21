"""Align column types for PostgreSQL compatibility."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202510200001_postgres_alignment"
down_revision = "202410050001_scope_notifications"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        return

    op.alter_column(
        "task",
        "name",
        existing_type=sa.String(length=120),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "user",
        "password_hash",
        existing_type=sa.String(length=128),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade():
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        return

    op.alter_column(
        "task",
        "name",
        existing_type=sa.Text(),
        type_=sa.String(length=120),
        existing_nullable=False,
        postgresql_using="LEFT(name, 120)",
    )
    op.alter_column(
        "user",
        "password_hash",
        existing_type=sa.Text(),
        type_=sa.String(length=128),
        existing_nullable=True,
        postgresql_using="LEFT(password_hash, 128)",
    )
