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
    # Both aged past the settle window so the catalog treats them as quiescent (fully written)
    # and reads their headers; save_002 stays newest. A fresh-off-the-copy mtime would (rightly)
    # be skipped as possibly mid-write, mirroring how the catalog avoids opening a live save.
    now = time.time()
    os.utime(older, (now - 120, now - 120))
    os.utime(newer, (now - 30, now - 30))
    return folder


def _settings(data_dir: Path, folder: Path) -> ExtractSettings:
    return ExtractSettings(data_dir=data_dir, save_path=folder)


def test_list_saves_reads_headers_and_db_status(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
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


def test_db_is_current_short_circuits_on_stat(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    """The freshness check must answer from a pure stat() — without opening the save file —
    when mtime+size are unchanged. Proven by clobbering the stored content fingerprint: if the
    check still reports current, it never consulted (nor opened) the file for a fingerprint."""
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)
    save = folder / "save_002.xml.gz"

    db = pipeline.run(settings, save)
    assert catalog.db_is_current(settings, save) is True

    # Corrupt the content fingerprint but leave the stored stat intact.
    import sqlite3

    with sqlite3.connect(db) as conn:
        conn.execute("UPDATE ingest_state SET fingerprint = 'stale' WHERE tier = 'source'")
    # Still current → the stat gate answered, the bad fingerprint was never reached.
    assert catalog.db_is_current(settings, save) is True

    # Touch the file so stat moves; now the (corrupt) fingerprint path runs and reports stale.
    future = time.time() + 10
    os.utime(save, (future, future))
    assert catalog.db_is_current(settings, save) is False


def test_active_save_defaults_to_newest_then_follows_selection(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    assert catalog.resolve_active_save(settings).name == "save_002.xml.gz"  # newest

    catalog.set_active_key(settings, "save_001")
    assert catalog.resolve_active_save(settings).name == "save_001.xml.gz"


def test_ensure_active_db_serves_last_current_while_newest_ingests(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    """Following latest: when the newest save isn't ingested yet, serve the most recent save
    whose DB is current instead of an empty one — so the dashboard doesn't blank on every save."""
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    # Only the older save_001 is ingested; the newest (save_002) has no DB yet.
    pipeline.run(settings, folder / "save_001.xml.gz")
    assert catalog.resolve_active_save(settings).name == "save_002.xml.gz"  # newest, unbuilt

    # Should hand back the current save_001 DB, not a blank save_002 DB.
    assert catalog.ensure_active_dynamic_db(settings).name == "save_001.db"

    # Once the newest save is ingested, it takes over.
    pipeline.run(settings, folder / "save_002.xml.gz")
    assert catalog.ensure_active_dynamic_db(settings).name == "save_002.db"


def test_ensure_active_db_skips_stale_reused_slot(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    """The regression: X4 overwrites a rotating slot, so the newest *file* has a DB holding the
    slot's previous contents until re-ingested. Serving must skip that stale DB (its fingerprint
    no longer matches the file) and keep serving the most recent *current* save — not revert."""
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    # Both ingested and current; save_002 is newest.
    pipeline.run(settings, folder / "save_001.xml.gz")
    pipeline.run(settings, folder / "save_002.xml.gz")
    assert catalog.ensure_active_dynamic_db(settings).name == "save_002.db"

    # X4 rewrites the save_002 slot with new content: the file's bytes (and stat) change, so its
    # existing DB — still holding the slot's previous snapshot — is now stale.
    save_002 = folder / "save_002.xml.gz"
    with save_002.open("ab") as f:
        f.write(b"\x00")  # different size + tail → fingerprint no longer matches the DB
    future = time.time() + 10
    os.utime(save_002, (future, future))
    assert catalog.db_is_current(settings, save_002) is False

    # Newest file's DB is stale → serve the last current save (save_001), never the old snapshot.
    assert catalog.ensure_active_dynamic_db(settings).name == "save_001.db"


def test_ensure_active_db_serves_stale_fallback_on_cold_start(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    """Cold start: the newest file is a fresh un-ingested quicksave, and the only ingested DB
    belongs to a save from a previous session (far beyond the rotation window). Rather than
    blanking the dashboard, serving hands back that last-known DB and advances to the newest
    in place once it ingests (the "stale-then-update" behavior chosen over "blank-until-fresh")."""
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    # save_001 is the only ingested save, but it's well beyond the fallback window behind the
    # newest file (save_002) — a previous-session leftover, not a current rotation slot.
    pipeline.run(settings, folder / "save_001.xml.gz")
    long_ago = time.time() - settings.serve_fallback_window_sec - 600
    os.utime(folder / "save_001.xml.gz", (long_ago, long_ago))

    # Newest (save_002) isn't ingested → serve the last save with any data instead of blanking.
    assert catalog.ensure_active_dynamic_db(settings).name == "save_001.db"

    # Once the newest save ingests, it takes over.
    pipeline.run(settings, folder / "save_002.xml.gz")
    assert catalog.ensure_active_dynamic_db(settings).name == "save_002.db"


def test_ensure_active_dynamic_db_empty_until_first_ingest(
    data_dir: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    folder = _save_folder(tmp_path, fixtures_dir)
    settings = _settings(data_dir, folder)

    # Nothing ingested yet → no save has a current DB → serve the shared empty DB (static-only).
    db = catalog.ensure_active_dynamic_db(settings)
    assert db.exists()
    assert db.name == "_empty.db"

    # After the newest is ingested, it becomes the served DB.
    pipeline.run(settings, folder / "save_002.xml.gz")
    assert catalog.ensure_active_dynamic_db(settings).name == "save_002.db"
