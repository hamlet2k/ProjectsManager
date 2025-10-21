"""Per-user GitHub configuration for scopes"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import table, column


# revision identifiers, used by Alembic.
revision = "202410150001"
down_revision = "202409250005"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    op.create_table(
        "scope_github_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("scope_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("github_integration_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
        sa.Column("github_project_id", sa.String(length=100), nullable=True),
        sa.Column("github_project_name", sa.String(length=200), nullable=True),
        sa.Column("github_milestone_number", sa.Integer(), nullable=True),
        sa.Column("github_milestone_title", sa.String(length=200), nullable=True),
        sa.Column("github_hidden_label", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["scope_id"], ["scope.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
    )
    op.create_unique_constraint(
        "uq_scope_github_config_scope_user",
        "scope_github_config",
        ["scope_id", "user_id"],
    )
    op.create_index(
        "ix_scope_github_config_scope_user",
        "scope_github_config",
        ["scope_id", "user_id"],
    )

    config_table = table(
        "scope_github_config",
        column("scope_id", sa.Integer()),
        column("user_id", sa.Integer()),
        column("github_integration_enabled", sa.Boolean()),
        column("github_repo_id", sa.BigInteger()),
        column("github_repo_name", sa.String()),
        column("github_repo_owner", sa.String()),
        column("github_project_id", sa.String()),
        column("github_project_name", sa.String()),
        column("github_milestone_number", sa.Integer()),
        column("github_milestone_title", sa.String()),
    )

    scope_rows = list(
        bind.execute(
            sa.text(
                """
                SELECT id, owner_id, github_integration_enabled, github_repo_id, github_repo_name,
                       github_repo_owner, github_project_id, github_project_name,
                       github_milestone_number, github_milestone_title
                FROM scope
                """
            )
        )
    )

    for row in scope_rows:
        owner_id = row.owner_id
        if owner_id is None:
            continue
        bind.execute(
            config_table.insert().values(
                scope_id=row.id,
                user_id=owner_id,
                github_integration_enabled=bool(row.github_integration_enabled),
                github_repo_id=row.github_repo_id,
                github_repo_name=row.github_repo_name,
                github_repo_owner=row.github_repo_owner,
                github_project_id=row.github_project_id,
                github_project_name=row.github_project_name,
                github_milestone_number=row.github_milestone_number,
                github_milestone_title=row.github_milestone_title,
            )
        )

    scope_columns = [
        "github_hidden_label",
        "github_milestone_title",
        "github_milestone_number",
        "github_project_name",
        "github_project_id",
        "github_repo_owner",
        "github_repo_name",
        "github_repo_id",
        "github_integration_enabled",
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("scope") as batch_op:
            for column_name in scope_columns:
                batch_op.drop_column(column_name)
    else:
        for column_name in scope_columns:
            op.drop_column("scope", column_name)

    op.alter_column("scope_github_config", "github_integration_enabled", server_default=None)


def downgrade():
    bind = op.get_bind()
    dialect = bind.dialect.name

    scope_columns = [
        sa.Column("github_integration_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
        sa.Column("github_project_id", sa.String(length=100), nullable=True),
        sa.Column("github_project_name", sa.String(length=200), nullable=True),
        sa.Column("github_milestone_number", sa.Integer(), nullable=True),
        sa.Column("github_milestone_title", sa.String(length=200), nullable=True),
        sa.Column("github_hidden_label", sa.String(length=200), nullable=True),
    ]

    if dialect == "sqlite":
        with op.batch_alter_table("scope") as batch_op:
            for column in scope_columns:
                batch_op.add_column(column)
        op.execute("UPDATE scope SET github_integration_enabled = 0")
        with op.batch_alter_table("scope") as batch_op:
            batch_op.alter_column("github_integration_enabled", server_default=None)
    else:
        for column in scope_columns:
            op.add_column("scope", column)
        op.execute(sa.text("UPDATE scope SET github_integration_enabled = FALSE"))
        op.alter_column("scope", "github_integration_enabled", server_default=None)

    scope_table = table(
        "scope",
        column("id", sa.Integer()),
        column("owner_id", sa.Integer()),
        column("github_integration_enabled", sa.Boolean()),
        column("github_repo_id", sa.BigInteger()),
        column("github_repo_name", sa.String()),
        column("github_repo_owner", sa.String()),
        column("github_project_id", sa.String()),
        column("github_project_name", sa.String()),
        column("github_milestone_number", sa.Integer()),
        column("github_milestone_title", sa.String()),
        column("github_hidden_label", sa.String()),
    )

    config_rows = list(
        bind.execute(
            sa.text(
                """
                SELECT scope_id, user_id, github_integration_enabled, github_repo_id, github_repo_name,
                       github_repo_owner, github_project_id, github_project_name,
                       github_milestone_number, github_milestone_title, github_hidden_label
                FROM scope_github_config
                """
            )
        )
    )

    for row in config_rows:
        scope_id = row.scope_id
        owner_id = bind.execute(
            sa.text("SELECT owner_id FROM scope WHERE id = :id"), {"id": scope_id}
        ).scalar()
        if owner_id is None or owner_id != row.user_id:
            continue
        bind.execute(
            scope_table.update()
            .where(scope_table.c.id == scope_id)
            .values(
                github_integration_enabled=bool(row.github_integration_enabled),
                github_repo_id=row.github_repo_id,
                github_repo_name=row.github_repo_name,
                github_repo_owner=row.github_repo_owner,
                github_project_id=row.github_project_id,
                github_project_name=row.github_project_name,
                github_milestone_number=row.github_milestone_number,
                github_milestone_title=row.github_milestone_title,
                github_hidden_label=row.github_hidden_label,
            )
        )

    op.drop_index("ix_scope_github_config_scope_user", table_name="scope_github_config")
    op.drop_constraint("uq_scope_github_config_scope_user", "scope_github_config", type_="unique")
    op.drop_table("scope_github_config")
