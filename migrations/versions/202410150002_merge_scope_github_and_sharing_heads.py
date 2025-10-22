"""Merge scope sharing and per-user GitHub config heads"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "202410150002_merge_scope_github_and_sharing_heads"
down_revision = ("202410150001", "202410010001_scope_sharing")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
