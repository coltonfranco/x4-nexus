"""REST endpoints for NPCs (crew, marines, station personnel)."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.db_utils import localized_text_sql, table_exists
from x4_api.api.deps import get_db
from x4_api.api.icons import get_icon_url
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
    connection: str | None = None
    location_ship_id: str | None
    location_station_id: str | None
    location_ship_name: str | None = None
    location_ship_code: str | None = None
    location_ship_command: str | None = None
    location_ship_command_name: str | None = None
    location_ship_assignment: str | None = None
    location_ship_assignment_name: str | None = None
    ship_macro: str | None = None
    location_ship_icon_url: str | None = None
    location_station_name: str | None = None
    location_station_code: str | None = None
    location_sector_name: str | None = None
    skill_piloting: int | None = None
    skill_morale: int | None = None
    skill_engineering: int | None = None
    skill_management: int | None = None
    skill_boarding: int | None = None
    blackboard_json: str | None = None
    employment: str = "hireable"
    extra_json: str | None = None


_NPC_JOINED_COLS = (
    "npc.id, npc.name, npc.code, npc.macro, npc.owner_faction, "
    "npc.entity_type, npc.entity_post, npc.seed, npc.connection, "
    "npc.location_ship_id, npc.location_station_id, "
    "npc.skill_piloting, npc.skill_morale, npc.skill_engineering, "
    "npc.skill_management, npc.skill_boarding, npc.blackboard_json, "
    "npc.employment, npc.extra_json, "
    f"CASE WHEN sh.name LIKE '{{%,%}}' THEN "
    f"  COALESCE({localized_text_sql('sh.name')}, sc.name, sh.code) "
    "ELSE COALESCE(sh.name, sc.name, sh.code) END AS location_ship_name, "
    "sh.code AS location_ship_code, "
    "json_extract(sh.extra_json, '$.current_order') AS location_ship_command, "
    "so.name AS location_ship_command_name, "
    "json_extract(sh.extra_json, '$.subordinate_assignment') AS location_ship_assignment, "
    "sa.name AS location_ship_assignment_name, "
    "sh.macro AS ship_macro, "
    "sc.icon_path AS _ship_icon_path, "
    "COALESCE("
    f"  CASE WHEN st.name LIKE '{{%,%}}' THEN {localized_text_sql('st.name')} ELSE st.name END, "
    "  st.code, "
    "  CASE WHEN json_extract(npc.extra_json, '$.is_buildstorage') = 1 THEN 'Build Storage' ELSE NULL END"
    ") AS location_station_name, "
    "st.code AS location_station_code, "
    "COALESCE(ship_sec.name_id, st_sec.name_id, extra_sec.name_id) AS location_sector_name"
)

_NPC_JOINS = (
    "LEFT JOIN ships sh ON npc.location_ship_id = sh.ship_id "
    "LEFT JOIN s.ships sc ON sc.ship_id = sh.macro "
    "LEFT JOIN s.orders so ON so.order_id = json_extract(sh.extra_json, '$.current_order') "
    "LEFT JOIN s.assignments sa ON sa.assignment_id = json_extract(sh.extra_json, '$.subordinate_assignment') "
    "LEFT JOIN s.sectors ship_sec ON LOWER(ship_sec.sector_id) = LOWER(sh.sector_id) "
    "LEFT JOIN stations st ON npc.location_station_id = st.station_id "
    "LEFT JOIN s.sectors st_sec ON LOWER(st_sec.sector_id) = LOWER(st.sector_id) "
    "LEFT JOIN s.sectors extra_sec ON LOWER(extra_sec.sector_id) = LOWER(json_extract(npc.extra_json, '$.sector_id'))"
)


@router.get("/npcs", response_model=list[NPCEntry])
def list_npcs(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    employment: Annotated[str | None, Query(description="Filter by employment: owned, hireable")] = None,
    owner: Annotated[str | None, Query(description="Filter by owner faction (e.g. player)")] = None,
    entity_type: Annotated[str | None, Query(description="Filter by role (officer, aipilot, engineer, defence)")] = None,
    limit: Annotated[int, Query(ge=1, le=5000, description="Max entries")] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[NPCEntry]:
    if not table_exists(conn, "npc"):
        return []

    where = []
    params: list[str | int] = []
    if employment:
        where.append("npc.employment = ?")
        params.append(employment)
    if owner:
        where.append("npc.owner_faction = ?")
        params.append(owner)
    if entity_type:
        where.append("npc.entity_type = ?")
        params.append(entity_type)

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])

    rows = conn.execute(
        f"""
        SELECT {_NPC_JOINED_COLS}
        FROM npc
        {_NPC_JOINS}
        {clause}
        ORDER BY npc.name
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()
    result: list[NPCEntry] = []
    for r in rows:
        d = dict(r)
        d["location_ship_icon_url"] = get_icon_url(d.pop("_ship_icon_path", None))
        result.append(NPCEntry(**d))
    return result
