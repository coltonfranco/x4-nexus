"""REST endpoints for live ships (the fleet) from the active save's dynamic DB.

Distinct from `/ships` (static ship catalog/specs): these are live ship *instances* —
the actual ships in the player's save, at their current sectors and states. The `macro`
column joins `s.ships` for catalog specs. Empty until a save is ingested.
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class LiveShip(PublicModel):
    ship_id: str
    code: str | None
    name: str | None
    macro: str | None
    owner_faction: str | None
    class_id: str | None
    sector_id: str | None
    state: str | None
    is_player_owned: bool


@router.get("/fleet", response_model=list[LiveShip])
def list_fleet(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner: str | None = Query(None, description="Filter by owning faction id"),
    sector: str | None = Query(None, description="Filter by sector macro id"),
    player_only: bool = Query(False, description="Only player-owned ships"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[LiveShip]:
    """Live ship instances. Returns [] until a save is ingested."""
    sql = [
        "SELECT ship_id, code, name, macro, owner_faction, class_id, sector_id, state, "
        "is_player_owned FROM ships WHERE 1=1"
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
    sql.append("ORDER BY ship_id LIMIT :limit OFFSET :offset")
    params["limit"] = limit
    params["offset"] = offset
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [LiveShip(**dict(r)) for r in rows]
