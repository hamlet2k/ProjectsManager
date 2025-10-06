"""Merge multiple heads before GitHub integration

Revision ID: 20375276db83
Revises: 202409150001, xxxxxx_remove_global_unique_tag_name
Create Date: 2025-10-06 00:34:49.573961

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20375276db83'
down_revision = ('202409150001', 'xxxxxx_remove_global_unique_tag_name')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
