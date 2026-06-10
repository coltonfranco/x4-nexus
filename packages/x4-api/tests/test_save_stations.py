"""Test the stations + station_offers collectors via the dispatch loop.

Uses a hand-crafted tiny_save.xml.gz fixture containing exactly one station
with one buy offer (energycells) and one sell offer (microchips).
"""

from __future__ import annotations

from pathlib import Path

from x4_extract.db import open_db
from x4_extract.dynamic.extractors.stations import StationsCollector
from x4_extract.savefile.dispatch import stream_save


def test_dispatch_stations_row_count(data_dir: Path, fixtures_dir: Path) -> None:
    collector = StationsCollector()
    stream_save(fixtures_dir / "tiny_save.xml.gz", collector.register())

    conn = open_db(data_dir)
    try:
        collector.flush(conn)
        conn.commit()

        stations = conn.execute("SELECT * FROM stations").fetchall()
        offers = conn.execute("SELECT * FROM station_offers").fetchall()
    finally:
        conn.close()

    assert len(stations) == 1
    assert len(offers) == 2


def test_dispatch_station_fields(data_dir: Path, fixtures_dir: Path) -> None:
    collector = StationsCollector()
    stream_save(fixtures_dir / "tiny_save.xml.gz", collector.register())

    conn = open_db(data_dir)
    try:
        collector.flush(conn)
        conn.commit()
        row = conn.execute("SELECT * FROM stations WHERE station_id = '[0x100]'").fetchone()
    finally:
        conn.close()

    assert row is not None
    assert row["owner_faction"] == "argon"
    assert row["sector_id"] == "cluster_001_sector001_macro"
    assert row["zone_id"] == "zone001_cluster_001_sector001_macro"
    assert row["is_player_owned"] == 0


def test_dispatch_offer_sides(data_dir: Path, fixtures_dir: Path) -> None:
    collector = StationsCollector()
    stream_save(fixtures_dir / "tiny_save.xml.gz", collector.register())

    conn = open_db(data_dir)
    try:
        collector.flush(conn)
        conn.commit()
        rows = conn.execute(
            "SELECT ware_id, side, price, quantity FROM station_offers ORDER BY side"
        ).fetchall()
    finally:
        conn.close()

    buy = next(r for r in rows if r["side"] == "buy")
    sell = next(r for r in rows if r["side"] == "sell")

    # Prices normalized from centi-credits → credits (fixture 1500/50000 → 15/500).
    assert buy["ware_id"] == "energycells"
    assert buy["price"] == 15
    assert buy["quantity"] == 500

    assert sell["ware_id"] == "microchips"
    assert sell["price"] == 500
    assert sell["quantity"] == 200
