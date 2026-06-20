"""REST endpoints for live mission data.

Active missions, mission offers, and mission group reference enrichment.
"""


import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


# ── Response models ──────────────────────────────────────────────────────────


class MissionObjective(PublicModel):
    step: int | None
    type: str | None
    text: str | None
    is_active: bool
    target_id: str | None = None
    target_name: str | None = None
    target_sector_id: str | None = None
    target_zone_id: str | None = None
    target_x: float | None = None
    target_y: float | None = None
    target_z: float | None = None
    progress_current: int | None = None
    progress_max: int | None = None
    progress_name: str | None = None
    encyclopedia_type: str | None = None
    encyclopedia_item: str | None = None


class Mission(PublicModel):
    mission_id: str | None
    name: str | None
    description: str | None
    faction: str | None
    type: str | None
    level: str | None
    is_active: bool
    priority: int | None
    abortable: bool | None
    associated_entity: str | None
    associated_entity_name: str | None = None
    associated_entity_kind: str | None = None  # "ship" | "station" | "npc" | "deployable"
    associated_entity_sector_id: str | None = None
    associated_entity_zone_id: str | None = None
    associated_entity_x: float | None = None
    associated_entity_y: float | None = None
    associated_entity_z: float | None = None
    group_id: str | None
    group_name: str | None = None
    is_story: bool | None = None
    rewardtext: str | None = None
    reward_credits: int | None = None
    opposing_faction: str | None = None   # parsed from extra_json
    caption: str | None = None
    icon: str | None = None
    time: str | float | None = None        # in-game seconds (float from DB, string from extra_json)
    activation: str | None = None
    alert: str | None = None
    objectives: list[MissionObjective] = []


class MissionOffer(PublicModel):
    offer_id: str | None
    name: str | None
    description: str | None
    faction: str | None
    type: str | None
    level: str | None
    actor: str | None
    actor_name: str | None = None
    station_id: str | None
    station_name: str | None = None
    bbs_station_id: str | None = None
    bbs_station_name: str | None = None
    station_sector_id: str | None = None
    station_zone_id: str | None = None
    station_x: float | None = None
    station_z: float | None = None
    bbs_station_sector_id: str | None = None
    bbs_station_zone_id: str | None = None
    bbs_station_x: float | None = None
    bbs_station_z: float | None = None
    is_repeatable: bool
    rewardtext: str | None = None
    reward_credits: int | None = None
    opposing_faction: str | None = None
    group_id: str | None = None
    component_id: str | None = None
    distance: int | None = None
    thread_type: str | None = None
    duration: float | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_extra(extra_json: str | None) -> dict:
    """Parse extra_json into a dict of enrichment fields.

    These serve as fallbacks for existing DBs that don't have the dedicated columns yet.
    The handler prefers the dedicated column; this function fills gaps.
    """
    result: dict = {}
    if extra_json:
        try:
            extra = json.loads(extra_json)
            # All fields — handler uses column value if present, else falls back to these
            result["rewardtext"] = extra.get("rewardtext")
            reward_raw = extra.get("reward")
            if reward_raw is not None:
                result["reward_credits"] = int(reward_raw)
            result["opposing_faction"] = extra.get("opposingfaction")
            result["caption"] = extra.get("caption")
            result["icon"] = extra.get("icon")
            result["time"] = extra.get("time")
            result["group_id"] = extra.get("group")
            result["is_story"] = bool(extra.get("group", "").startswith("story_"))
            result["activation"] = extra.get("activation")
            result["alert"] = extra.get("alert")
            # For old data where group was in extra_json, provide it for group_name lookup
            if extra.get("group"):
                result["extra_group_id"] = extra["group"]
        except (json.JSONDecodeError, ValueError):
            pass
    return result


def _load_objectives(
    conn: sqlite3.Connection, mission_ids: list[str]
) -> dict[str, list[MissionObjective]]:
    """Batch-load objectives for a set of mission IDs."""
    result: dict[str, list[MissionObjective]] = {}
    if not mission_ids:
        return result
    obj_rows = conn.execute(
        f"""SELECT mission_id, step, type, text, is_active,
                   target_id, progress_current, progress_max, progress_name,
                   encyclopedia_type, encyclopedia_item
            FROM mission_objectives
            WHERE mission_id IN ({','.join('?' for _ in mission_ids)})
            ORDER BY mission_id, step""",
        mission_ids,
    ).fetchall()
    for orow in obj_rows:
        result.setdefault(orow["mission_id"], []).append(
            MissionObjective(
                step=orow["step"],
                type=orow["type"],
                text=orow["text"],
                is_active=bool(orow["is_active"]),
                target_id=orow["target_id"],
                progress_current=orow["progress_current"],
                progress_max=orow["progress_max"],
                progress_name=orow["progress_name"],
                encyclopedia_type=orow["encyclopedia_type"],
                encyclopedia_item=orow["encyclopedia_item"],
            )
        )
    return result


