"""Test the sector_resources collector via the dispatch loop.

Uses the shared tiny_save.xml.gz fixture, whose single sector carries a
<resourceareas> block with two areas: ore (one area) and silicon (split across two
areas, to exercise per-(sector,ware) aggregation).
"""

from __future__ import annotations

from pathlib import Path

from x4_extract.db import open_db
from x4_extract.dynamic.extractors.resources import ResourceAreasCollector
from x4_extract.savefile.dispatch import stream_save


def _collect(data_dir: Path, fixtures_dir: Path) -> list:
    collector = ResourceAreasCollector()
    stream_save(fixtures_dir / "tiny_save.xml.gz", collector.register())
    conn = open_db(data_dir)
    try:
        collector.flush(conn)
        conn.commit()
        rows = conn.execute(
            "SELECT sector_id, ware, current, max, yield_tier, recharge_time "
            "FROM sector_resources ORDER BY ware"
        ).fetchall()
    finally:
        conn.close()
    return rows


def test_resources_row_count_and_sector(data_dir: Path, fixtures_dir: Path) -> None:
    rows = _collect(data_dir, fixtures_dir)
    assert len(rows) == 2  # ore, silicon
    assert all(r["sector_id"] == "cluster_001_sector001_macro" for r in rows)


def test_resources_aggregated_amounts(data_dir: Path, fixtures_dir: Path) -> None:
    rows = {r["ware"]: r for r in _collect(data_dir, fixtures_dir)}

    assert rows["ore"]["current"] == 4689
    assert rows["ore"]["max"] == 7895
    assert rows["ore"]["yield_tier"] == "low"

    # Silicon spans two areas (14080 + 5000) / (23694 + 10000).
    assert rows["silicon"]["current"] == 19080
    assert rows["silicon"]["max"] == 33694
    assert rows["silicon"]["yield_tier"] == "lowplus"
    assert rows["silicon"]["recharge_time"] == 108000
