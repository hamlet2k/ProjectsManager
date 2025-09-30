from database import db


# Association table linking tasks and tags
# Using lowercase table name to stay consistent with SQLAlchemy's conventions
# and avoid conflicts with future migrations.
task_tags = db.Table(
    "task_tags",
    db.Column("task_id", db.Integer, db.ForeignKey("task.id"), primary_key=True),
    db.Column("tag_id", db.Integer, db.ForeignKey("tag.id"), primary_key=True),
)


class Tag(db.Model):
    __tablename__ = "tag"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)

    tasks = db.relationship(
        "Task",
        secondary=task_tags,
        back_populates="tags",
        lazy="selectin",
    )

    def to_dict(self):
        return {"id": self.id, "name": self.name}

    def __repr__(self):
        return f"<Tag #{self.name}>"
