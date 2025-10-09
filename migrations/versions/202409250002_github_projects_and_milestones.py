"""Add GitHub project and milestone configuration"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202409250002"
down_revision = "202409200001"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("scope") as batch_op:
        batch_op.add_column(sa.Column("github_project_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_project_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_title", sa.String(length=200), nullable=True))

    with op.batch_alter_table("task") as batch_op:
        batch_op.add_column(sa.Column("github_milestone_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_title", sa.String(length=200), nullable=True))


def downgrade():
    with op.batch_alter_table("task") as batch_op:
        batch_op.drop_column("github_milestone_title")
        batch_op.drop_column("github_milestone_number")

    with op.batch_alter_table("scope") as batch_op:
        batch_op.drop_column("github_milestone_title")
        batch_op.drop_column("github_milestone_number")
        batch_op.drop_column("github_project_name")
        batch_op.drop_column("github_project_id")
