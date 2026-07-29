"""PostgreSQL test database helpers."""

from __future__ import annotations

import os
import uuid
import tempfile
from contextlib import contextmanager
from typing import Iterator, Tuple
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import SQLAlchemyError

load_dotenv()

DEFAULT_ADMIN_URL = "postgresql://localhost:5432/postgres"


def _get_admin_url():
    url_str = os.environ.get("TEST_DATABASE_ADMIN_URL", DEFAULT_ADMIN_URL)
    url = make_url(url_str)
    if not url.database:
        url = url.set(database="postgres")
    return url


def provision_test_database(
    prefix: str = "projectsmanager_test",
) -> Tuple[str | None, str, bool]:
    """Create (or reuse) a PostgreSQL database for tests.

    Returns a tuple of (database_name, database_uri, managed_flag).
    When managed_flag is False the caller must not attempt to drop the database.
    """
    override_url = os.environ.get("TEST_DATABASE_URL")
    if override_url:
        return None, override_url, False

    admin_url = _get_admin_url()
    engine: Engine | None = None

    try:
        engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        db_name = f"{prefix}_{uuid.uuid4().hex}"
        create_statement = text(f'CREATE DATABASE "{db_name}" TEMPLATE template0')

        with engine.connect() as connection:
            connection.execute(create_statement)

        engine.dispose()
        test_url = admin_url.set(database=db_name)
        return db_name, str(test_url), True
    except SQLAlchemyError:
        if engine is not None:
            engine.dispose()
        temp_db = tempfile.NamedTemporaryFile(prefix=f"{prefix}_", suffix=".db", delete=False)
        temp_db_path = temp_db.name
        temp_db.close()
        sqlite_uri = f"sqlite:///{temp_db_path}"
        return f"sqlite:{temp_db_path}", sqlite_uri, True


def cleanup_test_database(database_name: str | None) -> None:
    """Drop a previously created test database if managed."""
    if not database_name:
        return

    if database_name.startswith("sqlite:"):
        path = Path(database_name.split("sqlite:", 1)[1])
        if path.exists():
            path.unlink()
        return

    admin_url = _get_admin_url()
    engine: Engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    terminate_statement = text(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :database_name"
    )
    drop_statement = text(f'DROP DATABASE IF EXISTS "{database_name}"')

    with engine.connect() as connection:
        connection.execute(terminate_statement, {"database_name": database_name})
        connection.execute(drop_statement)

    engine.dispose()


@contextmanager
def temporary_database(prefix: str = "projectsmanager_test") -> Iterator[Tuple[str | None, str]]:
    """Context manager that provisions and cleans up a test database automatically."""
    db_name, uri, managed = provision_test_database(prefix=prefix)
    try:
        yield db_name, uri
    finally:
        if managed:
            cleanup_test_database(db_name)


def rebuild_database_engine(db, database_uri: str):
    """Ensure the SQLAlchemy engine reflects the provided database URI."""

    engines = db.engines
    engine = engines.pop(None, None)

    if engine is not None:
        engine.dispose()

    engine_options = getattr(db, "_engine_options", {}) or {}
    engines[None] = db.create_engine(database_uri, **engine_options)
    return engines[None]


__all__ = [
    "cleanup_test_database",
    "provision_test_database",
    "rebuild_database_engine",
    "temporary_database",
]
