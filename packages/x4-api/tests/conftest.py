"""Shared test fixtures.

Patterns:
    * Static + dynamic DBs are built in tmp_path so tests never collide.
    * Hand-crafted tiny XML in `fixtures/` exercises the extractors. Real X4 saves
      are too big and license-encumbered to commit; use golden-fixture extracts
      for cross-version regression instead.
"""

from __future__ import annotations

import os

# Satisfy pydantic-settings during test collection
os.environ.setdefault("X4C_INSTALL_PATH", "C:/fake/x4")

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from x4_api.db.migrate import migrate_all

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    """Fresh data directory with empty static.db and dynamic.db (schemas applied)."""
    migrate_all(tmp_path)
    return tmp_path


@pytest.fixture
def static_conn(data_dir: Path) -> Iterator[sqlite3.Connection]:
    """Direct connection to a fresh static.db. Use for extractor tests."""
    conn = sqlite3.connect(data_dir / "static.db")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES
