"""Smoke tests for the /equipment endpoints and the /wares category split.

Inserts a tiny hand-crafted catalog covering one of each interesting case:
an engine with stats, a turret with a default bullet, a stat-less missile, a
trade commodity, and an inventory item. Asserts the classification buckets and
stat joins behave.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.api.app import app as app_factory
from x4_api.api.deps import get_settings
from x4_api.config import Settings


@pytest.fixture
def client(data_dir: Path) -> TestClient:
    fast_app = app_factory()
    fast_app.dependency_overrides[get_settings] = lambda: Settings(
        install_path=Path("C:/fake/x4"), data_dir=data_dir
    )
    try:
        yield TestClient(fast_app)
    finally:
        fast_app.dependency_overrides.clear()


def _seed(conn: sqlite3.Connection) -> None:
    conn.executemany(
        "INSERT INTO wares (ware_id, name, group_id, transport, volume, "
        "price_min, price_avg, price_max, storage_class, tags, restriction_licence, icon_path) "
        "VALUES (:ware_id, :name, :group_id, :transport, :volume, :pmin, :pavg, :pmax, "
        ":storage, :tags, :lic, :icon)",
        [
            # engine — equipment, has engine_stats
            dict(ware_id="engine_arg_m_allround_01_mk1", name="ARG M Engine", group_id="engines",
                 transport="equipment", volume=1, pmin=80, pavg=100, pmax=120,
                 storage="container", tags="engine equipment", lic=None, icon=None),
            # turret — equipment, has weapon_stats + bullet
            dict(ware_id="turret_arg_m_gat_01_mk1", name="ARG M Turret", group_id="turrets",
                 transport="equipment", volume=1, pmin=40, pavg=50, pmax=60,
                 storage="container", tags="equipment turret", lic=None, icon=None),
            # missile — equipment, no stat table
            dict(ware_id="missile_dumbfire_light_mk1", name="Light Missile", group_id="missiles",
                 transport="equipment", volume=1, pmin=5, pavg=8, pmax=11,
                 storage="container", tags="equipment missile", lic=None, icon=None),
            # commodity
            dict(ware_id="energycells", name="Energy Cells", group_id="energy",
                 transport="container", volume=1, pmin=10, pavg=16, pmax=22,
                 storage="container", tags="container economy", lic=None, icon=None),
            # inventory
            dict(ware_id="paintmod_neon", name="Neon Paint", group_id=None,
                 transport="inventory", volume=1, pmin=100, pavg=200, pmax=300,
                 storage=None, tags="inventory paintmod", lic=None, icon=None),
        ],
    )
    conn.execute(
        "INSERT INTO equip_engines (engine_id, name, thrust_forward, thrust_reverse, "
        "travel_thrust, boost_thrust, boost_duration, mk) "
        "VALUES ('engine_arg_m_allround_01_mk1_macro', 'ARG M Engine', 900, 700, 30, 5, 12, 1)"
    )
    conn.execute(
        "INSERT INTO equip_bullets (bullet_id, name, speed, lifetime, amount, reload_rate, "
        "damage, shield_damage, hull_damage) "
        "VALUES ('bullet_gat', 'Gat', 2000, 1.5, 3, 10, 55, 60, 50)"
    )
    conn.execute(
        "INSERT INTO equip_weapons (weapon_id, name, class_id, size, mk, rotation_speed, "
        "default_bullet_id) "
        "VALUES ('turret_arg_m_gat_01_mk1_macro', 'ARG M Turret', 'turret', 'm', 1, 180, 'bullet_gat')"
    )
    # Producible: the engine has a build method. Droppable: paint drops from a wreck.
    conn.execute(
        "INSERT INTO ware_production (ware_id, method, time_sec, amount, workforce) "
        "VALUES ('engine_arg_m_allround_01_mk1', 'default', 60, 1, 0)"
    )
    conn.execute(
        "INSERT INTO drop_lists (list_id, category) VALUES ('ship_small_civilian', 'ship')"
    )
    conn.execute(
        "INSERT INTO drop_list_wares (list_id, ware_id, min_amount, max_amount) "
        "VALUES ('ship_small_civilian', 'paintmod_neon', 1, 1)"
    )
    conn.commit()


def test_wares_category_filter_partitions_catalog(client: TestClient, static_conn: sqlite3.Connection) -> None:
    _seed(static_conn)

    equip = client.get("/api/v1/wares?category=equipment").json()
    assert {w["ware_id"] for w in equip} == {
        "engine_arg_m_allround_01_mk1",
        "turret_arg_m_gat_01_mk1",
        "missile_dumbfire_light_mk1",
    }
    assert all(w["category"] == "equipment" for w in equip)

    commodity = client.get("/api/v1/wares?category=commodity").json()
    assert [w["ware_id"] for w in commodity] == ["energycells"]
    assert commodity[0]["price_min"] == 10 and commodity[0]["price_max"] == 22

    inventory = client.get("/api/v1/wares?category=inventory").json()
    assert [w["ware_id"] for w in inventory] == ["paintmod_neon"]
    # paint mod drops but isn't produced; energy cell is neither here.
    assert inventory[0]["has_drops"] is True
    assert inventory[0]["has_production"] is False
    assert commodity[0]["has_drops"] is False


def test_wares_unknown_category_is_422(client: TestClient) -> None:
    assert client.get("/api/v1/wares?category=bogus").status_code == 422


def test_equipment_list_inlines_metadata_and_stats(client: TestClient, static_conn: sqlite3.Connection) -> None:
    _seed(static_conn)

    items = client.get("/api/v1/equipment").json()
    by_id = {e["ware_id"]: e for e in items}
    assert set(by_id) == {
        "engine_arg_m_allround_01_mk1",
        "turret_arg_m_gat_01_mk1",
        "missile_dumbfire_light_mk1",
    }

    engine = by_id["engine_arg_m_allround_01_mk1"]
    assert engine["kind"] == "engine"
    # faction_id is canonicalized from the ware-id race code (arg → argon) by equipment_meta.
    assert engine["size"] == "m" and engine["mk"] == 1 and engine["faction_id"] == "argon"
    assert engine["has_production"] is True
    # Stats are inlined in the list response, not behind a detail fetch.
    assert engine["engine_stats"]["thrust_forward"] == 900

    turret = by_id["turret_arg_m_gat_01_mk1"]
    assert turret["weapon_stats"]["damage"] == 55 and turret["weapon_stats"]["bullet_amount"] == 3

    missile = by_id["missile_dumbfire_light_mk1"]
    assert missile["kind"] == "missile"
    assert missile["engine_stats"] is None
    assert missile["weapon_stats"] is None
    assert missile["has_production"] is False


def test_equipment_list_kind_filter(client: TestClient, static_conn: sqlite3.Connection) -> None:
    _seed(static_conn)
    engines = client.get("/api/v1/equipment?kind=engine").json()
    assert [e["ware_id"] for e in engines] == ["engine_arg_m_allround_01_mk1"]


def test_equipment_detail_engine_stats(client: TestClient, static_conn: sqlite3.Connection) -> None:
    _seed(static_conn)
    detail = client.get("/api/v1/equipment/engine_arg_m_allround_01_mk1").json()
    assert detail["engine_stats"]["thrust_forward"] == 900
    assert detail["engine_stats"]["boost_duration"] == 12
    assert detail["shield_stats"] is None and detail["weapon_stats"] is None


def test_equipment_detail_weapon_resolves_bullet(client: TestClient, static_conn: sqlite3.Connection) -> None:
    _seed(static_conn)
    detail = client.get("/api/v1/equipment/turret_arg_m_gat_01_mk1").json()
    ws = detail["weapon_stats"]
    assert ws["class_id"] == "turret" and ws["size"] == "m"
    assert ws["damage"] == 55 and ws["bullet_amount"] == 3


def test_equipment_detail_404_for_non_equipment(client: TestClient, static_conn: sqlite3.Connection) -> None:
    _seed(static_conn)
    assert client.get("/api/v1/equipment/energycells").status_code == 404
    assert client.get("/api/v1/equipment/nope").status_code == 404