def _resolve_entities(
    conn: sqlite3.Connection, entity_ids: set[str]
) -> dict[str, dict]:
    """Batch-resolve ``[0x...]`` entity references to (kind, name) pairs.

    Queries each lookup table once so the cost stays O(tables) regardless of
    how many entity references are passed.  Prefers ``name``, falling back to
    ``code``, then the raw reference itself.
    """
    if not entity_ids:
        return {}
    resolved: dict[str, dict] = {}

    for table, id_col, kind_label in [
        ("npc", "id", "npc"),
        ("ships", "ship_id", "ship"),
        ("stations", "station_id", "station"),
    ]:
        try:
            rows = conn.execute(
                f"SELECT {id_col}, name, code FROM {table} "
                f"WHERE {id_col} IN ({','.join('?' for _ in entity_ids)})",
                list(entity_ids),
            ).fetchall()
        except sqlite3.OperationalError:
            continue
        for r in rows:
            resolved[r[0]] = {
                "kind": kind_label,
                "name": r[1] or r[2] or r[0],
            }

    # deployables have no `name` column — resolve by `code` (or `class` as fallback)
    try:
        rows = conn.execute(
            f"SELECT id, code, class FROM deployables "
            f"WHERE id IN ({','.join('?' for _ in entity_ids)})",
            list(entity_ids),
        ).fetchall()
    except sqlite3.OperationalError:
        pass
    else:
        for r in rows:
            resolved[r[0]] = {
                "kind": "deployable",
                "name": r[1] or r[2] or r[0],
            }

    return resolved


def _resolve_group_names(
    conn: sqlite3.Connection, group_ids: set[str]
) -> dict[str, dict[str, str | bool | None]]:
    """Batch-lookup human-readable names + story flag for group ids."""
    if not group_ids:
        return {}
    rows = conn.execute(
        f"""SELECT group_id, name, is_story FROM s.mission_groups
            WHERE group_id IN ({','.join('?' for _ in group_ids)})""",
        list(group_ids),
    ).fetchall()
    return {r[0]: {"name": r[1], "is_story": bool(r[2])} for r in rows}


def _resolve_entity_positions(
    conn: sqlite3.Connection, entity_ids: set[str]
) -> dict[str, dict[str, str | float | None]]:
    """Batch-resolve entity references to position data.

    Returns ``{entity_id: {sector_id, zone_id, x, y, z}}`` for any entity
    found in ``stations``, ``ships``, or ``deployables``.  NPCs are resolved
    by walking their ``location_ship_id`` / ``location_station_id`` to the
    parent entity's coordinates.  Entities that can't be resolved are simply
    omitted from the result dict.
    """
    if not entity_ids:
        return {}

    positions: dict[str, dict[str, str | float | None]] = {}
    remaining = set(entity_ids)

    # Direct lookup — these tables all carry sector_id / zone_id / x / y / z.
    for table, id_col in [
        ("ships", "ship_id"),
        ("stations", "station_id"),
        ("deployables", "id"),
    ]:
        if not remaining:
            break
        try:
            rows = conn.execute(
                f"SELECT {id_col}, sector_id, zone_id, x, y, z FROM {table} "
                f"WHERE {id_col} IN ({','.join('?' for _ in remaining)})",
                list(remaining),
            ).fetchall()
        except sqlite3.OperationalError:
            continue
        for r in rows:
            positions[r[0]] = {
                "sector_id": r[1],
                "zone_id": r[2],
                "x": r[3],
                "y": r[4],
                "z": r[5],
            }
            remaining.discard(r[0])

    # NPCs — resolve via their parent ship or station.
    if remaining:
        try:
            rows = conn.execute(
                f"SELECT id, location_ship_id, location_station_id FROM npc "
                f"WHERE id IN ({','.join('?' for _ in remaining)})",
                list(remaining),
            ).fetchall()
        except sqlite3.OperationalError:
            rows = []

        parent_refs: set[str] = set()
        npc_parent: dict[str, str] = {}
        for r in rows:
            parent_id = r[1] or r[2]
            if parent_id:
                parent_refs.add(parent_id)
                npc_parent[r[0]] = parent_id

        if parent_refs:
            parent_positions = _resolve_entity_positions(conn, parent_refs)
            for npc_id, parent_id in npc_parent.items():
                if parent_id in parent_positions:
                    positions[npc_id] = parent_positions[parent_id]

    return positions


