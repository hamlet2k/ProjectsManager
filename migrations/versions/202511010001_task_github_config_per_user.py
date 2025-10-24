"""Introduce per-user GitHub configuration for tasks."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "202511010001_task_github_config_per_user"
down_revision = "202510200001_postgres_alignment"
branch_labels = None
depends_on = None

TASK_GITHUB_COLUMN_DEFINITIONS = {
    "github_issue_id": sa.BigInteger(),
    "github_issue_node_id": sa.String(length=100),
    "github_issue_number": sa.Integer(),
    "github_issue_url": sa.String(length=255),
    "github_issue_state": sa.String(length=32),
    "github_repo_id": sa.BigInteger(),
    "github_repo_name": sa.String(length=200),
    "github_repo_owner": sa.String(length=200),
    "github_project_id": sa.String(length=100),
    "github_project_name": sa.String(length=200),
    "github_milestone_number": sa.Integer(),
    "github_milestone_title": sa.String(length=200),
    "github_milestone_due_on": sa.DateTime(),
}
TASK_GITHUB_COLUMNS = list(TASK_GITHUB_COLUMN_DEFINITIONS.keys())


def upgrade() -> None:
    op.create_table(
        "task_github_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("task.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("github_issue_id", sa.BigInteger(), nullable=True),
        sa.Column("github_issue_node_id", sa.String(length=100), nullable=True),
        sa.Column("github_issue_number", sa.Integer(), nullable=True),
        sa.Column("github_issue_url", sa.String(length=255), nullable=True),
        sa.Column("github_issue_state", sa.String(length=32), nullable=True),
        sa.Column("github_repo_id", sa.BigInteger(), nullable=True),
        sa.Column("github_repo_name", sa.String(length=200), nullable=True),
        sa.Column("github_repo_owner", sa.String(length=200), nullable=True),
        sa.Column("github_project_id", sa.String(length=100), nullable=True),
        sa.Column("github_project_name", sa.String(length=200), nullable=True),
        sa.Column("github_milestone_number", sa.Integer(), nullable=True),
        sa.Column("github_milestone_title", sa.String(length=200), nullable=True),
        sa.Column("github_milestone_due_on", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_unique_constraint(
        "uq_task_github_config_task_user",
        "task_github_config",
        ["task_id", "user_id"],
    )
    op.create_index(
        "ix_task_github_config_task_user",
        "task_github_config",
        ["task_id", "user_id"],
    )

    connection = op.get_bind()
    task_columns = [
        sa.Column("id", sa.Integer),
        sa.Column("owner_id", sa.Integer),
    ] + [sa.Column(column, TASK_GITHUB_COLUMN_DEFINITIONS[column]) for column in TASK_GITHUB_COLUMNS]
    task_table = sa.sql.table("task", *task_columns)
    config_columns = [
        sa.Column("task_id", sa.Integer),
        sa.Column("user_id", sa.Integer),
    ] + [sa.Column(column, TASK_GITHUB_COLUMN_DEFINITIONS[column]) for column in TASK_GITHUB_COLUMNS]
    config_table = sa.sql.table("task_github_config", *config_columns)

    rows = connection.execute(sa.select(task_table.c)).fetchall()
    inserts = []
    for row in rows:
        owner_id = row.owner_id
        if owner_id is None:
            continue
        values = {column: getattr(row, column) for column in TASK_GITHUB_COLUMNS}
        if not any(values.values()):
            continue
        payload = {"task_id": row.id, "user_id": owner_id}
        payload.update(values)
        inserts.append(payload)
    if inserts:
        connection.execute(config_table.insert(), inserts)

    with op.batch_alter_table("task") as batch_op:
        for column in TASK_GITHUB_COLUMNS:
            batch_op.drop_column(column)


def downgrade() -> None:
    with op.batch_alter_table("task") as batch_op:
        batch_op.add_column(sa.Column("github_issue_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_issue_node_id", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("github_issue_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_issue_url", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("github_issue_state", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("github_repo_id", sa.BigInteger(), nullable=True))
        batch_op.add_column(sa.Column("github_repo_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_repo_owner", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_project_id", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("github_project_name", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_title", sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column("github_milestone_due_on", sa.DateTime(), nullable=True))

    connection = op.get_bind()
    task_table = sa.sql.table(
        "task",
        sa.Column("id", sa.Integer),
        sa.Column("owner_id", sa.Integer),
    )
    config_columns = [
        sa.Column("task_id", sa.Integer),
        sa.Column("user_id", sa.Integer),
    ] + [sa.Column(column, TASK_GITHUB_COLUMN_DEFINITIONS[column]) for column in TASK_GITHUB_COLUMNS]
    config_table = sa.sql.table("task_github_config", *config_columns)

    join_stmt = (
        sa.select(task_table.c.id, task_table.c.owner_id, config_table)
        .select_from(
            config_table.join(task_table, config_table.c.task_id == task_table.c.id)
        )
    )
    rows = connection.execute(join_stmt).fetchall()
    for row in rows:
        owner_id = row.owner_id
        if owner_id is not None and owner_id != row.user_id:
            continue
        updates = {column: getattr(row, column) for column in TASK_GITHUB_COLUMNS}
        connection.execute(
            task_table.update()
            .where(task_table.c.id == row.task_id)
            .values(**updates)
        )

    op.drop_index("ix_task_github_config_task_user", table_name="task_github_config")
    op.drop_constraint("uq_task_github_config_task_user", "task_github_config", type_="unique")
    op.drop_table("task_github_config")
