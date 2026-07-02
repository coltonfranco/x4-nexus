"""Small shared SQLite helpers used across the v1 route modules."""

from __future__ import annotations

import sqlite3
from typing import Any, cast

from fastapi import HTTPException


def table_exists(conn: sqlite3.Connection, name: str) -> bool:
    """Whether a table (or attached-schema table, e.g. `s.wares`) exists.

    Used to detect not-yet-ingested saves — the dynamic DB is created with an empty
    schema before the first save is parsed, so plain queries against its tables would
    otherwise raise instead of letting the caller return an empty/placeholder response.
    """
    return bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=:name",
            {"name": name},
        ).fetchone()
    )


def fetch_one_or_404(
    conn: sqlite3.Connection,
    sql: str,
    params: dict[str, Any],
    detail: str,
) -> sqlite3.Row:
    """Run a single-row query, raising 404 with `detail` if it has no match."""
    row = conn.execute(sql, params).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=detail)
    return cast(sqlite3.Row, row)


def localized_text_sql(col: str) -> str:
    """SQL fragment resolving an in-game `{page_id,text_id}` text reference.

    Ship/station names are sometimes stored as a `{page_id,text_id}` reference into
    `s.texts` rather than a literal string; this returns the `SELECT ... FROM s.texts`
    subquery that looks it up. Callers wrap it in their own `CASE WHEN col LIKE
    '{%,%}' THEN (this) ELSE ... END` with a fallback chain that varies per call site.
    """
    return (
        f"(SELECT text FROM s.texts WHERE "
        f"page_id = CAST(SUBSTR({col}, 2, INSTR({col}, ',') - 2) AS INTEGER) AND "
        f"text_id = CAST(SUBSTR({col}, INSTR({col}, ',') + 1, "
        f"LENGTH({col}) - INSTR({col}, ',') - 1) AS INTEGER))"
    )
