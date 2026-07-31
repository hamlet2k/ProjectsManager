"""Store GitHub project ids and issue node ids as strings"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202409250005"
down_revision = "202409250004"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("scope") as batch_op:
        batch_op.alter_column(
            "github_project_id",
            existing_type=sa.BigInteger(),
            type_=sa.String(length=100),
            existing_nullable=True,
        )

    with op.batch_alter_table("task") as batch_op:
        batch_op.alter_column(
            "github_project_id",
            existing_type=sa.BigInteger(),
            type_=sa.String(length=100),
            existing_nullable=True,
        )
        batch_op.add_column(sa.Column("github_issue_node_id", sa.String(length=100), nullable=True))


def downgrade():
    with op.batch_alter_table("task") as batch_op:
        batch_op.drop_column("github_issue_node_id")
        batch_op.alter_column(
            "github_project_id",
            existing_type=sa.String(length=100),
            type_=sa.BigInteger(),
            existing_nullable=True,
        )

    with op.batch_alter_table("scope") as batch_op:
        batch_op.alter_column(
            "github_project_id",
            existing_type=sa.String(length=100),
            type_=sa.BigInteger(),
            existing_nullable=True,
        )
