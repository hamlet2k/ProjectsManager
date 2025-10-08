"""Merge multiple heads after scope GitHub configuration

Revision ID: 790894651003
Revises: 6f5b394bb1c4, 202409200001
Create Date: 2025-10-08 14:20:45.506879

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '790894651003'
down_revision = ("6f5b394bb1c4", "202409200001")
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