# ── List missions ────────────────────────────────────────────────────────────


@router.get("/missions", response_model=list[Mission])
def list_missions(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    faction: Annotated[str | None, Query(description="Filter by faction id")] = None,
    type: Annotated[str | None, Query(description="Filter by mission type")] = None,
    active_only: Annotated[bool | None, Query(description="Only active missions")] = None,
) -> list[Mission]:
    """List all active missions enriched with reference group data."""
    clauses = ["1=1"]
    params: dict = {}
    if faction:
        clauses.append("m.faction = :faction")
        params["faction"] = faction
    if type:
        clauses.append("m.type = :type")
        params["type"] = type
    if active_only:
        clauses.append("m.is_active = 1")

    rows = conn.execute(
        f"""SELECT * FROM missions m
            WHERE {' AND '.join(clauses)}
            ORDER BY m.is_active DESC, m.priority, m.mission_id""",
        params,
    ).fetchall()

    mission_ids = [r["mission_id"] for r in rows]
    objectives_by_mission = _load_objectives(conn, mission_ids)

    # Collect entity references for batch resolution.
    entity_refs: set[str] = set()
    for r in rows:
        if r["associated_entity"]:
            entity_refs.add(r["associated_entity"])
    for objs in objectives_by_mission.values():
        for obj in objs:
            if obj.target_id:
                entity_refs.add(obj.target_id)
    resolved = _resolve_entities(conn, entity_refs)
    positions = _resolve_entity_positions(conn, entity_refs)

    # Collect group IDs to resolve their names.
    group_ids: set[str] = set()
    for r in rows:
        d = dict(r)
        extra_json = d.get("extra_json")
        enrichment = _parse_extra(extra_json)
        gid = d.get("group_id") or enrichment.get("extra_group_id")
        if gid:
            group_ids.add(gid)
    group_names = _resolve_group_names(conn, group_ids)

    result: list[Mission] = []
    for r in rows:
        d = dict(r)
        extra_json = d.pop("extra_json", None)
        enrichment = _parse_extra(extra_json)

        # Use dedicated columns, falling back to extra_json for existing DBs.
        # Put column-first values into enrichment so the explicit kwargs below pick them up.
        for key, ej_key in [
            ("rewardtext", "rewardtext"),
            ("reward_credits", "reward_credits"),
            ("opposing_faction", "opposing_faction"),
            ("caption", "caption"),
            ("icon", "icon"),
            ("time", "time"),
        ]:
            if d.get(key) is not None:
                enrichment[key] = d[key]
            elif enrichment.get(ej_key) is not None:
                enrichment[key] = enrichment[ej_key]
        # group_id and is_story go through **d (not explicit kwargs)
        if not d.get("group_id") and enrichment.get("group_id"):
            d["group_id"] = enrichment["group_id"]
        if not d.get("is_story") and enrichment.get("is_story"):
            d["is_story"] = int(enrichment["is_story"])

        # Resolve associated entity.
        ae_ref = d.get("associated_entity")
        ae_info = resolved.get(ae_ref) if ae_ref else None
        ae_pos = positions.get(ae_ref) if ae_ref else None

        # Fill in target names on objectives.
        raw_objectives = objectives_by_mission.get(d["mission_id"], [])
        mission_objectives: list[MissionObjective] = []
        for obj in raw_objectives:
            tgt_name: str | None = None
            tgt_pos: dict | None = None
            if obj.target_id:
                rhs = resolved.get(obj.target_id)
                if rhs:
                    tgt_name = rhs["name"]
                tgt_pos = positions.get(obj.target_id)
            mission_objectives.append(
                MissionObjective(
                    step=obj.step,
                    type=obj.type,
                    text=obj.text,
                    is_active=obj.is_active,
                    target_id=obj.target_id,
                    target_name=tgt_name,
                    target_sector_id=tgt_pos["sector_id"] if tgt_pos else None,
                    target_zone_id=tgt_pos["zone_id"] if tgt_pos else None,
                    target_x=tgt_pos["x"] if tgt_pos else None,
                    target_y=tgt_pos["y"] if tgt_pos else None,
                    target_z=tgt_pos["z"] if tgt_pos else None,
                    progress_current=obj.progress_current,
                    progress_max=obj.progress_max,
                    progress_name=obj.progress_name,
                    encyclopedia_type=obj.encyclopedia_type,
                    encyclopedia_item=obj.encyclopedia_item,
                )
            )

        # Pop keys that we pass explicitly to avoid duplicate-kwarg errors
        for pop_key in ("rewardtext", "reward_credits", "opposing_faction",
                        "caption", "icon", "time"):
            d.pop(pop_key, None)

        result.append(Mission(
            **d,
            associated_entity_name=ae_info["name"] if ae_info else None,
            associated_entity_kind=ae_info["kind"] if ae_info else None,
            associated_entity_sector_id=ae_pos["sector_id"] if ae_pos else None,
            associated_entity_zone_id=ae_pos["zone_id"] if ae_pos else None,
            associated_entity_x=ae_pos["x"] if ae_pos else None,
            associated_entity_y=ae_pos["y"] if ae_pos else None,
            associated_entity_z=ae_pos["z"] if ae_pos else None,
            group_name=(group_names.get(d["group_id"]) or {}).get("name") if d.get("group_id") else None,
            rewardtext=enrichment.get("rewardtext"),
            reward_credits=enrichment.get("reward_credits"),
            opposing_faction=enrichment.get("opposing_faction"),
            caption=enrichment.get("caption"),
            icon=enrichment.get("icon"),
            time=enrichment.get("time"),
            objectives=mission_objectives,
        ))
    return result


