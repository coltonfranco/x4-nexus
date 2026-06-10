"""Integration tests for the dynamic (save-state) API endpoints.

Builds a real per-save DB from the tiny fixture, activates it, and exercises the
saves / player / stations / fleet endpoints plus the faction-relation COALESCE overlay.
"""

from __future__ import annotations

import shutil
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.api.app import app as app_factory
from x4_api.api.deps import get_settings
from x4_api.config import Settings


@pytest.fixture
def client(data_dir: Path, fixtures_dir: Path) -> Iterator[TestClient]:
    folder = data_dir / "saves"
    folder.mkdir()
    shutil.copyfile(fixtures_dir / "tiny_save.xml.gz", folder / "save_001.xml.gz")

    settings = Settings(install_path=Path("C:/fake/x4"), data_dir=data_dir, save_path=folder)
    fast_app = app_factory()
    fast_app.dependency_overrides[get_settings] = lambda: settings
    try:
        yield TestClient(fast_app)
    finally:
        fast_app.dependency_overrides.clear()


def _activate(client: TestClient) -> None:
    resp = client.post("/api/v1/saves/save_001/activate")
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is True


def test_saves_list_and_activate(client: TestClient) -> None:
    saves = client.get("/api/v1/saves").json()
    assert [s["key"] for s in saves] == ["save_001"]
    assert saves[0]["save_name"] == "tiny"
    assert saves[0]["db_built"] is False

    _activate(client)

    after = {s["key"]: s for s in client.get("/api/v1/saves").json()}
    assert after["save_001"]["db_built"] is True
    assert after["save_001"]["db_current"] is True
    assert client.get("/api/v1/saves/active").json()["key"] == "save_001"


def test_player_endpoints(client: TestClient) -> None:
    assert client.get("/api/v1/player").status_code == 404  # nothing ingested yet
    _activate(client)

    player = client.get("/api/v1/player").json()
    assert player["name"] == "TestPilot"
    assert player["credits"] == 500000

    bps = {b["ware_id"] for b in client.get("/api/v1/player/blueprints").json()}
    assert bps == {"module_test_01", "ship_test_02"}

    lics = {(x["licence_type"], x["faction_id"]) for x in client.get("/api/v1/player/licences").json()}
    assert ("capitalship", "argon") in lics


def test_live_stations_and_fleet(client: TestClient) -> None:
    _activate(client)

    stations = client.get("/api/v1/stations").json()
    assert len(stations) == 1
    sid = stations[0]["station_id"]
    assert stations[0]["owner_faction"] == "argon"

    offers = client.get(f"/api/v1/stations/{sid}/offers").json()
    assert {o["side"] for o in offers} == {"buy", "sell"}

    fleet = client.get("/api/v1/fleet?player_only=true").json()
    assert len(fleet) == 1
    assert fleet[0]["class_id"] == "ship_s"
    assert fleet[0]["is_player_owned"] is True


def test_faction_relations_coalesce_current(
    client: TestClient, static_conn: sqlite3.Connection, seed_conn: sqlite3.Connection
) -> None:
    # Faction definition lives in static; the gamestart relation lives in seed.
    static_conn.execute("INSERT INTO factions (faction_id, name) VALUES ('player', 'Player')")
    static_conn.commit()
    seed_conn.execute(
        "INSERT INTO faction_relations (faction_id, other_faction_id, initial_relation) "
        "VALUES ('player', 'argon', 0.0)"
    )
    seed_conn.commit()

    _activate(client)

    rels = client.get("/api/v1/factions/player/relations").json()
    argon = next(r for r in rels if r["other_faction_id"] == "argon")
    assert argon["initial_relation"] == 0.0
    assert argon["current_relation"] == 0.5  # overridden by the save
