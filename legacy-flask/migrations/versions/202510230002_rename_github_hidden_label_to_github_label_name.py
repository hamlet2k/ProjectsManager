"""Rename github_hidden_label to github_label_name for consistency.

Revision ID: 202510230002
Revises: 202510230001
Create Date: 2025-10-23 16:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '202510230002'
down_revision = '202510230001'
branch_labels = None
depends_on = ['202510230001']


def upgrade() -> None:
    """Rename github_hidden_label to github_label_name for consistency."""
    
    # Rename the column in PostgreSQL
    op.execute("""
        ALTER TABLE scope_github_config 
        RENAME COLUMN github_hidden_label TO github_label_name
    """)
    
    # For SQLite, we need to recreate the table
    connection = op.get_bind()
    if connection.dialect.name == 'sqlite':
        # Create new column
        op.add_column('scope_github_config', sa.Column('github_label_name', sa.String(length=200), nullable=True))
        
        # Copy data from old column to new column
        op.execute("""
            UPDATE scope_github_config 
            SET github_label_name = github_hidden_label
            WHERE github_hidden_label IS NOT NULL
        """)
        
        # Drop old column
        op.drop_column('scope_github_config', 'github_hidden_label')


def downgrade() -> None:
    """Rename github_label_name back to github_hidden_label."""
    
    # Rename the column in PostgreSQL
    op.execute("""
        ALTER TABLE scope_github_config 
        RENAME COLUMN github_label_name TO github_hidden_label
    """)
    
    # For SQLite, we need to recreate the table
    connection = op.get_bind()
    if connection.dialect.name == 'sqlite':
        # Create old column
        op.add_column('scope_github_config', sa.Column('github_hidden_label', sa.String(length=200), nullable=True))
        
        # Copy data from new column to old column
        op.execute("""
            UPDATE scope_github_config 
            SET github_hidden_label = github_label_name
            WHERE github_label_name IS NOT NULL
        """)
        
        # Drop new column
        op.drop_column('scope_github_config', 'github_label_name')