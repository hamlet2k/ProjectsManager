"""Add configurable GitHub label per scope

Revision ID: 202510230001
Revises: 202510200001
Create Date: 2025-10-23 09:43:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text
import re

# revision identifiers, used by Alembic.
revision = '202510230001'
down_revision = '202510200001_postgres_alignment'
branch_labels = None
depends_on = None


def slugify_scope_name(scope_name):
    """Convert scope name to a GitHub-label-friendly slug."""
    if not scope_name:
        return "projectsmanager"
    
    # Convert to lowercase and replace spaces with hyphens
    slug = scope_name.lower().strip()
    
    # Replace spaces and special characters with hyphens
    slug = re.sub(r'[^\w\s-]', '', slug)  # Remove special characters except hyphens
    slug = re.sub(r'[-\s]+', '-', slug)   # Replace multiple spaces/hyphens with single hyphen
    
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    
    # Ensure we have something
    if not slug:
        return "projectsmanager"
    
    return slug


def upgrade():
    """Add configurable GitHub label functionality."""
    
    # First, backfill existing github_hidden_label values
    connection = op.get_bind()
    
    # For existing records with null github_hidden_label, set default values
    # For records that already have a value, keep it
    # For new records, we'll use slugified scope name
    
    # Update existing ScopeGitHubConfig records
    update_query = text("""
        UPDATE scope_github_config 
        SET github_hidden_label = 
            CASE 
                WHEN github_hidden_label IS NULL OR github_hidden_label = '' THEN
                    CASE 
                        WHEN EXISTS (
                            SELECT 1 FROM scope 
                            WHERE scope.id = scope_github_config.scope_id
                        ) THEN
                            (SELECT 
                                CASE 
                                    WHEN name IS NULL OR name = '' THEN 'projectsmanager'
                                    ELSE 
                                        -- Create a slugified version of the scope name
                                        LOWER(
                                            REGEXP_REPLACE(
                                                REGEXP_REPLACE(
                                                    REGEXP_REPLACE(name, '[^\\w\\s-]', '', 'g'),
                                                    '[-\\s]+', '-', 'g'
                                                ),
                                                '^-|-$', '', 'g'
                                            )
                                        )
                                END 
                            FROM scope 
                            WHERE scope.id = scope_github_config.scope_id)
                        ELSE 'projectsmanager'
                    END
                ELSE github_hidden_label
            END
        WHERE github_hidden_label IS NULL OR github_hidden_label = ''
    """)
    
    try:
        # Try PostgreSQL syntax first
        connection.execute(update_query)
    except Exception:
        # Fallback to simpler approach for SQLite or other databases
        # Get all configs with null labels and update them one by one
        configs_query = text("""
            SELECT sgc.id, s.name 
            FROM scope_github_config sgc
            LEFT JOIN scope s ON sgc.scope_id = s.id
            WHERE sgc.github_hidden_label IS NULL OR sgc.github_hidden_label = ''
        """)
        
        configs = connection.execute(configs_query).fetchall()
        
        for config in configs:
            config_id, scope_name = config
            default_label = slugify_scope_name(scope_name) if scope_name else "projectsmanager"
            
            update_single = text("""
                UPDATE scope_github_config 
                SET github_hidden_label = :label 
                WHERE id = :config_id
            """)
            
            connection.execute(update_single, {"label": default_label, "config_id": config_id})
    
    # Ensure the column exists and is properly configured
    # The column should already exist, but let's make sure it's not nullable
    op.alter_column('scope_github_config', 'github_hidden_label',
                    existing_type=sa.String(length=200),
                    nullable=True)  # Keep nullable for flexibility


def downgrade():
    """Remove configurable GitHub label functionality."""
    
    # We don't want to remove the column or data, as it would break existing functionality
    # Just leave the column as-is for future use
    pass