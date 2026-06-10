"""Idempotent schema application. Called from CLI commands and tests."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from x4_extract.db import apply_schema as apply_extract_schema


def migrate_all(data_dir: Path) -> None:
    apply_extract_schema(data_dir, "static")
    apply_extract_schema(data_dir, "raw")
    _apply_dynamic(data_dir)


def _apply_dynamic(data_dir: Path) -> None:
    sql = (Path(__file__).parent / "schema_dynamic.sql").read_text()
    db_path = data_dir / "dynamic.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(sql)
