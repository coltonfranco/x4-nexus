"""Live economy endpoints — the supply-chain shortage radar.

Reads the active save's offers crossed with the static ware catalog. Empty until a
save is ingested.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel
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
