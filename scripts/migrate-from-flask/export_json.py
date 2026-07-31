#!/usr/bin/env python3
"""Export Flask ProjectsManager tables to JSON for Supabase import."""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, text


TABLES = [
    "user",
    "scope",
    "task",
    "tag",
    "task_tags",
    "scope_shares",
    "notifications",
    "scope_github_config",
    "task_github_config",
    "sync_log",
]


def default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, memoryview):
        return {"__bytes_b64__": True, "data": bytes(o).hex()}
    if isinstance(o, bytes):
        return {"__bytes_b64__": True, "data": o.hex()}
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError(type(o))


def main() -> None:
    parser = argparse.ArgumentParser()
    # Default SQLite path assumes you run from repo root after the Flask app
    # was moved to legacy-flask/
    default_sqlite = "sqlite:///legacy-flask/instance/projectsmanager.db"
    if not Path("legacy-flask").exists():
        default_sqlite = "sqlite:///instance/projectsmanager.db"

    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL") or default_sqlite,
    )
    parser.add_argument("--out", default="./export")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    engine = create_engine(args.database_url)
    with engine.connect() as conn:
        for table in TABLES:
            try:
                rows = conn.execute(text(f'SELECT * FROM "{table}"')).mappings().all()
            except Exception:
                # SQLite may not quote the same way; try unquoted
                try:
                    rows = conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
                except Exception as exc:
                    print(f"SKIP {table}: {exc}")
                    continue
            path = out / f"{table}.json"
            data = [dict(r) for r in rows]
            path.write_text(json.dumps(data, default=default, indent=2), encoding="utf-8")
            print(f"Wrote {len(data):>5} rows -> {path}")

    print("Done.")


if __name__ == "__main__":
    main()
