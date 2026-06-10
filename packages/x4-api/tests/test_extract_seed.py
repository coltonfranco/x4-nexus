"""Tests for seed.db extraction: faction relations + NPC stations + derived ownership.

Exercises the same wiring the static pipeline uses — a seed.db connection with static.db
ATTACHed as `s` so the derivations can map god.xml's lowercase sector macros to the
canonical PascalCase ids and look up clusters.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from x4_extract.static import factions, npc_stations

GOD_XML = b"""<?xml version="1.0"?>
<god>
  <stations>
    <station id="[0x1]" owner="argon" race="argon">
      <station><select tags="[shipyard]"/></station>
      <location class="sector" macro="cluster_01_sector001_macro"/>
    </station>
    <station id="[0x2]" owner="teladi" race="teladi">
      <station><select tags="[tradestation]"/></station>
      <location class="sector" macro="cluster_01_sector001_macro"/>
    </station>
  </stations>
</god>
"""

FACTIONS_XML = b"""<?xml version="1.0"?>
<factions>
  <faction id="argon"><relations><relation faction="teladi" relation="0.3"/></relations></faction>
</factions>
"""


def _seed_conn(data_dir: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(data_dir / "seed.db")
    conn.execute(f"ATTACH DATABASE '{(data_dir / 'static.db').as_posix()}' AS s")
    return conn


def test_npc_stations_write_derives_canonical_ownership(data_dir: Path) -> None:
    # Reference sector in static.db (PascalCase canonical id).
    static = sqlite3.connect(data_dir / "static.db")
    static.execute(
        "INSERT INTO sectors (sector_id, cluster_id, name) "
        "VALUES ('Cluster_01_Sector001_macro', 'Cluster_01_macro', 'S1')"
    )
    static.commit()
    static.close()

    result = npc_stations.extract(GOD_XML)
    seed = _seed_conn(data_dir)
    try:
        with seed:
            npc_stations.write(seed, result)

        assert seed.execute("SELECT COUNT(*) FROM npc_stations").fetchone()[0] == 2

        # Shipyard (argon) outranks tradestation (teladi) for the sector.
        owners = dict(seed.execute("SELECT sector_id, owner_faction FROM sector_ownership"))
        assert owners == {"Cluster_01_Sector001_macro": "argon"}

        clusters = dict(seed.execute("SELECT cluster_id, owner_faction FROM cluster_ownership"))
        assert clusters == {"Cluster_01_macro": "argon"}
    finally:
        seed.close()


def test_write_relations_lands_in_seed(data_dir: Path) -> None:
    result = factions.extract(FACTIONS_XML)
    seed = sqlite3.connect(data_dir / "seed.db")
    try:
        with seed:
            factions.write_relations(seed, result)
        rows = seed.execute(
            "SELECT faction_id, other_faction_id, initial_relation FROM faction_relations"
        ).fetchall()
        assert rows == [("argon", "teladi", 0.3)]
    finally:
        seed.close()