# ── Mission offers (MUST be before /{mission_id} to avoid route collision) ───


@router.get("/missions/offers", response_model=list[MissionOffer])
def list_mission_offers(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    faction: Annotated[str | None, Query(description="Filter by faction")] = None,
    repeatable_only: Annotated[bool | None, Query(description="Only repeatable guild/war offers")] = None,
    exclude_tutorials: Annotated[bool | None, Query(description="Exclude tutorial offers")] = True,
) -> list[MissionOffer]:
    """List available mission offers (the mission board)."""
    clauses = ["1=1"]
    params: dict = {}
    if faction:
        clauses.append("faction = :faction")
        params["faction"] = faction
    if repeatable_only:
        clauses.append("is_repeatable = 1")
    if exclude_tutorials:
        clauses.append("type != 'tutorial'")

    rows = conn.execute(
        f"""SELECT * FROM mission_offers
            WHERE {' AND '.join(clauses)}
            ORDER BY is_repeatable DESC, level, name""",
        params,
    ).fetchall()

    # Resolve entity references (actor, station).
    entity_refs: set[str] = set()
    for r in rows:
        for col in ("actor", "station_id", "bbs_station_id"):
            if r[col]:
                entity_refs.add(r[col])
    resolved = _resolve_entities(conn, entity_refs)
    positions = _resolve_entity_positions(conn, entity_refs)

    result: list[MissionOffer] = []
    for r in rows:
        d = dict(r)
        # Name resolution for actor / station / BBS
        for ref_col, name_col in [
            ("actor", "actor_name"),
            ("station_id", "station_name"),
            ("bbs_station_id", "bbs_station_name"),
        ]:
            ref = d.get(ref_col)
            if ref:
                rhs = resolved.get(ref)
                if rhs:
                    d[name_col] = rhs["name"]

        # Promote extra_json fields (fallback when dedicated columns are null / missing)
        ej_raw = d.get("extra_json")
        if ej_raw:
            try:
                ej = json.loads(ej_raw)
            except (json.JSONDecodeError, TypeError):
                ej = {}
            for col, ej_key in [
                ("opposing_faction", "opposingfaction"),
                ("group_id", "group"),
                ("reward_credits", "reward"),
                ("component_id", "component"),
                ("distance", "distance"),
                ("thread_type", "threadtype"),
                ("duration", "duration"),
            ]:
                if not d.get(col) and ej.get(ej_key) is not None:
                    val = ej[ej_key]
                    if col in ("reward_credits", "distance"):
                        try:
                            val = int(val)
                        except (ValueError, TypeError):
                            continue
                    elif col == "duration":
                        try:
                            val = float(val)
                        except (ValueError, TypeError):
                            continue
                    d[col] = val

        # Remove DB columns not defined on the Pydantic model
        d.pop("extra_json", None)

        # Resolve station / BBS positions for map display
        for prefix, ref_col in [("station", "station_id"), ("bbs_station", "bbs_station_id")]:
            ref = d.get(ref_col)
            if ref:
                pos = positions.get(ref)
                if pos:
                    d[f"{prefix}_sector_id"] = pos.get("sector_id")
                    d[f"{prefix}_zone_id"] = pos.get("zone_id")
                    d[f"{prefix}_x"] = pos.get("x")
                    d[f"{prefix}_z"] = pos.get("z")

        result.append(MissionOffer(**d))
    return result


