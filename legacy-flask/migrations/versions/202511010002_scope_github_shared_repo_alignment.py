import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "20251101_scope_github_align"
down_revision = "20251101_task_github_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "scope_github_config",
        sa.Column("is_shared_repo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "scope_github_config",
        sa.Column("source_user_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "scope_github_config",
        sa.Column("is_detached", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_foreign_key(
        "fk_scope_github_config_source_user",
        "scope_github_config",
        "user",
        ["source_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_scope_github_config_scope_source",
        "scope_github_config",
        ["scope_id", "source_user_id"],
    )

    connection = op.get_bind()

    scope_table = sa.sql.table(
        "scope",
        sa.Column("id", sa.Integer),
        sa.Column("owner_id", sa.Integer),
    )
    config_table = sa.sql.table(
        "scope_github_config",
        sa.Column("id", sa.Integer),
        sa.Column("scope_id", sa.Integer),
        sa.Column("user_id", sa.Integer),
        sa.Column("github_repo_id", sa.BigInteger),
        sa.Column("github_repo_name", sa.String),
        sa.Column("github_repo_owner", sa.String),
        sa.Column("is_shared_repo", sa.Boolean),
        sa.Column("source_user_id", sa.Integer),
        sa.Column("is_detached", sa.Boolean),
    )

    rows = connection.execute(
        sa.select(
            config_table.c.id,
            config_table.c.scope_id,
            config_table.c.user_id,
            config_table.c.github_repo_id,
            config_table.c.github_repo_owner,
            config_table.c.github_repo_name,
            scope_table.c.owner_id,
        ).select_from(
            config_table.join(scope_table, config_table.c.scope_id == scope_table.c.id)
        )
    ).fetchall()

    owners: dict[int, tuple] = {}
    for row in rows:
        if row.owner_id is not None and row.owner_id == row.user_id:
            owners[row.scope_id] = row

    for row in rows:
        owner_row = owners.get(row.scope_id)
        if not owner_row:
            continue
        if row.owner_id is None or row.user_id == row.owner_id:
            continue

        shared = False
        if owner_row.github_repo_id and row.github_repo_id:
            shared = bool(int(owner_row.github_repo_id) == int(row.github_repo_id))
        elif (
            owner_row.github_repo_owner
            and owner_row.github_repo_name
            and row.github_repo_owner
            and row.github_repo_name
        ):
            shared = (
                owner_row.github_repo_owner.lower() == row.github_repo_owner.lower()
                and owner_row.github_repo_name.lower() == row.github_repo_name.lower()
            )

        if not shared:
            continue

        connection.execute(
            config_table.update()
            .where(config_table.c.id == row.id)
            .values(
                is_shared_repo=True,
                source_user_id=row.owner_id,
                is_detached=False,
            )
        )

    op.alter_column("scope_github_config", "is_shared_repo", server_default=None)
    op.alter_column("scope_github_config", "is_detached", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_scope_github_config_scope_source", table_name="scope_github_config")
    op.drop_constraint(
        "fk_scope_github_config_source_user",
        "scope_github_config",
        type_="foreignkey",
    )
    op.drop_column("scope_github_config", "is_detached")
    op.drop_column("scope_github_config", "source_user_id")
    op.drop_column("scope_github_config", "is_shared_repo")
