"""FastAPI dependencies. The only place HTTP layer touches the DB layer."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends
from x4_extract.db import open_db
from x4_extract.dynamic.catalog import ensure_active_dynamic_db

from x4_api.config import Settings, settings


def get_settings() -> Settings:
    return settings


def get_db(s: Settings = Depends(get_settings)) -> Iterator[sqlite3.Connection]:
    """Per-request read-only connection against the active save's dynamic DB.

    The dynamic DB is per-save (`dynamic/<save_key>.db`); the active save is the
    user-selected one or the newest. `ensure_active_dynamic_db` guarantees the file
    exists (empty schema if never ingested) so static-only endpoints always work.

    Marked ``include_in_schema=False`` because Pydantic v2 can't resolve
    ``Annotated[sqlite3.Connection, Depends(get_db)]`` when ``from __future__ import
    annotations`` is active — the ForwardRef to ``Annotated`` itself fails to
    materialize during JSON-schema generation.
    """
    dynamic_db = ensure_active_dynamic_db(s)
    conn = open_db(s.data_dir, dynamic_db=dynamic_db, read_only=True)
    try:
        yield conn
    finally:
        conn.close()

