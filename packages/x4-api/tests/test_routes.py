"""Tests for the trade-route ranking domain + endpoint."""

from __future__ import annotations

from pathlib import Path

from x4_api.domain.routes import rank_routes
from x4_extract.db import open_db
from x4_extract.dynamic.materialize import compute_top_routes


def _seed_route_data(data_dir: Path) -> None:
    """A buy-low/sell-high pair for one ware across two stations in different sectors."""
    conn = open_db(data_dir)
    try:
        conn.execute("INSERT INTO s.wares (ware_id, name, volume) VALUES ('energycells', 'Energy Cells', 1)")
        conn.executemany(
            "INSERT INTO stations (station_id, name, sector_id, is_player_owned, is_under_construction) "
            "VALUES (?, ?, ?, 0, 0)",
            [("A", "Seller", "S1"), ("B", "Buyer", "S2")],
        )
        conn.executemany(
            "INSERT INTO station_offers (station_id, ware_id, side, price, quantity) VALUES (?, ?, ?, ?, ?)",
            [
                ("A", "energycells", "sell", 100, 500),  # buy here (station sells)
                ("B", "energycells", "buy", 150, 300),   # sell here (station buys)
            ],
        )
        conn.execute(
            "INSERT INTO sector_distance (from_sector_id, to_sector_id, hops) VALUES ('S1', 'S2', 2)"
        )
        compute_top_routes(conn)
        conn.commit()
    finally:
        conn.close()


def test_rank_routes_scores_and_enriches(data_dir: Path) -> None:
    _seed_route_data(data_dir)
    conn = open_db(data_dir, read_only=True)
    try:
        ranked = rank_routes(conn, ship_cargo=8000, ship_speed=420, limit=10)
    finally:
        conn.close()

    assert len(ranked) == 1
    r = ranked[0]
    assert r.ware_id == "energycells"
    assert r.ware_name == "Energy Cells"
    assert r.buy_station_id == "A" and r.sell_station_id == "B"
    assert r.buy_sector == "S1" and r.sell_sector == "S2"
    assert r.margin == 50
    assert r.units_per_trip == 300  # min(qty=300, cargo 8000 / volume 1)
    assert r.profit_per_trip == 15000
    assert r.hops == 2
    assert r.est_profit_per_hour > 0


def test_rank_routes_caps_units_by_cargo(data_dir: Path) -> None:
    _seed_route_data(data_dir)
    conn = open_db(data_dir, read_only=True)
    try:
        ranked = rank_routes(conn, ship_cargo=100, ship_speed=420, limit=10)
    finally:
        conn.close()
    # cargo 100 / volume 1 = 100 units, below the 300 available.
    assert ranked[0].units_per_trip == 100
    assert ranked[0].profit_per_trip == 5000


def test_rank_routes_empty_without_data(data_dir: Path) -> None:
    conn = open_db(data_dir, read_only=True)
    try:
        assert rank_routes(conn, ship_cargo=8000, ship_speed=420, limit=10) == []
    finally:
        conn.close()
