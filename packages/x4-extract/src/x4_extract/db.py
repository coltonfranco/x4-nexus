"""SQLite schema helpers for the extraction pipeline."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Literal

_SQL_DIR = Path(__file__).parent / "sql"


def apply_schema(data_dir: Path, name: Literal["raw", "static"]) -> None:
    """Apply one of the bundled schema_*.sql files as a clean rebuild.

    Tries to delete the db file first for a true clean slate.  On Windows the
    file may be locked by a running API server — in that case we drop every
    existing table instead, which achieves the same result without requiring
    the file handle to be released.
    """
    sql = (_SQL_DIR / f"schema_{name}.sql").read_text()
    db_path = data_dir / f"{name}.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            # Windows: file locked by another process (e.g. API server running).
            # Drop all user tables — SQLite drops their indexes automatically.
            with sqlite3.connect(db_path) as conn:
                tables = [
                    row[0] for row in conn.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                    ).fetchall()
                ]
                for table in tables:
                    conn.execute(f"DROP TABLE IF EXISTS [{table}]")

    with sqlite3.connect(db_path) as conn:
        conn.executescript(sql)
