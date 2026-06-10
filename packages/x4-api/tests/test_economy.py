"""Tests for the supply-chain shortage radar (domain + classification)."""

from __future__ import annotations

from pathlib import Path

from x4_api.domain.supply import ware_market
from x4_extract.db import open_db


def _seed(data_dir: Path) -> None:
    conn = open_db(data_dir)
    try:
        conn.executemany(
            "INSERT INTO s.wares (ware_id, name, volume, price_avg) VALUES (?, ?, 1, ?)",
            [("hullparts", "Hull Parts", 100), ("energycells", "Energy Cells", 20)],
        )
        conn.executemany(
            "INSERT INTO stations (station_id, sector_id, is_player_owned, is_under_construction) "
            "VALUES (?, 'S1', 0, 0)",
            [("A",), ("B",), ("C",)],
        )
        conn.executemany(
            "INSERT INTO station_offers (station_id, ware_id, side, price, quantity) VALUES (?, ?, ?, ?, ?)",
            [
                # hullparts: heavy demand (buy 900), thin supply (sell 100) → shortage, elevated price
                ("A", "hullparts", "buy", 140, 600),
                ("B", "hullparts", "buy", 135, 300),
                ("C", "hullparts", "sell", 130, 100),
                # energycells: lots for sale (1000), little demand (100) → surplus
                ("A", "energycells", "sell", 14, 1000),
                ("B", "energycells", "buy", 16, 100),
            ],
        )
        conn.commit()
    finally:
        conn.close()


def test_ware_market_classifies_and_ranks(data_dir: Path) -> None:
    _seed(data_dir)
    conn = open_db(data_dir, read_only=True)
    try:
        market = {m.ware_id: m for m in ware_market(conn)}
        ordered = [m.ware_id for m in ware_market(conn)]
    finally:
        conn.close()

    hp = market["hullparts"]
    assert hp.ware_name == "Hull Parts"
    assert hp.sell_qty == 100 and hp.buy_qty == 900
    assert hp.net_demand == 800
    assert hp.classification == "shortage"
    assert hp.best_buy_price == 130   # cheapest sell offer
    assert hp.best_sell_price == 140  # dearest buy offer
    assert hp.price_index is not None and hp.price_index > 1  # elevated vs ref 100

    ec = market["energycells"]
    assert ec.classification == "surplus"
    assert ec.net_demand == -900

    # Default ranking is most under-supplied first.
    assert ordered[0] == "hullparts"


def test_ware_market_empty_without_offers(data_dir: Path) -> None:
    conn = open_db(data_dir, read_only=True)
    try:
        assert ware_market(conn) == []
    finally:
        conn.close()
