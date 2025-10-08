"""Scope GitHub repository configuration"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202409200001"
down_revision = "20375276db83"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("scope") as batch_op:
        batch_op.add_column(
            sa.Column("github_integration_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0"))
        )
        batch_op.add_column(sa.Column("github_repo_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_repo_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_repo_owner", sa.String(length=200), nullable=True))

    op.execute("UPDATE scope SET github_integration_enabled = 0")

    with op.batch_alter_table("scope") as batch_op:
        batch_op.alter_column("github_integration_enabled", server_default=None)

    with op.batch_alter_table("task") as batch_op:
        batch_op.add_column(sa.Column("github_repo_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_repo_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_repo_owner", sa.String(length=200), nullable=True))

    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE task
            SET github_repo_id = u.github_repo_id,
                github_repo_name = u.github_repo_name,
                github_repo_owner = u.github_repo_owner
            FROM "user" AS u
            WHERE task.owner_id = u.id
              AND task.github_issue_number IS NOT NULL
              AND u.github_repo_id IS NOT NULL
            """
        )
    )

    with op.batch_alter_table("user") as batch_op:
        batch_op.drop_column("github_repo_owner")
        batch_op.drop_column("github_repo_name")
        batch_op.drop_column("github_repo_id")


def downgrade():
    with op.batch_alter_table("user") as batch_op:
        batch_op.add_column(sa.Column("github_repo_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_repo_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_repo_owner", sa.String(length=200), nullable=True))

    with op.batch_alter_table("task") as batch_op:
        batch_op.drop_column("github_repo_owner")
        batch_op.drop_column("github_repo_name")
        batch_op.drop_column("github_repo_id")

    with op.batch_alter_table("scope") as batch_op:
        batch_op.drop_column("github_repo_owner")
        batch_op.drop_column("github_repo_name")
        batch_op.drop_column("github_repo_id")
        batch_op.drop_column("github_integration_enabled")
