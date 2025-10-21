"""Add GitHub integration tables and columns"""

from alembic import op
import sqlalchemy as sa


revision = "202409150001"
down_revision = "202409090001"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name
    user_columns = [
        sa.Column(
            "github_integration_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("github_token_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("user") as batch_op:
            for column in user_columns:
                batch_op.add_column(column)

        op.execute("UPDATE user SET github_integration_enabled = 0")

        with op.batch_alter_table("user") as batch_op:
            batch_op.alter_column("github_integration_enabled", server_default=None)
    else:
        for column in user_columns:
            op.add_column("user", column)
        op.execute(sa.text('UPDATE "user" SET github_integration_enabled = FALSE'))
        op.alter_column("user", "github_integration_enabled", server_default=None)

    task_columns = [
        sa.Column("github_issue_id", sa.BigInteger(), nullable=True),
        sa.Column("github_issue_number", sa.Integer(), nullable=True),
        sa.Column("github_issue_url", sa.String(length=255), nullable=True),
        sa.Column("github_issue_state", sa.String(length=32), nullable=True),
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("task") as batch_op:
            for column in task_columns:
                batch_op.add_column(column)
    else:
        for column in task_columns:
            op.add_column("task", column)

    op.create_table(
        "sync_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("task.id"), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade():
    op.drop_table("sync_log")

    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        with op.batch_alter_table("task") as batch_op:
            batch_op.drop_column("github_issue_state")
            batch_op.drop_column("github_issue_url")
            batch_op.drop_column("github_issue_number")
            batch_op.drop_column("github_issue_id")
    else:
        op.drop_column("task", "github_issue_state")
        op.drop_column("task", "github_issue_url")
        op.drop_column("task", "github_issue_number")
        op.drop_column("task", "github_issue_id")

    if dialect == "sqlite":
        with op.batch_alter_table("user") as batch_op:
            batch_op.drop_column("github_repo_owner")
            batch_op.drop_column("github_repo_name")
            batch_op.drop_column("github_repo_id")
            batch_op.drop_column("github_token_encrypted")
            batch_op.drop_column("github_integration_enabled")
    else:
        op.drop_column("user", "github_repo_owner")
        op.drop_column("user", "github_repo_name")
        op.drop_column("user", "github_repo_id")
        op.drop_column("user", "github_token_encrypted")
        op.drop_column("user", "github_integration_enabled")
