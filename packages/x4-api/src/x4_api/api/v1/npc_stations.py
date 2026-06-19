"""REST endpoints for NPC station instances placed in the universe."""

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


@router.get("/npc-stations", response_model=list[NpcStationSummary])
def list_npc_stations(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner: Annotated[str | None, Query(description="Filter by owner faction ID")] = None,
    tag: Annotated[str | None, Query(description="Filter by tag, e.g. shipyard, wharf, equipmentdock")] = None,
    sector: Annotated[str | None, Query(description="Filter by location_sector (case-insensitive)")] = None,
) -> list[NpcStationSummary]:
    """Deprecated: seed database removed. Use /map/stations for live station data."""
    return []


@router.get("/npc-stations/{station_id}", response_model=NpcStationDetail)
def get_npc_station(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> NpcStationDetail:
    """Deprecated: seed database removed. Use /map/stations for live station data."""
    raise HTTPException(status_code=404, detail=f"Seed database removed — use /map/stations")
