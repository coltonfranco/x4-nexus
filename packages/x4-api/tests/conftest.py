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
# Never start the in-process save watcher during tests (it would target the real save folder).
os.environ.setdefault("X4C_BACKGROUND_REFRESH", "false")

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.api.app import app as app_factory
from x4_api.api.deps import get_settings
from x4_api.config import Settings
from x4_extract.db import migrate_all

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    """Fresh data directory with empty static.db and dynamic.db (schemas applied)."""
    migrate_all(tmp_path)
    return tmp_path


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """A TestClient wired to a fresh app instance with `settings` dependency-overridden.

    Depends on a `settings` fixture that each test module defines itself (its
    `Settings(...)` construction varies — install_path, save_path, etc.).
    """
    fast_app = app_factory()
    fast_app.dependency_overrides[get_settings] = lambda: settings
    try:
        yield TestClient(fast_app)
    finally:
        fast_app.dependency_overrides.clear()


@pytest.fixture
def static_conn(data_dir: Path) -> Iterator[sqlite3.Connection]:
    """Direct connection to a fresh static.db (reference layer). Use for extractor tests."""
    conn = sqlite3.connect(data_dir / "static.db")
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES
