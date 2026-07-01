"""SQLite schema + connection helpers for the extraction pipeline.

`dynamic.db` (per-save) is the primary database the API reads; `static.db` is ATTACHed
as `s`. The poller writes while the API reads, so connections use WAL.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Literal

_SQL_DIR = Path(__file__).parent / "sql"
# Reentrant: callers like ensure_active_dynamic_db hold this around a check-then-create
# and then call apply_schema, which re-acquires it. A plain Lock would self-deadlock.
SCHEMA_LOCK = threading.RLock()

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

    with SCHEMA_LOCK:
        # `with sqlite3.connect(...)` only commits/rolls back — it does NOT close the
        # connection, so the handle (and on Windows its file lock) lingers until GC.
        # Wrap in closing() so the DB file can be deleted/overwritten right after.
        with closing(sqlite3.connect(target)) as conn, conn:
            conn.executescript(sql)
            if name == "dynamic":
                _migrate_dynamic(conn)


def _migrate_dynamic(conn: sqlite3.Connection) -> None:
    """Add columns that were added to the schema after the DB was first created.

    SQLite's ALTER TABLE ADD COLUMN IF NOT EXISTS is not universally available
    (it requires a compile-time flag on some platforms), so migrations run here
    via PRAGMA table_info checks + plain ALTER TABLE.  Each migration is
    idempotent — duplicate-column errors are ignored.
    """
    # station_overview: account_min / account_max (2026-01)
    cols = {r[1] for r in conn.execute("PRAGMA table_info('station_overview')").fetchall()}
    for col in ("account_min", "account_max"):
        if col not in cols:
            try:
                conn.execute(f"ALTER TABLE station_overview ADD COLUMN {col} INTEGER")
            except sqlite3.OperationalError:
                pass  # column already exists (race with another connection)

    # logbook: subcategory (2026-07)
    cols = {r[1] for r in conn.execute("PRAGMA table_info('logbook')").fetchall()}
    if "subcategory" not in cols:
        try:
            conn.execute("ALTER TABLE logbook ADD COLUMN subcategory TEXT")
        except sqlite3.OperationalError:
            pass
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_logbook_subcategory ON logbook(subcategory)")
    except sqlite3.OperationalError:
        pass

    # Reclassify existing logbook entries that haven't been classified yet.
    # Keeps the game's original category as a hint for the fallback logic
    # (entries extracted before the classifier was added won't have
    # game_category in extra_json).
    from x4_extract.dynamic.extractors.logbook import classify_entry

    rows = conn.execute(
        "SELECT id, title, category, extra_json FROM logbook WHERE subcategory IS NULL"
    ).fetchall()
    if rows:
        import json
        updates = []
        for row in rows:
            # Prefer game_category from extra_json (set by new extractor),
            # fall back to the column value (set by old extractor).
            native = row[2]  # category column
            if row[3]:
                try:
                    ej = json.loads(row[3])
                    native = ej.get("game_category", native)
                except Exception:
                    pass
            cat, sub = classify_entry(row[1], native)  # title, native_category
            updates.append((cat, sub, row[0]))  # id
        conn.executemany(
            "UPDATE logbook SET category = ?, subcategory = ? WHERE id = ?",
            updates,
        )


def migrate_all(data_dir: Path) -> None:
    """Apply every schema into `data_dir`. Used by tests for a fresh data directory."""
    apply_schema(data_dir, "static")
    apply_schema(data_dir, "raw")
    apply_schema(data_dir, "dynamic")
    apply_schema(data_dir, "appdata")


def is_dynamic_initialized(db_path: Path) -> bool:
    """Check if the dynamic schema has actually been applied (tables exist).
    
    A bare `Path.exists()` check is vulnerable to race conditions because
    sqlite3 creates an empty file before `conn.executescript()` completes.
    """
    if not db_path.exists():
        return False
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            # Pick a table at the bottom of schema_dynamic.sql
            row = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='player'").fetchone()
            return row is not None
    except sqlite3.OperationalError:
        return False


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
