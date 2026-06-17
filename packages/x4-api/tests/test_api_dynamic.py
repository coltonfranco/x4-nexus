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


def test_refresh_config_disabled_when_no_refresher(client: TestClient) -> None:
    # The test client never runs lifespan, so no refresher is attached — config is read-only.
    got = client.get("/api/v1/refresh-config").json()
    assert got["background_refresh"] is False
    assert got["min_interval_sec"] == 5
    # Nothing to tune → updates are rejected rather than silently dropped.
    assert client.put("/api/v1/refresh-config", json={"interval_enabled": True}).status_code == 409


def test_refresh_config_get_and_update(data_dir: Path, fixtures_dir: Path) -> None:
    from x4_api.api.refresher import BackgroundRefresher

    folder = data_dir / "saves"
    folder.mkdir()
    shutil.copyfile(fixtures_dir / "tiny_save.xml.gz", folder / "save_001.xml.gz")
    settings = Settings(
        install_path=Path("C:/fake/x4"), data_dir=data_dir, save_path=folder, poll_interval_sec=60
    )
    fast_app = app_factory()
    fast_app.dependency_overrides[get_settings] = lambda: settings
    fast_app.state.refresher = BackgroundRefresher(settings)  # attached but not started
    client = TestClient(fast_app)
    try:
        got = client.get("/api/v1/refresh-config").json()
        assert got == {
            "background_refresh": True,
            "interval_enabled": True,
            "interval_sec": 60,
            "min_interval_sec": 5,
        }

        updated = client.put(
            "/api/v1/refresh-config", json={"interval_enabled": False, "interval_sec": 300}
        ).json()
        assert updated["interval_enabled"] is False
        assert updated["interval_sec"] == 300

        # Below the floor is rejected.
        assert client.put("/api/v1/refresh-config", json={"interval_sec": 1}).status_code == 422
    finally:
        fast_app.dependency_overrides.clear()


def test_map_stations(client: TestClient) -> None:
    # No save ingested yet → falls back to (empty) seed placements without erroring.
    assert client.get("/api/v1/map/stations").json() == []
    _activate(client)

    stations = client.get("/api/v1/map/stations").json()
    assert len(stations) == 1
    st = stations[0]
    assert st["station_id"] == "[0x100]"
    assert st["owner_faction"] == "argon"
    assert st["sector_id"] == "cluster_001_sector001_macro"
    assert st["source"] == "live"
    assert st["is_player_owned"] is False
    # No gamestart tags for this fixture station → no derived category.
    assert st["category"] is None


def test_live_resources(client: TestClient) -> None:
    assert client.get("/api/v1/map/resources/live").json() == []  # nothing ingested yet
    _activate(client)

    rows = {r["ware"]: r for r in client.get("/api/v1/map/resources/live").json()}
    assert rows["ore"]["sector_id"] == "cluster_001_sector001_macro"
    assert rows["ore"]["current"] == 4689
    assert rows["silicon"]["current"] == 19080  # summed across the sector's two areas
    assert rows["silicon"]["yield_tier"] == "lowplus"  # v9 saves carry no max field


def test_faction_relations_from_save(
    client: TestClient, static_conn: sqlite3.Connection
) -> None:
    # Relations now come entirely from the live save (faction_relations_current); seed.db
    # was removed, so initial == current. The tiny fixture sets player → argon at 0.5.
    static_conn.execute("INSERT INTO factions (faction_id, name) VALUES ('player', 'Player')")
    static_conn.commit()

    _activate(client)

    rels = client.get("/api/v1/factions/player/relations").json()
    argon = next(r for r in rels if r["other_faction_id"] == "argon")
    assert argon["current_relation"] == 0.5
    assert argon["initial_relation"] == 0.5  # no separate gamestart source anymore


def test_refresh_status_reports_ingest(client: TestClient) -> None:
    _activate(client)
    st = client.get("/api/v1/refresh-status").json()
    assert st["active_key"] == "save_001"
    assert st["ingested_at"] is not None
    assert st["source_fingerprint"]
    # First ingest is a silent baseline → no events flooded into the feed.
    assert st["last_event_id"] == 0
    assert st["markers"] == {}


def test_events_feed_filters(client: TestClient, data_dir: Path) -> None:
    _activate(client)
    # Inject a couple of events into the active save's dynamic DB (a real change would
    # produce these on the next ingest; we synthesize them to test the read path).
    db = data_dir / "dynamic" / "save_001.db"
    conn = sqlite3.connect(db)
    conn.executemany(
        "INSERT INTO events (game_time, real_time, entity_type, entity_key, change_kind, "
        "priority, category, title, text, payload_json) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
            (1.0, "t", "logbook", "a", "added", "alert", "combat", "Under attack", "", None),
            (1.0, "t", "stat", "b", "changed", "info", "stat", "kills", "5", None),
        ],
    )
    conn.commit()
    conn.close()

    everything = client.get("/api/v1/events").json()
    assert len(everything) == 2  # newest first
    assert everything[0]["id"] > everything[1]["id"]

    alerts_only = client.get("/api/v1/events", params={"min_priority": "warn"}).json()
    assert [e["category"] for e in alerts_only] == ["combat"]

    combat = client.get("/api/v1/events", params={"category": "combat"}).json()
    assert len(combat) == 1 and combat[0]["title"] == "Under attack"

    newest_id = everything[0]["id"]
    assert client.get("/api/v1/events", params={"since": newest_id}).json() == []

    # refresh-status now reflects the injected events.
    st = client.get("/api/v1/refresh-status").json()
    assert st["last_event_id"] == newest_id
    assert set(st["markers"]) == {"logbook", "stat"}
