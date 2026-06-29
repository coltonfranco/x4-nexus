"""Live economy endpoints — the supply-chain shortage radar.

Reads the active save's offers crossed with the static ware catalog. Empty until a
save is ingested.
"""


import dataclasses
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from x4_api.api.deps import get_db
from x4_api.api.icons import get_ware_icon_url
from x4_api.api.schemas import PublicModel
from x4_api.domain import finance
from x4_api.domain.supply import ware_market, ware_stations

router = APIRouter()

_SORTS = {
    "net_demand": lambda m: m.net_demand,
    "price_index": lambda m: m.price_index or 0,
    "sell_qty": lambda m: m.sell_qty,
    "buy_qty": lambda m: m.buy_qty,
}


class WareMarketRow(PublicModel):
    ware_id: str
    ware_name: str | None
    group_id: str | None
    ref_price: int | None
    sell_offers: int
    sell_qty: int
    best_buy_price: int | None
    buy_offers: int
    buy_qty: int
    best_sell_price: int | None
    avg_price: int
    net_demand: int
    price_index: float | None
    classification: str


@router.get("/economy/wares", response_model=list[WareMarketRow])
def list_ware_market(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    classification: Literal["shortage", "balanced", "surplus"] | None = Query(
        None, description="Filter to shortages, surpluses, or balanced wares"
    ),
    sort: Literal["net_demand", "price_index", "sell_qty", "buy_qty"] = Query(
        "net_demand", description="Sort key (descending)"
    ),
    limit: int = Query(200, ge=1, le=2000),
) -> list[WareMarketRow]:
    """Universe-wide ware supply/demand/price summary. Most under-supplied first."""
    rows = ware_market(conn)
    if classification is not None:
        rows = [m for m in rows if m.classification == classification]
    rows.sort(key=_SORTS[sort], reverse=True)
    return [WareMarketRow(**dataclasses.asdict(m)) for m in rows[:limit]]


class WareOfferRow(PublicModel):
    station_id: str
    station_name: str | None
    station_code: str | None
    owner_faction: str | None
    sector_id: str | None
    side: str
    price: int
    quantity: int


@router.get("/economy/wares/{ware_id}/stations", response_model=list[WareOfferRow])
def ware_offer_breakdown(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[WareOfferRow]:
    """Per-station offers for one ware — where it's demanded vs supplied (and hoarding)."""
    return [WareOfferRow(**dataclasses.asdict(o)) for o in ware_stations(conn, ware_id)]


# ── Player P&L (from the save's <economylog>) ──────────────────────────────────


class AccountRow(PublicModel):
    owner: str                    # `[0x..]` component id
    name: str | None              # resolved station/ship name (raw id when unresolved)
    kind: str                     # station | ship | account (empire/faction-level)
    faction: str | None
    is_player: bool
    net_worth: int | None         # latest baseline value (faction-level; NULL for most stations)
    net_worth_assets: int | None  # latest baseline secondary value
    live_cash: int | None         # exact cash balance from latest transaction event
    account_amount: int | None    # station's own credits (from station_overview)
    account_min: int | None       # operating budget lower threshold
    account_max: int | None       # operating budget upper threshold (manager target)
    latest_time: float | None     # in-game seconds of the latest sample
    event_count: int


@router.get("/economy/accounts", response_model=list[AccountRow])
def list_accounts(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    player_only: bool = Query(False, description="Only accounts resolving to player assets"),
) -> list[AccountRow]:
    """Tracked money accounts with their latest net worth — feeds the net-worth picker."""
    return [
        AccountRow(**dataclasses.asdict(a))
        for a in finance.accounts(conn, player_only=player_only)
    ]


class NetWorthPointRow(PublicModel):
    owner: str
    name: str | None
    is_player: bool
    time: float
    v: int | None
    v2: int | None
    type: str | None
    delta: int | None
    partner: str | None
    partner_name: str | None
    partner_faction: str | None
    partner_faction_name: str | None
    partner_kind: str | None
    partner_is_player: bool


@router.get("/economy/networth", response_model=list[NetWorthPointRow])
def net_worth_series(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner: str | None = Query(None, description="Pin one account; omit for all player accounts"),
    player_only: bool = Query(True, description="Restrict to player accounts (ignored when owner set)"),
) -> list[NetWorthPointRow]:
    """Net-worth-over-time samples for charting (the in-game player overview curve)."""
    return [
        NetWorthPointRow(**dataclasses.asdict(p))
        for p in finance.net_worth_series(conn, owner=owner, player_only=player_only)
    ]


class NetWorthBreakdownRow(PublicModel):
    cash: int
    station_accounts: int
    ship_hulls: int
    ship_equipment: int
    station_modules: int
    inventory: int
    total: int


@router.get("/economy/networth/current", response_model=NetWorthBreakdownRow)
def net_worth_breakdown(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> NetWorthBreakdownRow:
    """Exact breakdown of the player's current net worth matching the game UI."""
    return NetWorthBreakdownRow(**dataclasses.asdict(finance.net_worth_breakdown(conn)))


class WarePnlRow(PublicModel):
    ware: str | None
    ware_name: str | None
    icon_url: str | None
    income: int
    spend: int
    net: int
    sell_count: int
    buy_count: int


@router.get("/economy/pnl", response_model=list[WarePnlRow])
def ware_pnl(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[WarePnlRow]:
    """Per-commodity profit/loss from the player's transactions, most profitable first."""
    return [
        WarePnlRow(
            ware=p.ware,
            ware_name=p.ware_name,
            icon_url=get_ware_icon_url(p.ware, p.icon_path, p.tags) if p.ware else None,
            income=p.income,
            spend=p.spend,
            net=p.net,
            sell_count=p.sell_count,
            buy_count=p.buy_count,
        )
        for p in finance.ware_pnl(conn)
    ]


class TradeRow(PublicModel):
    time: float
    ware: str | None
    ware_name: str | None
    price: int | None
    quantity: int | None
    buyer: str | None
    buyer_name: str | None
    buyer_is_player: bool
    seller: str | None
    seller_name: str | None
    seller_is_player: bool


@router.get("/economy/trades", response_model=list[TradeRow])
def list_trades(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    ware: str | None = Query(None, description="Filter to one ware_id"),
    owner: str | None = Query(None, description="Trades where this id is buyer or seller"),
    player_only: bool = Query(False, description="Only trades a player asset is party to"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[TradeRow]:
    """Transaction ledger, most recent first — where credits are earned and spent."""
    return [
        TradeRow(**dataclasses.asdict(t))
        for t in finance.trades(
            conn, ware=ware, owner=owner, player_only=player_only, limit=limit, offset=offset
        )
    ]
