"""SQLite schema + connection helpers for the extraction pipeline.

`dynamic.db` (per-save) is the primary database the API reads; `static.db` is ATTACHed
as `s`. The poller writes while the API reads, so connections use WAL.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Literal

_SQL_DIR = Path(__file__).parent / "sql"

SchemaName = Literal["raw", "static", "dynamic", "appdata"]


def apply_schema(data_dir: Path, name: SchemaName, *, db_path: Path | None = None) -> None:
    """Apply one of the bundled schema_*.sql files, creating the DB if absent.

    For a DB that already exists the schema SQL is re-executed as a no-op — every
    statement uses ``IF NOT EXISTS``, so this is safe to call unconditionally before
    an ingest (it brings pre-existing DBs up to date with newly-added tables) and
    will never drop data from a live DB that the API is reading.

    ``db_path`` overrides the default ``<data_dir>/<name>.db`` location — used for
    per-save dynamic databases under ``<data_dir>/dynamic/<save_key>.db``.
    """
    sql = (_SQL_DIR / f"schema_{name}.sql").read_text()
    target = db_path if db_path is not None else data_dir / f"{name}.db"
    target.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(target) as conn:
        conn.executescript(sql)


def migrate_all(data_dir: Path) -> None:
    """Apply every schema into `data_dir`. Used by tests for a fresh data directory."""
    apply_schema(data_dir, "static")
    apply_schema(data_dir, "raw")
    apply_schema(data_dir, "dynamic")
    apply_schema(data_dir, "appdata")


def open_db(
    data_dir: Path,
    *,
    dynamic_db: Path | None = None,
    read_only: bool = False,
) -> sqlite3.Connection:
    """Open a dynamic DB and ATTACH static.db AS s.

    `dynamic_db` selects the per-save database; defaults to `<data_dir>/dynamic.db`
    for backward compatibility. If a database file doesn't exist yet, an empty file
    is created — callers that need schema applied should run `apply_schema()` first.
    """
    data_dir.mkdir(parents=True, exist_ok=True)
    dynamic_path = dynamic_db if dynamic_db is not None else data_dir / "dynamic.db"
    static_path = data_dir / "static.db"
    dynamic_path.parent.mkdir(parents=True, exist_ok=True)

    if read_only:
        uri = f"file:{dynamic_path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
    else:
        conn = sqlite3.connect(dynamic_path, check_same_thread=False)
        # WAL is a persistent DB property — set it only on a writable connection so the
        # poller can write while the API reads. Readers inherit it without re-setting.
        conn.execute("PRAGMA journal_mode = WAL")

    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"ATTACH DATABASE '{static_path.as_posix()}' AS s")
    return conn
