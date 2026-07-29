import sqlite3
from pathlib import Path

db = Path(r"F:\Projects\ProjectsManager\instance\projectsmanager.db")
c = sqlite3.connect(db)
print("tables:", [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1")])
for t in ("user", "scope", "task", "tag", "task_tags", "sync_log"):
    try:
        cols = [r[1] for r in c.execute(f"PRAGMA table_info({t})")]
        n = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t} ({n}): {cols}")
    except Exception as e:
        print(t, e)
