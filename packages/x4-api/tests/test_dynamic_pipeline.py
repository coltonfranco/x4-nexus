"""End-to-end test for the dynamic save pipeline + tiered refresh.

Uses the tiny_save.xml.gz fixture (one station, one buy + one sell offer) and the
fresh static/dynamic schemas from the `data_dir` conftest fixture.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from x4_extract.config import ExtractSettings
from x4_extract.dynamic import pipeline


def _settings(data_dir: Path) -> ExtractSettings:
    # install_path comes from X4C_INSTALL_PATH set in conftest.
    return ExtractSettings(data_dir=data_dir)


def _open(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def test_pipeline_ingests_stations_meta_and_state(data_dir: Path, fixtures_dir: Path) -> None:
    settings = _settings(data_dir)
    db_path = pipeline.run(settings, fixtures_dir / "tiny_save.xml.gz")

    assert db_path == data_dir / "dynamic" / "tiny_save.db"
    assert db_path.exists()

    conn = _open(db_path)
    try:
        stations = conn.execute("SELECT * FROM stations").fetchall()
        offers = conn.execute("SELECT side, ware_id FROM station_offers ORDER BY side").fetchall()
        meta = conn.execute("SELECT * FROM save_meta").fetchone()
        tiers = {r["tier"] for r in conn.execute("SELECT tier FROM ingest_state")}
    finally:
        conn.close()

    assert len(stations) == 1
    assert stations[0]["owner_faction"] == "argon"
    assert stations[0]["code"] == "ARG-001"
    # Unmapped station attrs are preserved, not discarded.
    assert "nameindex" in (stations[0]["extra_json"] or "")

    assert [r["side"] for r in offers] == ["buy", "sell"]

    assert meta is not None
    assert meta["save_name"] == "tiny"
    assert meta["in_game_time_sec"] == 1000  # int(float("1000.5"))
    assert meta["game_version"] == "700"
    assert meta["game_build"] == "12345"
    assert meta["player_name"] == "TestPilot"
    assert meta["player_credits"] == 500000
    assert meta["real_time_iso"] is not None  # unix date → ISO

    # Both tiers fired plus the source + pipeline-version guards.
    assert tiers == {"source", "structural", "volatile", "pipeline_version"}


def test_pipeline_skips_unchanged_source(data_dir: Path, fixtures_dir: Path) -> None:
    settings = _settings(data_dir)
    save = fixtures_dir / "tiny_save.xml.gz"

    first = pipeline.run(settings, save)
    second = pipeline.run(settings, save)  # unchanged → early return, no duplication

    assert first == second
    conn = _open(second)
    try:
        (count,) = conn.execute("SELECT COUNT(*) FROM stations").fetchone()
    finally:
        conn.close()
    assert count == 1


def test_pipeline_reingests_on_version_bump(data_dir: Path, fixtures_dir: Path) -> None:
    settings = _settings(data_dir)
    save = fixtures_dir / "tiny_save.xml.gz"
    db = pipeline.run(settings, save)

    # Simulate a DB ingested under an older pipeline: clear the version stamp and wipe a
    # table the old pipeline never populated. An unchanged save must still re-ingest.
    conn = _open(db)
    conn.execute("DELETE FROM ingest_state WHERE tier = 'pipeline_version'")
    conn.execute("DELETE FROM sector_resources")
    conn.commit()
    conn.close()

    pipeline.run(settings, save)

    conn = _open(db)
    try:
        (count,) = conn.execute("SELECT COUNT(*) FROM sector_resources").fetchone()
    finally:
        conn.close()
    assert count == 2  # ore + silicon repopulated despite the save being unchanged
