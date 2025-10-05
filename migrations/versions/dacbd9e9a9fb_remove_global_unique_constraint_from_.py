"""Remove global unique constraint from tag.name"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text, inspect

# Revision identifiers
revision = "xxxxxx_remove_global_unique_tag_name"
down_revision = "202409090001"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        # Recreate tag table without global UNIQUE(name)
        op.execute(text("""
            CREATE TABLE tag_new (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR(64) NOT NULL,
                scope_id INTEGER,
                CONSTRAINT uq_tag_scope_name UNIQUE (scope_id, name),
                FOREIGN KEY(scope_id) REFERENCES scope (id) ON DELETE CASCADE
            );
        """))

        # Copy existing data into new table
        op.execute(text("""
            INSERT INTO tag_new (id, name, scope_id)
            SELECT id, name, scope_id FROM tag;
        """))

        op.execute(text("DROP TABLE tag;"))
        op.execute(text("ALTER TABLE tag_new RENAME TO tag;"))

    else:
        # For Postgres/MySQL later
        inspector = inspect(bind)
        uniques = inspector.get_unique_constraints("tag")
        for uc in uniques:
            if uc.get("column_names") == ["name"]:
                op.drop_constraint(uc["name"], "tag", type_="unique")


def downgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        # Rebuild tag table with the old UNIQUE(name)
        op.execute(text("""
            CREATE TABLE tag_old (
                id INTEGER NOT NULL PRIMARY KEY,
                name VARCHAR(64) NOT NULL UNIQUE,
                scope_id INTEGER,
                FOREIGN KEY(scope_id) REFERENCES scope (id) ON DELETE CASCADE
            );
        """))
        op.execute(text("""
            INSERT INTO tag_old (id, name, scope_id)
            SELECT id, name, scope_id FROM tag;
        """))
        op.execute(text("DROP TABLE tag;"))
        op.execute(text("ALTER TABLE tag_old RENAME TO tag;"))

    else:
        # Re-add the old global unique constraint
        op.create_unique_constraint("uq_tag_name", "tag", ["name"])
