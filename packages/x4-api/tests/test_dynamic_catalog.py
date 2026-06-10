"""Tests for the multi-save catalog + active-save resolution."""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path

from x4_extract.config import ExtractSettings
from x4_extract.dynamic import catalog, pipeline


def _save_folder(tmp_path: Path, fixtures_dir: Path) -> Path:
    """Two saves copied from the tiny fixture, with save_002 the newer one."""
    folder = tmp_path / "saves"
    folder.mkdir()
    older = folder / "save_001.xml.gz"
    newer = folder / "save_002.xml.gz"
    shutil.copyfile(fixtures_dir / "tiny_save.xml.gz", older)
    shutil.copyfile(fixtures_dir / "tiny_save.xml.gz", newer)
    past = time.time() - 120
    os.utime(older, (past, past))
    return folder


def _settings(data_dir: Path, folder: Path) -> ExtractSettings:
    return ExtractSettings(data_dir=data_dir, save_path=folder)


def test_list_saves_reads_headers_and_db_status(data_dir: Path, fixtures_dir: Path, tmp_path: Path) -> None:
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    saves = catalog.list_saves(settings)

    assert [s.key for s in saves] == ["save_002", "save_001"]  # newest first
    top = saves[0]
    assert top.save_name == "tiny"
    assert top.player_credits == 500000
    assert top.game_version == "700"
    assert top.db_built is False  # nothing ingested yet

    # Ingest the newest, then its catalog entry reports a current DB.
    pipeline.run(settings, top.path)
    refreshed = {s.key: s for s in catalog.list_saves(settings)}
    assert refreshed["save_002"].db_built is True
    assert refreshed["save_002"].db_current is True
    assert refreshed["save_001"].db_built is False


def test_active_save_defaults_to_newest_then_follows_selection(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    assert catalog.resolve_active_save(settings).name == "save_002.xml.gz"  # newest

    catalog.set_active_key(settings, "save_001")
    assert catalog.resolve_active_save(settings).name == "save_001.xml.gz"


def test_ensure_active_dynamic_db_creates_schema(data_dir: Path, fixtures_dir: Path, tmp_path: Path) -> None:
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    db = catalog.ensure_active_dynamic_db(settings)

    assert db.exists()
    assert db.name == "save_002.db"  # newest save's per-save DB
