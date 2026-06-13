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
    name: str | None              # in-save name (player-renamed); often null for NPC ships
    macro: str | None
    owner_faction: str | None
    class_id: str | None          # size: ship_xs..ship_xl
    sector_id: str | None
    state: str | None
    is_player_owned: bool
    catalog_name: str | None      # from the static ship catalog (e.g. "Rapier")
    role: str | None              # fight | trade | mine | build | auxiliary | ...
    ship_type: str | None         # scout | fighter | miner | freighter | ...
    cargo_volume: int | None
    level: float | None           # pilot skill 0-5
    thruster: str | None          # equipped thruster macro


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
    # LEFT JOIN the static ship catalog (by macro) for role/type/name/cargo.
    sql = [
        "SELECT sh.ship_id, sh.code, sh.name, sh.macro, sh.owner_faction, sh.class_id, "
        "sh.sector_id, sh.state, sh.level, sh.thruster, sh.is_player_owned, "
        "c.name AS catalog_name, c.role, c.ship_type, c.cargo_volume "
        "FROM ships sh LEFT JOIN s.ships c ON c.ship_id = sh.macro WHERE 1=1"
    ]
    params: dict[str, object] = {}
    if owner is not None:
        sql.append("AND sh.owner_faction = :owner")
        params["owner"] = owner
    if sector is not None:
        sql.append("AND sh.sector_id = :sector")
        params["sector"] = sector
    if player_only:
        sql.append("AND sh.is_player_owned = 1")
    sql.append("ORDER BY sh.ship_id LIMIT :limit OFFSET :offset")
    params["limit"] = limit
    params["offset"] = offset
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [LiveShip(**dict(r)) for r in rows]
