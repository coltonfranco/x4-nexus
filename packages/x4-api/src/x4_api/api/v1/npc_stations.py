"""REST endpoints for NPC station instances placed in the universe."""

from __future__ import annotations

import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class NpcStationSummary(PublicModel):
    station_id: str
    owner_faction: str | None
    race: str | None
    tags: list[str] | None
    location_sector: str | None


class NpcStationDetail(NpcStationSummary):
    location_zone: str | None
    x: float | None
    y: float | None
    z: float | None


def _parse_tags(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


@router.get("/npc-stations", response_model=list[NpcStationSummary])
def list_npc_stations(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner: Annotated[str | None, Query(description="Filter by owner faction ID")] = None,
    tag: Annotated[str | None, Query(description="Filter by tag, e.g. shipyard, wharf, equipmentdock")] = None,
    sector: Annotated[str | None, Query(description="Filter by location_sector (case-insensitive)")] = None,
) -> list[NpcStationSummary]:
    """List NPC stations in the universe, optionally filtered by owner, tag, or sector."""
    sql = (
        "SELECT station_id, owner_faction, race, tags, location_sector "
        "FROM s.npc_stations WHERE 1=1"
    )
    params: list = []

    if owner:
        sql += " AND owner_faction = ?"
        params.append(owner)
    if tag:
        sql += " AND tags LIKE ?"
        params.append(f'%"{tag}"%')
    if sector:
        sql += " AND LOWER(location_sector) = LOWER(?)"
        params.append(sector)

    sql += " ORDER BY owner_faction, station_id"

    rows = conn.execute(sql, params).fetchall()
    return [
        NpcStationSummary(
            station_id=r["station_id"],
            owner_faction=r["owner_faction"],
            race=r["race"],
            tags=_parse_tags(r["tags"]),
            location_sector=r["location_sector"],
        )
        for r in rows
    ]


@router.get("/npc-stations/{station_id}", response_model=NpcStationDetail)
def get_npc_station(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> NpcStationDetail:
    """Get full details for a specific NPC station including coordinates."""
    row = conn.execute(
        "SELECT station_id, owner_faction, race, tags, "
        "location_zone, location_sector, x, y, z "
        "FROM s.npc_stations WHERE station_id = ?",
        (station_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown station_id: {station_id}")
    return NpcStationDetail(
        station_id=row["station_id"],
        owner_faction=row["owner_faction"],
        race=row["race"],
        tags=_parse_tags(row["tags"]),
        location_zone=row["location_zone"],
        location_sector=row["location_sector"],
        x=row["x"],
        y=row["y"],
        z=row["z"],
    )
