"""REST endpoint for deployables (satellites, resource probes, nav beacons, mines)."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class DeployableEntry(PublicModel):
    id: str
    class_: str
    code: str | None
    macro: str | None
    owner_faction: str | None
    sector_id: str | None
    zone_id: str | None
    known_to_player: int
    extra_json: str | None


@router.get("/deployables", response_model=list[DeployableEntry])
def list_deployables(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    class_: Annotated[str | None, Query(alias="class", description="Filter by class (satellite, resourceprobe, etc.)")] = None,
    owner: Annotated[str | None, Query(description="Filter by owner faction")] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[DeployableEntry]:
    has_table = bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='deployables'"
        ).fetchone()
    )
    if not has_table:
        return []

    where = []
    params: list[str | int] = []
    if class_:
        where.append("class = ?")
        params.append(class_)
    if owner:
        where.append("owner_faction = ?")
        params.append(owner)

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])

    rows = conn.execute(
        f"""
        SELECT id, class, code, macro, owner_faction, sector_id, zone_id,
               known_to_player, extra_json
        FROM deployables
        {clause}
        ORDER BY class, owner_faction
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()
    return [DeployableEntry(**dict(r)) for r in rows]
