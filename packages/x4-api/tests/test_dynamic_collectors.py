"""Tests for the faction / player / ship save collectors via the full pipeline."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from x4_extract.config import ExtractSettings
from x4_extract.dynamic import pipeline


def _run(data_dir: Path, fixtures_dir: Path) -> sqlite3.Connection:
    settings = ExtractSettings(data_dir=data_dir)
    db = pipeline.run(settings, fixtures_dir / "tiny_save.xml.gz")
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    return conn


def test_faction_relations_current(data_dir: Path, fixtures_dir: Path) -> None:
    conn = _run(data_dir, fixtures_dir)
    try:
        rows = {
            (r["faction_id"], r["other_faction_id"]): r["relation"]
            for r in conn.execute("SELECT * FROM faction_relations_current")
        }
    finally:
        conn.close()
    assert rows == {
        ("player", "argon"): 0.5,
        ("player", "teladi"): -0.2,
        ("argon", "player"): 0.5,
    }


def test_player_account_blueprints_licences(data_dir: Path, fixtures_dir: Path) -> None:
    conn = _run(data_dir, fixtures_dir)
    try:
        player = conn.execute("SELECT * FROM player").fetchone()
        bps = {r["ware_id"] for r in conn.execute("SELECT ware_id FROM player_blueprints")}
        lics = {
            (r["licence_type"], r["faction_id"])
            for r in conn.execute("SELECT * FROM player_licences")
        }
    finally:
        conn.close()

    assert player is not None
    assert player["name"] == "TestPilot"
    assert player["player_id"] == "[0xAAA]"
    assert player["credits"] == 500000
    assert player["current_ship_id"] == "[0xBBB]"

    assert bps == {"module_test_01", "ship_test_02"}
    # Licences under faction[id=player]; each granting faction in `factions` is one row.
    # The capitalship licence under faction[id=argon] is NOT the player's and is excluded.
    assert lics == {
        ("capitalship", "argon"),
        ("capitalship", "teladi"),
        ("militaryship", "argon"),
    }


def test_ships_roster(data_dir: Path, fixtures_dir: Path) -> None:
    conn = _run(data_dir, fixtures_dir)
    try:
        ships = conn.execute("SELECT * FROM ships").fetchall()
    finally:
        conn.close()

    assert len(ships) == 1
    s = ships[0]
    assert s["ship_id"] == "[0xS1]"
    assert s["owner_faction"] == "player"
    assert s["class_id"] == "ship_s"
    assert s["macro"] == "ship_arg_s_scout_01_a_macro"
    assert s["sector_id"] == "cluster_001_sector001_macro"
    assert s["zone_id"] == "zone001_cluster_001_sector001_macro"
    assert s["is_player_owned"] == 1
    assert s["state"] == "normal"
