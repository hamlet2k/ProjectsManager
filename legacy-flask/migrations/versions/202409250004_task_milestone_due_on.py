"""Add GitHub milestone due date to task"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202409250004"
down_revision = "202409250003"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("task") as batch_op:
        batch_op.add_column(sa.Column("github_milestone_due_on", sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table("task") as batch_op:
        batch_op.drop_column("github_milestone_due_on")
