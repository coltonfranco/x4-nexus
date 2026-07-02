"""Tests for the production-chain feature.

Two layers, matching how the data is sourced:
  * The /economy/production-chain endpoint over a static-only catalog (no save) — the
    recipe graph, derived depth columns, and method union all come from static.db.
  * The empire-balance domain (`empire_flows`) over a seeded dynamic DB — the per-hour
    production/consumption rates the empire overlay reports.
Market-demand overlay is `ware_market`, already covered by test_economy.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.config import Settings
from x4_api.domain.empire_balance import empire_flows
from x4_extract.db import open_db


@pytest.fixture
def settings(data_dir: Path) -> Settings:
    return Settings(install_path=Path("C:/fake/x4"), data_dir=data_dir)


def _seed_static(data_dir: Path) -> None:
    """A 3-level commodity chain with an alternate hull-parts recipe."""
    conn = open_db(data_dir)
    try:
        # tier = production depth (1 = raw); precomputed by the extractor.
        conn.executemany(
            "INSERT INTO s.wares (ware_id, name, group_id, transport, volume, "
            "price_min, price_avg, price_max, tier) VALUES (?, ?, ?, 'container', 1, ?, ?, ?, ?)",
            [
                ("ore", "Ore", "minerals", 38, 52, 70, 1),
                ("energycells", "Energy Cells", "energy", 11, 16, 24, 1),
                ("scrapmetal", "Scrap Metal", "refined", 28, 41, 58, 1),
                ("refinedmetals", "Refined Metals", "refined", 96, 132, 176, 2),
                ("hullparts", "Hull Parts", "hightech", 162, 226, 300, 3),
            ],
        )
        conn.executemany(
            "INSERT INTO s.ware_production (ware_id, method, time_sec, amount, workforce) "
            "VALUES (?, ?, ?, ?, ?)",
            [
                ("refinedmetals", "default", 150, 88, 200),
                ("hullparts", "default", 100, 73, 90),
                ("hullparts", "recycling", 200, 73, 0),
            ],
        )
        conn.executemany(
            "INSERT INTO s.ware_inputs (ware_id, method, input_ware_id, amount) "
            "VALUES (?, ?, ?, ?)",
            [
                ("refinedmetals", "default", "ore", 240),
                ("refinedmetals", "default", "energycells", 90),
                ("hullparts", "default", "refinedmetals", 280),
                ("hullparts", "default", "energycells", 80),
                ("hullparts", "recycling", "scrapmetal", 75),
                ("hullparts", "recycling", "energycells", 3500),
            ],
        )
        # A production module that makes hull parts (drives the "Produced In" panel).
        conn.execute(
            "INSERT INTO s.modules (module_id, name, kind, produces_ware_id, makerrace) "
            "VALUES ('prod_gen_hullparts_macro', 'Hull Part Production', 'production', 'hullparts', NULL)"
        )
        conn.commit()
    finally:
        conn.close()


def test_production_chain_graph_static(data_dir: Path, client: TestClient) -> None:
    _seed_static(data_dir)
    body = client.get("/api/v1/economy/production-chain").json()

    nodes = {n["ware_id"]: n for n in body["nodes"]}
    assert set(nodes) == {"ore", "energycells", "scrapmetal", "refinedmetals", "hullparts"}

    # Production complexity columns = longest default-input chain.
    assert nodes["ore"]["depth"] == 0
    assert nodes["energycells"]["depth"] == 0
    assert nodes["refinedmetals"]["depth"] == 1
    assert nodes["hullparts"]["depth"] == 2

    # Recipe methods derived from the data, not hardcoded; alternates preserved.
    assert body["methods"] == ["default", "recycling"]
    hp = nodes["hullparts"]
    assert set(hp["recipes"]) == {"default", "recycling"}
    default_inputs = {i["ware_id"]: i["amount"] for i in hp["recipes"]["default"]["inputs"]}
    assert default_inputs == {"refinedmetals": 280, "energycells": 80}

    # Producer modules (which station modules make this ware).
    assert hp["producer_modules"] == [
        {
            "module_id": "prod_gen_hullparts_macro",
            "name": "Hull Part Production",
            "makerrace": None,
            "production_method": None,
        }
    ]
    assert nodes["ore"]["producer_modules"] == []

    # No save → live overlays stay null.
    assert body["has_market"] is False and body["has_empire"] is False
    assert nodes["refinedmetals"]["net_demand"] is None
    assert nodes["refinedmetals"]["empire_production"] is None


def test_empire_flows_rates(data_dir: Path) -> None:
    """Two refined-metals modules → 4224/h made, 11520 ore + 4320 energy/h burned."""
    _seed_static(data_dir)
    conn = open_db(data_dir)
    try:
        conn.execute(
            "INSERT INTO s.modules (module_id, name, produces_ware_id) "
            "VALUES ('prod_refinedmetals_macro', 'Refined Metals Production', 'refinedmetals')"
        )
        conn.execute(
            "INSERT INTO stations (station_id, sector_id, is_player_owned, is_under_construction) "
            "VALUES ('p1', 'S1', 1, 0)"
        )
        conn.execute(
            "INSERT INTO station_modules (station_id, module_id, count) "
            "VALUES ('p1', 'prod_refinedmetals_macro', 2)"
        )
        conn.commit()
        flows = empire_flows(conn)
    finally:
        conn.close()

    assert flows["refinedmetals"][0] == pytest.approx(4224.0)  # 2 x 88 / 150 x 3600
    assert flows["refinedmetals"][1] == pytest.approx(0.0)  # nobody player-owned consumes it
    assert flows["ore"][1] == pytest.approx(11520.0)  # 2 x 240 / 150 x 3600
    assert flows["energycells"][1] == pytest.approx(4320.0)  # 2 x 90 / 150 x 3600


def test_empire_flows_empty_without_player_stations(data_dir: Path) -> None:
    _seed_static(data_dir)
    conn = open_db(data_dir, read_only=True)
    try:
        assert empire_flows(conn) == {}
    finally:
        conn.close()
