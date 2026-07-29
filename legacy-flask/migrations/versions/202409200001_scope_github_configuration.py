"""Scope GitHub repository configuration"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202409200001"
down_revision = "20375276db83"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    scope_columns = [
        sa.Column(
            "github_integration_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("scope") as batch_op:
            for column in scope_columns:
                batch_op.add_column(column)
        op.execute("UPDATE scope SET github_integration_enabled = 0")
        with op.batch_alter_table("scope") as batch_op:
            batch_op.alter_column("github_integration_enabled", server_default=None)
    else:
        for column in scope_columns:
            op.add_column("scope", column)
        op.execute(sa.text("UPDATE scope SET github_integration_enabled = FALSE"))
        op.alter_column("scope", "github_integration_enabled", server_default=None)

    task_columns = [
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("task") as batch_op:
            for column in task_columns:
                batch_op.add_column(column)
    else:
        for column in task_columns:
            op.add_column("task", column)

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

    if dialect == "sqlite":
        with op.batch_alter_table("user") as batch_op:
            batch_op.drop_column("github_repo_owner")
            batch_op.drop_column("github_repo_name")
            batch_op.drop_column("github_repo_id")
    else:
        op.drop_column("user", "github_repo_owner")
        op.drop_column("user", "github_repo_name")
        op.drop_column("user", "github_repo_id")


def downgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    user_columns = [
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("user") as batch_op:
            for column in user_columns:
                batch_op.add_column(column)
    else:
        for column in user_columns:
            op.add_column("user", column)

    if dialect == "sqlite":
        with op.batch_alter_table("task") as batch_op:
            batch_op.drop_column("github_repo_owner")
            batch_op.drop_column("github_repo_name")
            batch_op.drop_column("github_repo_id")
    else:
        op.drop_column("task", "github_repo_owner")
        op.drop_column("task", "github_repo_name")
        op.drop_column("task", "github_repo_id")

    if dialect == "sqlite":
        with op.batch_alter_table("scope") as batch_op:
            batch_op.drop_column("github_repo_owner")
            batch_op.drop_column("github_repo_name")
            batch_op.drop_column("github_repo_id")
            batch_op.drop_column("github_integration_enabled")
    else:
        op.drop_column("scope", "github_repo_owner")
        op.drop_column("scope", "github_repo_name")
        op.drop_column("scope", "github_repo_id")
        op.drop_column("scope", "github_integration_enabled")
