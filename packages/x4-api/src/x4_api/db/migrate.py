"""Idempotent schema application. Called from CLI commands and tests."""

from __future__ import annotations

from pathlib import Path

from x4_api.db.connection import apply_schema


def migrate_all(data_dir: Path) -> None:
    apply_schema(data_dir, "static")
    apply_schema(data_dir, "dynamic")
