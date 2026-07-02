"""REST endpoints for mission group catalog.

Reference data from `libraries/missiongroups.xml` — faction guild boards,
war missions, and story plot chains. Enriches live mission data with
human-readable group metadata.
"""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.db_utils import fetch_one_or_404
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class MissionGroup(PublicModel):
    group_id: str
    name: str | None
    faction: str | None
    enemy: str | None
    is_story: bool


_COLUMNS = "group_id, name, faction, enemy, is_story"


@router.get("/mission-groups", response_model=list[MissionGroup])
def list_mission_groups(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    faction: Annotated[str | None, Query(description="Filter by offering faction id")] = None,
    story_only: Annotated[bool | None, Query(description="Only story missions")] = None,
) -> list[MissionGroup]:
    """List all mission group definitions, optionally filtered by faction or story."""
    clauses = ["1=1"]
    params: dict = {}
    if faction:
        clauses.append("faction = :faction")
        params["faction"] = faction
    if story_only:
        clauses.append("is_story = 1")

    rows = conn.execute(
        f"""SELECT {_COLUMNS}
            FROM s.mission_groups
            WHERE {' AND '.join(clauses)}
            ORDER BY is_story DESC, group_id""",
        params,
    ).fetchall()
    return [MissionGroup(**dict(r)) for r in rows]


@router.get("/mission-groups/{group_id}", response_model=MissionGroup)
def get_mission_group(
    group_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> MissionGroup:
    row = fetch_one_or_404(
        conn,
        f"SELECT {_COLUMNS} FROM s.mission_groups WHERE group_id = :id",
        {"id": group_id},
        f"Unknown group_id: {group_id}",
    )
    return MissionGroup(**dict(row))
