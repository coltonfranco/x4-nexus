"""Test the stations + station_offers collectors via the dispatch loop.

Uses a hand-crafted tiny_save.xml.gz fixture containing exactly one station
with one buy offer (energycells) and one sell offer (microchips).
"""

from __future__ import annotations

import gzip
from pathlib import Path

from x4_extract.db import open_db
from x4_extract.dynamic.collector import Tier
from x4_extract.dynamic.extractors.stations import StationsCollector
from x4_extract.savefile.dispatch import stream_save

# A player station nested at the real depth (15) with composition: construction/sequence
# (current modules), workforces, account, and a global build task (full plan) referencing
# it by component id. Mirrors the structure probed in docs/save-structure.md.
_COMPOSITION_SAVE = b"""<?xml version="1.0"?>
<savegame>
  <universe>
    <buildtasks>
      <inprogress>
        <build id="[0xB1]" type="build" component="[0x200]" faction="player">
          <sequence>
            <entry index="1" macro="prod_ter_energycells_macro"/>
            <entry index="2" macro="prod_ter_energycells_macro"/>
            <entry index="3" macro="storage_ter_s_container_01_macro"/>
            <entry index="4" macro="struct_ter_cross_01_macro"/>
          </sequence>
        </build>
      </inprogress>
    </buildtasks>
    <component class="galaxy"><connections><connection><component class="cluster">
      <connections><connection><component class="sector" macro="cluster_001_sector001_macro">
        <connections><connection><component class="zone" macro="zone001_cluster_001_sector001_macro">
          <connections><connection>
            <component class="station" id="[0x200]" macro="station_gen_factory_base_01_macro"
                       code="PMS-001" owner="player" knownto="player">
              <offset><position x="1000" z="2000"/></offset>
              <construction>
                <sequence>
                  <entry id="[0xE1]" index="1" macro="prod_ter_energycells_macro" fixed="1">
                    <offset><position x="100" y="0" z="200"/></offset>
                  </entry>
                  <entry id="[0xE2]" index="2" macro="storage_ter_s_container_01_macro"
                         connection="connectionsnap001">
                    <predecessor index="1" connection="connectionsnap002"/>
                    <offset><position x="100" z="-300"/></offset>
                  </entry>
                </sequence>
              </construction>
              <workforces lasttime="100">
                <workforce race="terran" amount="100"/>
                <bonus value="0.5"/>
              </workforces>
              <production endtime="200" originalproduct="energycells"/>
              <account id="[0x1]" amount="250000" own="1"/>
              <buildtasks build="[0xB1]"/>
            </component>
          </connection></connections>
        </component></connection></connections>
      </component></connection></connections>
    </component></connection></connections></component>
  </universe>
</savegame>
"""


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
    # Zone-relative offset captured from <offset><position>.
    assert row["x"] == 1000
    assert row["z"] == 2000


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


def _ingest_composition(tmp_path: Path, data_dir: Path) -> StationsCollector:
    save = tmp_path / "composition.xml.gz"
    with gzip.open(save, "wb") as gz:
        gz.write(_COMPOSITION_SAVE)
    collector = StationsCollector()
    stream_save(save, collector.register())
    conn = open_db(data_dir)
    try:
        collector.flush(conn, Tier.STRUCTURAL)
        conn.commit()
    finally:
        conn.close()
    return collector


def test_station_modules_from_construction_sequence(tmp_path: Path, data_dir: Path) -> None:
    _ingest_composition(tmp_path, data_dir)
    conn = open_db(data_dir)
    try:
        rows = {
            r["macro"]: r["count"]
            for r in conn.execute(
                "SELECT macro, count FROM station_modules WHERE station_id = '[0x200]'"
            )
        }
    finally:
        conn.close()
    # Current modules come from the station's construction/sequence (not the build plan).
    assert rows == {"prod_ter_energycells_macro": 1, "storage_ter_s_container_01_macro": 1}


def test_station_build_plan_and_overview(tmp_path: Path, data_dir: Path) -> None:
    _ingest_composition(tmp_path, data_dir)
    conn = open_db(data_dir)
    try:
        plan = {
            r["macro"]: r["count"]
            for r in conn.execute(
                "SELECT macro, count FROM station_build_plan WHERE station_id = '[0x200]'"
            )
        }
        ov = conn.execute("SELECT * FROM station_overview WHERE station_id = '[0x200]'").fetchone()
        station = conn.execute(
            "SELECT is_under_construction, build_pct FROM stations WHERE station_id = '[0x200]'"
        ).fetchone()
    finally:
        conn.close()

    # Full plan comes from the in-progress build task (energycells x2, storage x1, struct x1).
    assert plan == {
        "prod_ter_energycells_macro": 2,
        "storage_ter_s_container_01_macro": 1,
        "struct_ter_cross_01_macro": 1,
    }
    assert ov["module_count"] == 2
    assert ov["planned_module_count"] == 4
    assert ov["account_amount"] == 250000
    assert ov["workforce_current"] == 100
    assert ov["workforce_bonus"] == 0.5
    assert ov["production_product"] == "energycells"

    assert station["is_under_construction"] == 1
    # build_pct = realized (2) / planned (4) = 50%.
    assert station["build_pct"] == 50.0


def test_station_construction_entries_layout(tmp_path: Path, data_dir: Path) -> None:
    _ingest_composition(tmp_path, data_dir)
    conn = open_db(data_dir)
    try:
        rows = {
            r["entry_id"]: dict(r)
            for r in conn.execute(
                "SELECT * FROM station_construction_entries WHERE station_id = '[0x200]'"
            )
        }
    finally:
        conn.close()

    # One row per placed module in the station's construction/sequence (not the build plan).
    assert set(rows) == {"[0xE1]", "[0xE2]"}

    root = rows["[0xE1]"]
    assert root["entry_index"] == 1
    assert root["macro"] == "prod_ter_energycells_macro"
    assert root["predecessor_index"] is None  # the fixed root has no parent
    assert root["pos_x"] == 100
    assert root["pos_y"] == 0
    assert root["pos_z"] == 200

    child = rows["[0xE2]"]
    assert child["entry_index"] == 2
    # The spanning tree: child attaches to the root (index 1).
    assert child["predecessor_index"] == 1
    assert child["connection"] == "connectionsnap001"
    assert child["predecessor_connection"] == "connectionsnap002"
    assert child["pos_x"] == 100
    assert child["pos_y"] is None  # absent axis → NULL
    assert child["pos_z"] == -300
