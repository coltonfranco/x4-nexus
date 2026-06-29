"""Player-P&L economy endpoints: account resolution, net-worth series, and trade ledger.

Seeds the dynamic DB (economy_money/economy_trade + stations/ships rosters) and the static
ware catalog, then exercises the endpoints end-to-end through the API client.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from x4_api.api.app import app as app_factory
from x4_api.api.deps import get_settings
from x4_api.config import Settings
from x4_extract.db import open_db
from x4_extract.dynamic.catalog import ensure_active_dynamic_db

P_STAT = "[0xP_STAT]"
P_SHIP = "[0xP_SHIP]"
EMPIRE = "[0xEMPIRE]"   # resolves to neither station nor ship → kind 'account'
N_STAT = "[0xN_STAT]"
N_SHIP = "[0xN2]"


@pytest.fixture
def settings(data_dir: Path) -> Settings:
    return Settings(install_path=Path("C:/fake/x4"), data_dir=data_dir)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    fast_app = app_factory()
    fast_app.dependency_overrides[get_settings] = lambda: settings
    try:
        yield TestClient(fast_app)
    finally:
        fast_app.dependency_overrides.clear()


def _seed(settings: Settings) -> None:
    # Seed the same per-save dynamic DB that get_db resolves for the active save.
    dynamic_db = ensure_active_dynamic_db(settings)
    conn = open_db(settings.data_dir, dynamic_db=dynamic_db)
    try:
        conn.executemany(
            "INSERT INTO s.wares (ware_id, name, volume) VALUES (?, ?, 1)",
            [("silicon", "Silicon"), ("energycells", "Energy Cells")],
        )
        conn.execute(
            "INSERT INTO stations (station_id, name, code, owner_faction, is_player_owned, "
            "is_under_construction) VALUES (?, 'Computronics Substrate', 'PL-01', 'player', 1, 0)",
            (P_STAT,),
        )
        conn.execute(
            "INSERT INTO stations (station_id, name, code, owner_faction, is_player_owned, "
            "is_under_construction) VALUES (?, '', 'ARG-99', 'argon', 0, 0)",
            (N_STAT,),
        )
        conn.execute(
            "INSERT INTO ships (ship_id, name, owner_faction, is_player_owned) "
            "VALUES (?, 'Mine Mineral M1', 'player', 1)",
            (P_SHIP,),
        )
        # money: baseline samples (type NULL) build the net-worth curve; one event row is
        # excluded from the curve but counts toward event_count.
        conn.executemany(
            "INSERT INTO economy_money (owner, time, type, v, v2, partner) VALUES (?,?,?,?,?,?)",
            [
                (P_STAT, 0.0, None, 1000, 2000, None),
                (P_STAT, 100.0, None, 1500, 2500, None),
                (P_STAT, 100.0, "trade", 300, None, N_STAT),  # event, not a baseline
                (P_SHIP, 50.0, None, 200, 200, None),
                (EMPIRE, 100.0, None, 5000, 9000, None),
            ],
        )
        conn.executemany(
            "INSERT INTO economy_trade (time, ware, buyer, seller, price, v) VALUES (?,?,?,?,?,?)",
            [
                (64613.5, "silicon", N_STAT, P_STAT, 100, 10),     # player sells silicon (external income)
                (64700.0, "energycells", P_SHIP, N_STAT, 20, 5),   # player buys energycells (external spend)
                (64800.0, "silicon", N_STAT, N_SHIP, 99, 8),       # npc↔npc, no player party
                (64900.0, "ore", P_STAT, P_SHIP, 50, 4),           # player→player internal transfer
            ],
        )
        conn.commit()
    finally:
        conn.close()


# ── accounts ───────────────────────────────────────────────────────────────────

def test_accounts_resolve_and_rank(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    rows = client.get("/api/v1/economy/accounts").json()
    assert [r["owner"] for r in rows] == [EMPIRE, P_STAT, P_SHIP]  # net_worth desc

    stat = next(r for r in rows if r["owner"] == P_STAT)
    assert stat["name"] == "Computronics Substrate"
    assert stat["kind"] == "station"
    assert stat["is_player"] is True
    assert stat["net_worth"] == 15 and stat["net_worth_assets"] == 25  # latest baseline
    assert stat["event_count"] == 3  # two baselines + one event

    empire = next(r for r in rows if r["owner"] == EMPIRE)
    assert empire["kind"] == "account"          # resolves to no asset
    assert empire["is_player"] is False
    assert empire["name"] == EMPIRE             # raw id fallback


def test_accounts_player_only(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    rows = client.get("/api/v1/economy/accounts", params={"player_only": True}).json()
    assert {r["owner"] for r in rows} == {P_STAT, P_SHIP}


# ── net worth series ─────────────────────────────────────────────────────────────

def test_networth_player_default_excludes_events_and_npc(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    pts = client.get("/api/v1/economy/networth").json()
    # player baseline samples + event samples: P_STAT x3 + P_SHIP x1
    assert len(pts) == 4
    assert all(p["is_player"] for p in pts)
    pstat = [p for p in pts if p["owner"] == P_STAT]
    assert [p["v"] for p in pstat] == [10, 15, 3]  # ordered by time


def test_networth_owner_pin_overrides_player_filter(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    pts = client.get("/api/v1/economy/networth", params={"owner": EMPIRE}).json()
    assert [p["v"] for p in pts] == [50]


# ── trades ───────────────────────────────────────────────────────────────────────

def test_trades_recent_first_and_resolved(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    rows = client.get("/api/v1/economy/trades").json()
    assert [r["time"] for r in rows] == [64900.0, 64800.0, 64700.0, 64613.5]
    sell = next(r for r in rows if r["time"] == 64613.5)
    assert sell["ware_name"] == "Silicon"
    assert sell["seller_name"] == "Computronics Substrate" and sell["seller_is_player"] is True
    assert sell["buyer_name"] == "ARG-99" and sell["buyer_is_player"] is False  # empty name → code


def test_trades_filters(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    assert len(client.get("/api/v1/economy/trades", params={"ware": "silicon"}).json()) == 2
    # 2 external + 1 internal (ore) = 3 trades involving a player asset
    assert len(client.get("/api/v1/economy/trades", params={"player_only": True}).json()) == 3
    # P_SHIP is the energycells buyer (64700) and the ore seller (64900)
    owned = client.get("/api/v1/economy/trades", params={"owner": P_SHIP}).json()
    assert [r["time"] for r in owned] == [64900.0, 64700.0]


# ── per-ware P&L ─────────────────────────────────────────────────────────────────

def test_pnl_external_only_excludes_internal_transfers(client: TestClient, settings: Settings) -> None:
    _seed(settings)
    rows = client.get("/api/v1/economy/pnl").json()
    by_ware = {r["ware"]: r for r in rows}
    # silicon: external sell 100*10/100 = 10 income, no external spend
    assert by_ware["silicon"]["income"] == 10
    assert by_ware["silicon"]["spend"] == 0
    assert by_ware["silicon"]["net"] == 10 and by_ware["silicon"]["sell_count"] == 1
    # energycells: external buy 20*5 = 100 spend -> 1 credit
    assert by_ware["energycells"]["spend"] == 1
    assert by_ware["energycells"]["net"] == -1
    # ore was a player→player internal transfer → excluded entirely
    assert "ore" not in by_ware
    # ordered most profitable first
    assert rows[0]["ware"] == "silicon"


# ── empty contract ───────────────────────────────────────────────────────────────

def test_endpoints_empty_without_data(client: TestClient) -> None:
    for path in ("/api/v1/economy/accounts", "/api/v1/economy/networth", "/api/v1/economy/trades", "/api/v1/economy/pnl"):
        resp = client.get(path)
        assert resp.status_code == 200
        assert resp.json() == []
