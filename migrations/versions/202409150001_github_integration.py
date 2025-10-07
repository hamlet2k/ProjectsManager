"""Add GitHub integration tables and columns"""

from alembic import op
import sqlalchemy as sa


revision = "202409150001"
down_revision = "202409090001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("user") as batch_op:
        batch_op.add_column(sa.Column("github_integration_enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("github_token_encrypted", sa.LargeBinary(), nullable=True))
        batch_op.add_column(sa.Column("github_repo_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_repo_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_repo_owner", sa.String(length=200), nullable=True))

    op.execute("UPDATE user SET github_integration_enabled = 0")

    with op.batch_alter_table("user") as batch_op:
        batch_op.alter_column("github_integration_enabled", server_default=None)

    with op.batch_alter_table("task") as batch_op:
        batch_op.add_column(sa.Column("github_issue_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_issue_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_issue_url", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("github_issue_state", sa.String(length=32), nullable=True))

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

    with op.batch_alter_table("task") as batch_op:
        batch_op.drop_column("github_issue_state")
        batch_op.drop_column("github_issue_url")
        batch_op.drop_column("github_issue_number")
        batch_op.drop_column("github_issue_id")

    with op.batch_alter_table("user") as batch_op:
        batch_op.drop_column("github_repo_owner")
        batch_op.drop_column("github_repo_name")
        batch_op.drop_column("github_repo_id")
        batch_op.drop_column("github_token_encrypted")
        batch_op.drop_column("github_integration_enabled")
