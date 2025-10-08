"""Add GitHub project and milestone configuration fields

Revision ID: 202410010001
Revises: 790894651003
Create Date: 2025-10-10 12:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202410010001"
down_revision = "790894651003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("scope") as batch_op:
        batch_op.add_column(sa.Column("github_project_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_project_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("github_project_column_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_project_column_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_title", sa.String(length=255), nullable=True))

    with op.batch_alter_table("task") as batch_op:
        batch_op.add_column(sa.Column("github_milestone_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_title", sa.String(length=255), nullable=True))


def downgrade():
    with op.batch_alter_table("task") as batch_op:
        batch_op.drop_column("github_milestone_title")
        batch_op.drop_column("github_milestone_number")

    with op.batch_alter_table("scope") as batch_op:
        batch_op.drop_column("github_milestone_title")
        batch_op.drop_column("github_milestone_number")
        batch_op.drop_column("github_project_column_name")
        batch_op.drop_column("github_project_column_id")
        batch_op.drop_column("github_project_name")
        batch_op.drop_column("github_project_id")
