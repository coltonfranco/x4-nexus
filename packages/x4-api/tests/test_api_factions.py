"""Smoke tests for the factions API endpoints."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.api.app import app as app_factory
from x4_api.api.deps import get_settings
from x4_api.config import Settings
from x4_extract.static import factions

TINY_FACTIONS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<factions>
  <faction id="argon" name="Argon Federation" primaryrace="argon" shortname="ARG" prefixname="Argon" description="The Argon" tags="economic">
    <color ref="faction_argon" />
    <icon active="faction_argon" />
    <relations>
      <relation faction="xenon" relation="-1" />
    </relations>
  </faction>
  <faction id="xenon" name="Xenon" primaryrace="xenon">
  </faction>
</factions>
"""

TINY_COLORS_XML = b"""<?xml version="1.0" encoding="utf-8"?>
<colormap>
  <color id="blue_bright" r="0" g="120" b="215" a="255" />
  <mapping id="faction_argon" ref="blue_bright" />
</colormap>
"""


@pytest.fixture
def client(data_dir: Path) -> TestClient:
    fast_app = app_factory()
    test_settings = Settings(
        install_path=Path("C:/fake/x4"),
        data_dir=data_dir,
    )
    fast_app.dependency_overrides[get_settings] = lambda: test_settings
    try:
        yield TestClient(fast_app)
    finally:
        fast_app.dependency_overrides.clear()


def test_list_factions_returns_all_factions(client: TestClient, static_conn: sqlite3.Connection) -> None:
    result = factions.extract(TINY_FACTIONS_XML, TINY_COLORS_XML)
    factions.write(static_conn, result)
    static_conn.commit()

    resp = client.get("/api/v1/factions")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    argon = next(f for f in data if f["faction_id"] == "argon")
    assert argon["name"] == "Argon Federation"
    assert argon["color_hex"] == "#0078D7"
    assert argon["short_name"] == "ARG"
    assert argon["prefix_name"] == "Argon"
    assert argon["icon_active"] == "faction_argon"


def test_get_faction_detail_returns_404_on_missing(client: TestClient) -> None:
    resp = client.get("/api/v1/factions/no_such_faction")
    assert resp.status_code == 404
    assert "Unknown faction_id" in resp.json()["detail"]


def test_get_faction_detail_returns_full_record(client: TestClient, static_conn: sqlite3.Connection) -> None:
    result = factions.extract(TINY_FACTIONS_XML, TINY_COLORS_XML)
    factions.write(static_conn, result)
    static_conn.commit()

    resp = client.get("/api/v1/factions/argon")

    assert resp.status_code == 200
    data = resp.json()
    assert data["faction_id"] == "argon"
    assert data["name"] == "Argon Federation"
    assert data["color_hex"] == "#0078D7"
    assert data["primary_race"] == "argon"
    assert data["short_name"] == "ARG"
    assert data["prefix_name"] == "Argon"
    assert data["icon_active"] == "faction_argon"
    assert data["description"] == "The Argon"
    assert data["tags"] == "economic"
    assert "capital_sector" not in data


# Faction relations are now sourced from the live save (faction_relations_current), not
# from static/seed definitions — that endpoint is covered by test_api_dynamic
# (test_faction_relations_from_save) where a save is actually ingested.
