"""Add GitHub integration tables and columns

Revision ID: 6f5b394bb1c4
Revises: 20375276db83
Create Date: 2025-10-06 00:37:12.873740
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6f5b394bb1c4'
down_revision = '20375276db83'
branch_labels = None
depends_on = None


def upgrade():
    # GitHub integration models were already added in this branch’s models.
    # If needed, future migrations will generate the corresponding schema updates.
    pass


def downgrade():
    pass
