"""REST endpoints for the diplomacy system."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.db_utils import fetch_one_or_404
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class BribeWare(PublicModel):
    ware_id: str | None
    ware_tags: str | None
    amount: int | None


class DiploAction(PublicModel):
    action_id: str
    category: str | None
    name: str | None
    description: str | None
    hidden: int
    cost_influence: int | None
    cost_money: int | None
    success_chance: int | None
    duration_sec: int | None
    cooldown_sec: int | None
    agent_type: str | None
    agent_experience: int | None
    risk: str | None
    bribe_wares: list[BribeWare]


class DiploGift(PublicModel):
    ware_id: str
    faction_id: str


class AgentRank(PublicModel):
    min_value: int
    name: str | None
    event_bonus: float | None
    icon: str | None


@router.get("/diplomacy/actions", response_model=list[DiploAction])
def list_diplo_actions(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    category: str | None = Query(None, description="Filter by category: negotiation | espionage | interference"),
    include_hidden: bool = Query(False),
) -> list[DiploAction]:
    """List all diplomatic agent actions."""
    sql = ["SELECT action_id, category, name, description, hidden, cost_influence, cost_money,",
           "success_chance, duration_sec, cooldown_sec, agent_type, agent_experience, risk",
           "FROM s.diplo_actions WHERE 1=1"]
    params: dict[str, object] = {}
    if category is not None:
        sql.append("AND category = :category")
        params["category"] = category
    if not include_hidden:
        sql.append("AND hidden = 0")
    sql.append("ORDER BY category, action_id")

    rows = conn.execute(" ".join(sql), params).fetchall()
    bribe_rows = conn.execute(
        "SELECT action_id, ware_id, ware_tags, amount FROM s.diplo_action_bribe_wares"
    ).fetchall()

    bribes_by_action: dict[str, list[BribeWare]] = {}
    for br in bribe_rows:
        bribes_by_action.setdefault(br["action_id"], []).append(
            BribeWare(ware_id=br["ware_id"], ware_tags=br["ware_tags"], amount=br["amount"])
        )

    return [
        DiploAction(**dict(r), bribe_wares=bribes_by_action.get(r["action_id"], []))
        for r in rows
    ]


@router.get("/diplomacy/actions/{action_id}", response_model=DiploAction)
def get_diplo_action(
    action_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> DiploAction:
    row = fetch_one_or_404(
        conn,
        """SELECT action_id, category, name, description, hidden, cost_influence, cost_money,
                  success_chance, duration_sec, cooldown_sec, agent_type, agent_experience, risk
           FROM s.diplo_actions WHERE action_id = :id""",
        {"id": action_id},
        f"Unknown action_id: {action_id}",
    )
    bribe_rows = conn.execute(
        "SELECT ware_id, ware_tags, amount FROM s.diplo_action_bribe_wares WHERE action_id = :id",
        {"id": action_id},
    ).fetchall()
    return DiploAction(
        **dict(row),
        bribe_wares=[BribeWare(**dict(br)) for br in bribe_rows],
    )


@router.get("/diplomacy/gifts", response_model=list[DiploGift])
def list_diplo_gifts(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    faction_id: str | None = Query(None),
) -> list[DiploGift]:
    """List faction gift preferences. Filter by faction_id to find what a faction likes."""
    if faction_id is not None:
        rows = conn.execute(
            "SELECT ware_id, faction_id FROM s.diplo_gifts WHERE faction_id = :f ORDER BY ware_id",
            {"f": faction_id},
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT ware_id, faction_id FROM s.diplo_gifts ORDER BY faction_id, ware_id"
        ).fetchall()
    return [DiploGift(**dict(r)) for r in rows]


@router.get("/diplomacy/agent-ranks", response_model=list[AgentRank])
def list_agent_ranks(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[AgentRank]:
    """List agent rank thresholds and bonuses."""
    rows = conn.execute(
        "SELECT min_value, name, event_bonus, icon FROM s.diplo_agent_ranks ORDER BY min_value"
    ).fetchall()
    return [AgentRank(**dict(r)) for r in rows]
