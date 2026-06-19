"""REST endpoints for NPCs (crew, marines, station personnel)."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class NPCEntry(PublicModel):
    id: str
    name: str | None
    code: str | None
    macro: str | None
    owner_faction: str | None
    entity_type: str | None
    entity_post: str | None
    seed: str | None
    location_ship_id: str | None
    location_station_id: str | None
    employment: str
    extra_json: str | None


@router.get("/npcs", response_model=list[NPCEntry])
def list_npcs(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    employment: Annotated[str | None, Query(description="Filter by employment: owned, hireable")] = None,
    owner: Annotated[str | None, Query(description="Filter by owner faction (e.g. player)")] = None,
    entity_type: Annotated[str | None, Query(description="Filter by role (officer, aipilot, engineer, defence)")] = None,
    limit: Annotated[int, Query(ge=1, le=5000, description="Max entries")] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[NPCEntry]:
    has_npc = bool(
        conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='npc'").fetchone()
    )
    if not has_npc:
        return []

    where = []
    params: list[str | int] = []
    if employment:
        where.append("employment = ?")
        params.append(employment)
    if owner:
        where.append("owner_faction = ?")
        params.append(owner)
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])

    rows = conn.execute(
        f"""
        SELECT id, name, code, macro, owner_faction, entity_type, entity_post,
               seed, location_ship_id, location_station_id, employment, extra_json
        FROM npc
        {clause}
        ORDER BY name
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()
    return [NPCEntry(**dict(r)) for r in rows]
