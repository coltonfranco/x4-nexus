"""SQLite connection helper.

dynamic.db is the primary database; static.db is ATTACHed as `s`. This split lets a
patch-time rebuild of static state happen without touching the save extract.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path


def open_db(data_dir: Path, *, read_only: bool = False) -> sqlite3.Connection:
    """Open dynamic.db and ATTACH static.db AS s.

    If a database file doesn't exist yet, an empty file is created — callers that need
    schema applied should run `apply_schema()` first.
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    dynamic_path = data_dir / "dynamic.db"
    static_path = data_dir / "static.db"

    if read_only:
        uri = f"file:{dynamic_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
    else:
        conn = sqlite3.connect(dynamic_path)

    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"ATTACH DATABASE '{static_path.as_posix()}' AS s")
    return conn


def apply_schema(data_dir: Path, schema_name: str) -> None:
    """Apply one of the bundled schema_*.sql files. Idempotent (uses IF NOT EXISTS)."""
    schema_path = Path(__file__).parent / f"schema_{schema_name}.sql"
    sql = schema_path.read_text()
    db_path = data_dir / f"{schema_name}.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(sql)