# ── Single mission detail ────────────────────────────────────────────────────


@router.get("/missions/{mission_id}", response_model=Mission)
def get_mission(
    mission_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> Mission:
    row = conn.execute(
        """SELECT * FROM missions m
           WHERE m.mission_id = :id""",
        {"id": mission_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown mission: {mission_id}")

    d = dict(row)
    extra_json = d.pop("extra_json", None)
    enrichment = _parse_extra(extra_json)
    # Use dedicated columns, falling back to extra_json for existing DBs
    for key, ej_key in [
        ("rewardtext", "rewardtext"),
        ("reward_credits", "reward_credits"),
        ("opposing_faction", "opposing_faction"),
        ("caption", "caption"),
        ("icon", "icon"),
        ("time", "time"),
    ]:
        if d.get(key) is not None:
            enrichment[key] = d[key]
        elif enrichment.get(ej_key) is not None:
            enrichment[key] = enrichment[ej_key]
    if not d.get("group_id") and enrichment.get("group_id"):
        d["group_id"] = enrichment["group_id"]
    if not d.get("is_story") and enrichment.get("is_story"):
        d["is_story"] = int(enrichment["is_story"])

    objectives = _load_objectives(conn, [mission_id])

    # Resolve entity references.
    entity_refs: set[str] = set()
    if d.get("associated_entity"):
        entity_refs.add(d["associated_entity"])
    for obj in objectives.get(mission_id, []):
        if obj.target_id:
            entity_refs.add(obj.target_id)
    resolved = _resolve_entities(conn, entity_refs)
    positions = _resolve_entity_positions(conn, entity_refs)

    # Resolve group name.
    gid = d.get("group_id")
    group_names = _resolve_group_names(conn, {gid}) if gid else {}

    # Fill in target names and positions on objectives.
    final_objectives: list[MissionObjective] = []
    for obj in objectives.get(mission_id, []):
        tgt_name: str | None = None
        tgt_pos: dict | None = None
        if obj.target_id:
            rhs = resolved.get(obj.target_id)
            if rhs:
                tgt_name = rhs["name"]
            tgt_pos = positions.get(obj.target_id)
        final_objectives.append(
            MissionObjective(
                step=obj.step,
                type=obj.type,
                text=obj.text,
                is_active=obj.is_active,
                target_id=obj.target_id,
                target_name=tgt_name,
                target_sector_id=tgt_pos["sector_id"] if tgt_pos else None,
                target_zone_id=tgt_pos["zone_id"] if tgt_pos else None,
                target_x=tgt_pos["x"] if tgt_pos else None,
                target_y=tgt_pos["y"] if tgt_pos else None,
                target_z=tgt_pos["z"] if tgt_pos else None,
                progress_current=obj.progress_current,
                progress_max=obj.progress_max,
                progress_name=obj.progress_name,
                encyclopedia_type=obj.encyclopedia_type,
                encyclopedia_item=obj.encyclopedia_item,
            )
        )

    ae_ref = d.get("associated_entity")
    ae_info = resolved.get(ae_ref) if ae_ref else None
    ae_pos = positions.get(ae_ref) if ae_ref else None

    # Pop keys that we pass explicitly to avoid duplicate-kwarg errors
    for pop_key in ("rewardtext", "reward_credits", "opposing_faction",
                    "caption", "icon", "time"):
        d.pop(pop_key, None)

    return Mission(
        **d,
        associated_entity_name=ae_info["name"] if ae_info else None,
        associated_entity_kind=ae_info["kind"] if ae_info else None,
        associated_entity_sector_id=ae_pos["sector_id"] if ae_pos else None,
        associated_entity_zone_id=ae_pos["zone_id"] if ae_pos else None,
        associated_entity_x=ae_pos["x"] if ae_pos else None,
        associated_entity_y=ae_pos["y"] if ae_pos else None,
        associated_entity_z=ae_pos["z"] if ae_pos else None,
        group_name=(group_names.get(gid) or {}).get("name") if gid else None,
        rewardtext=enrichment.get("rewardtext"),
        reward_credits=enrichment.get("reward_credits"),
        opposing_faction=enrichment.get("opposing_faction"),
        caption=enrichment.get("caption"),
        icon=enrichment.get("icon"),
        time=enrichment.get("time"),
        objectives=final_objectives,
    )
