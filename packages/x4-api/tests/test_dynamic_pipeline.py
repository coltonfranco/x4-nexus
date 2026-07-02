"""End-to-end test for the dynamic save pipeline + tiered refresh.

Uses the tiny_save.xml.gz fixture (one station, one buy + one sell offer) and the
fresh static/dynamic schemas from the `data_dir` conftest fixture.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from x4_extract.config import ExtractSettings
from x4_extract.db import apply_schema
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

    # Both tiers fired plus the source + stat + pipeline-version guards and the ingest-cost record.
    assert tiers == {
        "source",
        "source_mtime",
        "source_size",
        "structural",
        "volatile",
        "pipeline_version",
        "ingest_ms",
    }


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


def test_carry_forward_seeds_row_state_from_same_game(data_dir: Path, fixtures_dir: Path) -> None:
    """A brand-new save file inherits the previous same-game save's delta baseline, so its
    first ingest diffs against real prior state instead of cold-baselining silently."""
    settings = _settings(data_dir)

    # Predecessor: a normal ingest populates its row_state + save_meta(player_name).
    pred_db = pipeline.run(settings, fixtures_dir / "tiny_save.xml.gz")
    pred = _open(pred_db)
    try:
        pred_count = pred.execute("SELECT COUNT(*) FROM row_state").fetchone()[0]
        player = pred.execute("SELECT player_name FROM save_meta").fetchone()["player_name"]
    finally:
        pred.close()
    assert pred_count > 0
    assert player == "TestPilot"

    # A new save file (different key) starts with an empty, freshly-schema'd DB.
    new_save = data_dir / "quicksave_001.xml.gz"
    new_db = pipeline.dynamic_db_path(settings, new_save)
    apply_schema(settings.data_dir, "dynamic", db_path=new_db)
    conn = _open(new_db)
    try:
        assert pipeline._row_state_is_empty(conn)

        # Same player → seed from the predecessor.
        with conn:
            seeded = pipeline._seed_row_state_from_predecessor(conn, settings, new_save, player)
        assert seeded == pred_count
        assert conn.execute("SELECT COUNT(*) FROM row_state").fetchone()[0] == pred_count
    finally:
        conn.close()

    # A different game (player mismatch) does NOT seed — it falls back to a cold baseline.
    other_save = data_dir / "othergame_001.xml.gz"
    other_db = pipeline.dynamic_db_path(settings, other_save)
    apply_schema(settings.data_dir, "dynamic", db_path=other_db)
    conn = _open(other_db)
    try:
        with conn:
            seeded = pipeline._seed_row_state_from_predecessor(
                conn, settings, other_save, "SomeoneElse"
            )
        assert seeded == 0
        assert pipeline._row_state_is_empty(conn)
    finally:
        conn.close()
