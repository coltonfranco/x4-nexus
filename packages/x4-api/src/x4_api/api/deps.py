"""FastAPI dependencies. The only place HTTP layer touches the DB layer."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from fastapi import Depends

from x4_api.config import Settings, settings
from x4_api.db.connection import open_db


def get_settings() -> Settings:
    return settings


def get_db(s: Settings = Depends(get_settings)) -> Iterator[sqlite3.Connection]:
    """Per-request connection. Read-only by default; mutating endpoints open their own."""
    conn = open_db(s.data_dir, read_only=True)
    try:
        yield conn
    finally:
        conn.close()
