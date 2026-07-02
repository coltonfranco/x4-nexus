"""Tests for the station-builder app-data endpoints (user-authored station designs).

These exercise the standalone appdata.db: CRUD, summary counts, full-replace update,
cascade delete, and 404s. The `data_dir` fixture's `migrate_all` already creates
appdata.db, so no extra setup is needed.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.config import Settings


@pytest.fixture
def settings(data_dir: Path) -> Settings:
    return Settings(install_path=None, data_dir=data_dir, save_path=None)


def _payload(name: str = "Test Station") -> dict:
    return {
        "name": name,
        "notes": "scratch design",
        "grid_mode": True,
        "nodes": [
            {
                "node_id": "n1",
                "module_id": "prod_ter_energycells_macro",
                "pos_x": 1.5,
                "pos_y": 2.0,
                "handle_positions": "{}",
            },
            {
                "node_id": "n2",
                "module_id": "storage_ter_s_container_01_macro",
                "pos_x": 10.0,
                "pos_y": 20.0,
                "handle_positions": None,
            },
        ],
        "edges": [
            {
                "edge_id": "e1",
                "source": "n1",
                "target": "n2",
                "source_handle": "p-0",
                "target_handle": "p-1",
            }
        ],
    }


def test_create_and_get_round_trip(client: TestClient) -> None:
    resp = client.post("/api/v1/builder/stations", json=_payload())
    assert resp.status_code == 200
    created = resp.json()
    sid = created["id"]
    assert created["name"] == "Test Station"
    assert created["source_kind"] == "user"
    assert created["source_ref"] is None
    assert len(created["nodes"]) == 2
    assert len(created["edges"]) == 1

    got = client.get(f"/api/v1/builder/stations/{sid}").json()
    assert got["nodes"][0]["module_id"] == "prod_ter_energycells_macro"
    assert got["edges"][0]["source_handle"] == "p-0"
    # Node ordering is by insertion; handle_positions round-trips including null.
    by_id = {n["node_id"]: n for n in got["nodes"]}
    assert by_id["n1"]["pos_x"] == 1.5
    assert by_id["n2"]["handle_positions"] is None


def test_list_carries_counts(client: TestClient) -> None:
    client.post("/api/v1/builder/stations", json=_payload("A"))
    rows = client.get("/api/v1/builder/stations").json()
    assert len(rows) == 1
    assert rows[0]["node_count"] == 2
    assert rows[0]["edge_count"] == 1
    assert "nodes" not in rows[0]  # summary, not full detail


def test_update_replaces_children(client: TestClient) -> None:
    sid = client.post("/api/v1/builder/stations", json=_payload()).json()["id"]

    updated = _payload("Renamed")
    updated["grid_mode"] = False
    updated["edges"] = []  # drop the connection
    resp = client.put(f"/api/v1/builder/stations/{sid}", json=updated)
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Renamed"
    assert body["grid_mode"] is False
    assert len(body["edges"]) == 0
    assert len(body["nodes"]) == 2

    # No orphan edges remain for this station.
    rows = client.get("/api/v1/builder/stations").json()
    assert rows[0]["edge_count"] == 0


def test_delete_cascades(client: TestClient) -> None:
    sid = client.post("/api/v1/builder/stations", json=_payload()).json()["id"]
    assert client.delete(f"/api/v1/builder/stations/{sid}").status_code == 204
    assert client.get(f"/api/v1/builder/stations/{sid}").status_code == 404
    assert client.get("/api/v1/builder/stations").json() == []


def test_missing_returns_404(client: TestClient) -> None:
    assert client.get("/api/v1/builder/stations/nope").status_code == 404
    assert client.put("/api/v1/builder/stations/nope", json=_payload()).status_code == 404
    assert client.delete("/api/v1/builder/stations/nope").status_code == 404
