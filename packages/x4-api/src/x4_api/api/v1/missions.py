"""REST endpoints for live mission data.

Active missions, mission offers, and mission group reference enrichment.
"""

from __future__ import annotations

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
    group_id: str | None
    is_story: bool | None = None
    rewardtext: str | None = None
    reward_credits: int | None = None
    opposing_faction: str | None = None   # parsed from extra_json
    caption: str | None = None             # parsed from extra_json
    icon: str | None = None                # parsed from extra_json
    time: str | None = None                # parsed from extra_json
    objectives: list[MissionObjective] = []


class MissionOffer(PublicModel):
    offer_id: str | None
    name: str | None
    description: str | None
    faction: str | None
    type: str | None
    level: str | None
    actor: str | None
    station_id: str | None
    bbs_station_id: str | None = None
    is_repeatable: bool
    rewardtext: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────


def _parse_extra(extra_json: str | None) -> dict:
    """Parse extra_json into a dict of enrichment fields."""
    result: dict = {}
    if extra_json:
        try:
            extra = json.loads(extra_json)
            result["rewardtext"] = extra.get("rewardtext")
            reward_raw = extra.get("reward")
            if reward_raw is not None:
                result["reward_credits"] = int(reward_raw)
            result["opposing_faction"] = extra.get("opposingfaction")
            result["caption"] = extra.get("caption")
            result["icon"] = extra.get("icon")
            result["time"] = extra.get("time")
            # Use the group from extra_json if the JOIN didn't find one
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
        f"""SELECT m.mission_id, m.name, m.description, m.faction, m.type, m.level,
                   m.is_active, m.priority, m.abortable, m.associated_entity,
                   mg.group_id, mg.is_story, m.extra_json
            FROM missions m
            LEFT JOIN s.mission_groups mg
              ON (mg.faction IS NOT NULL AND mg.faction = m.faction)
              OR (mg.group_id = 'story_' || m.faction)
            WHERE {' AND '.join(clauses)}
            ORDER BY m.is_active DESC, m.priority, m.mission_id""",
        params,
    ).fetchall()

    mission_ids = [r["mission_id"] for r in rows]
    objectives_by_mission = _load_objectives(conn, mission_ids)

    result: list[Mission] = []
    for r in rows:
        d = dict(r)
        extra_json = d.pop("extra_json", None)
        enrichment = _parse_extra(extra_json)

        # If the JOIN didn't find a group_id, use the one from extra_json
        if not d.get("group_id"):
            d["group_id"] = enrichment.get("extra_group_id")

        result.append(Mission(
            **d,
            rewardtext=enrichment.get("rewardtext"),
            reward_credits=enrichment.get("reward_credits"),
            opposing_faction=enrichment.get("opposing_faction"),
            caption=enrichment.get("caption"),
            icon=enrichment.get("icon"),
            time=enrichment.get("time"),
            objectives=objectives_by_mission.get(d["mission_id"], []),
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
        f"""SELECT offer_id, name, description, faction, type, level,
                   actor, station_id, bbs_station_id, is_repeatable, rewardtext
            FROM mission_offers
            WHERE {' AND '.join(clauses)}
            ORDER BY is_repeatable DESC, level, name""",
        params,
    ).fetchall()
    return [MissionOffer(**dict(r)) for r in rows]


# ── Single mission detail ────────────────────────────────────────────────────


@router.get("/missions/{mission_id}", response_model=Mission)
def get_mission(
    mission_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> Mission:
    row = conn.execute(
        """SELECT m.mission_id, m.name, m.description, m.faction, m.type, m.level,
                  m.is_active, m.priority, m.abortable, m.associated_entity,
                  mg.group_id, mg.is_story, m.extra_json
           FROM missions m
           LEFT JOIN s.mission_groups mg
             ON (mg.faction IS NOT NULL AND mg.faction = m.faction)
             OR (mg.group_id = 'story_' || m.faction)
           WHERE m.mission_id = :id""",
        {"id": mission_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown mission: {mission_id}")

    d = dict(row)
    extra_json = d.pop("extra_json", None)
    enrichment = _parse_extra(extra_json)
    if not d.get("group_id"):
        d["group_id"] = enrichment.get("extra_group_id")

    objectives = _load_objectives(conn, [mission_id])

    return Mission(
        **d,
        rewardtext=enrichment.get("rewardtext"),
        reward_credits=enrichment.get("reward_credits"),
        opposing_faction=enrichment.get("opposing_faction"),
        caption=enrichment.get("caption"),
        icon=enrichment.get("icon"),
        time=enrichment.get("time"),
        objectives=objectives.get(mission_id, []),
    )
