"""Add scope ownership to tags

Revision ID: 202409090001
Revises: 202409040000
Create Date: 2024-09-09 00:01:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import and_, inspect, select


# revision identifiers, used by Alembic.
revision = "202409090001"
down_revision = "202409040000"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_uniques = {uc.get("name") for uc in inspector.get_unique_constraints("tag")}
    drop_constraint_name = None
    for candidate in ("uq_tag_name", "tag_name_key"):
        if candidate in existing_uniques:
            drop_constraint_name = candidate
            break

    with op.batch_alter_table("tag", recreate="always") as batch_op:
        if drop_constraint_name:
            batch_op.drop_constraint(drop_constraint_name, type_="unique")
        batch_op.add_column(sa.Column("scope_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_tag_scope_id", "scope", ["scope_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_unique_constraint("uq_tag_scope_name", ["scope_id", "name"])

    metadata = sa.MetaData()
    metadata.reflect(bind=bind, only=("tag", "task", "task_tags"))

    tag_table = metadata.tables["tag"]
    task_table = metadata.tables["task"]
    task_tags_table = metadata.tables["task_tags"]

    task_scope_map = {
        row.id: row.scope_id
        for row in bind.execute(select(task_table.c.id, task_table.c.scope_id))
    }

    tag_task_map = {}
    for row in bind.execute(select(task_tags_table.c.tag_id, task_tags_table.c.task_id)):
        tag_task_map.setdefault(row.tag_id, []).append(row.task_id)

    for tag_row in bind.execute(select(tag_table.c.id, tag_table.c.name)):
        associated_tasks = tag_task_map.get(tag_row.id, [])
        scope_ids = sorted(
            {
                task_scope_map.get(task_id)
                for task_id in associated_tasks
                if task_scope_map.get(task_id) is not None
            }
        )
        if not scope_ids:
            continue

        primary_scope = scope_ids[0]
        bind.execute(
            tag_table.update()
            .where(tag_table.c.id == tag_row.id)
            .values(scope_id=primary_scope)
        )

        for extra_scope in scope_ids[1:]:
            result = bind.execute(
                tag_table.insert().values(name=tag_row.name, scope_id=extra_scope)
            )
            new_tag_id = result.inserted_primary_key[0]
            scope_task_ids = [
                task_id
                for task_id in associated_tasks
                if task_scope_map.get(task_id) == extra_scope
            ]
            if scope_task_ids:
                bind.execute(
                    task_tags_table.update()
                    .where(
                        and_(
                            task_tags_table.c.tag_id == tag_row.id,
                            task_tags_table.c.task_id.in_(scope_task_ids),
                        )
                    )
                    .values(tag_id=new_tag_id)
                )


def downgrade():
    bind = op.get_bind()
    metadata = sa.MetaData()
    metadata.reflect(bind=bind, only=("tag", "task_tags"))

    tag_table = metadata.tables["tag"]
    task_tags_table = metadata.tables["task_tags"]

    name_to_canonical = {}
    tag_rows = bind.execute(select(tag_table.c.id, tag_table.c.name).order_by(tag_table.c.id)).fetchall()
    for tag_id, tag_name in tag_rows:
        if tag_name not in name_to_canonical:
            name_to_canonical[tag_name] = tag_id
            continue
        canonical_id = name_to_canonical[tag_name]
        bind.execute(
            task_tags_table.update()
            .where(task_tags_table.c.tag_id == tag_id)
            .values(tag_id=canonical_id)
        )
        bind.execute(tag_table.delete().where(tag_table.c.id == tag_id))

    with op.batch_alter_table("tag", recreate="always") as batch_op:
        batch_op.drop_constraint("fk_tag_scope_id", type_="foreignkey")
        batch_op.drop_constraint("uq_tag_scope_name", type_="unique")
        batch_op.drop_column("scope_id")
        batch_op.create_unique_constraint("uq_tag_name", ["name"])
