"""REST endpoints for live stations from the active save's dynamic DB.

Distinct from `/npc-stations` (static gamestart placements): these are the stations as
they exist right now in the player's save, including player-built ones and live trade
offers. Empty until a save is ingested.
"""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class LiveStation(PublicModel):
    station_id: str
    code: str | None
    name: str | None
    macro: str | None
    owner_faction: str | None
    sector_id: str | None
    is_player_owned: bool
    is_under_construction: bool
    seed_id: str | None = None
    dynamic_tags: str | None = None
    known_to_player: bool
    basename: str | None = None
    nameindex: int | None = None


class StationOffer(PublicModel):
    ware_id: str
    side: str
    price: int
    quantity: int


@router.get("/stations", response_model=list[LiveStation])
def list_stations(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner: str | None = Query(None, description="Filter by owning faction id"),
    sector: str | None = Query(None, description="Filter by sector macro id"),
    player_only: bool = Query(False, description="Only player-owned stations"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[LiveStation]:
    """Live stations, newest snapshot. Returns [] until a save is ingested."""
    sql = [
        "SELECT station_id, code, name, macro, owner_faction, sector_id, "
        "is_player_owned, is_under_construction, seed_id, dynamic_tags, "
        "known_to_player, basename, nameindex "
        "FROM stations WHERE 1=1"
    ]
    params: dict[str, object] = {}
    if owner is not None:
        sql.append("AND owner_faction = :owner")
        params["owner"] = owner
    if sector is not None:
        sql.append("AND sector_id = :sector")
        params["sector"] = sector
    if player_only:
        sql.append("AND is_player_owned = 1")
    sql.append("ORDER BY station_id LIMIT :limit OFFSET :offset")
    params["limit"] = limit
    params["offset"] = offset
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [LiveStation(**dict(r)) for r in rows]


@router.get("/stations/{station_id}/offers", response_model=list[StationOffer])
def station_offers(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[StationOffer]:
    """Current buy/sell offers at a station. 404 if the station is not in the save."""
    exists = conn.execute(
        "SELECT 1 FROM stations WHERE station_id = :id", {"id": station_id}
    ).fetchone()
    if exists is None:
        raise HTTPException(status_code=404, detail=f"Unknown station_id: {station_id}")
    rows = conn.execute(
        "SELECT ware_id, side, price, quantity FROM station_offers "
        "WHERE station_id = :id ORDER BY side, ware_id",
        {"id": station_id},
    ).fetchall()
    return [StationOffer(**dict(r)) for r in rows]
