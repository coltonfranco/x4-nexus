"""Trade-route ranking endpoint — the headline economy feature.

Reads the active save's materialized route candidates and scores them for a given ship.
Returns [] until a save is ingested.
"""


import dataclasses
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel
from x4_api.domain.routes import rank_routes

router = APIRouter()


class Route(PublicModel):
    ware_id: str
    ware_name: str | None
    buy_station_id: str
    buy_station_name: str | None
    buy_sector: str | None
    sell_station_id: str
    sell_station_name: str | None
    sell_sector: str | None
    buy_price: int | None
    sell_price: int | None
    margin: int
    units_per_trip: int
    profit_per_trip: int
    hops: int | None
    est_profit_per_hour: int


@router.get("/routes", response_model=list[Route])
def list_routes(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    ship_cargo: int = Query(8000, ge=1, description="Ship cargo capacity (m³)"),
    ship_speed: float = Query(420, gt=0, description="Ship travel speed (m/s)"),
    limit: int = Query(50, ge=1, le=500),
) -> list[Route]:
    """Top trade routes ranked by estimated profit/hour for the given ship."""
    ranked = rank_routes(conn, ship_cargo=ship_cargo, ship_speed=ship_speed, limit=limit)
    return [Route(**dataclasses.asdict(r)) for r in ranked]
