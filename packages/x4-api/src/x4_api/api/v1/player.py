"""REST endpoints for the player's current account, blueprints, and licences.

These read the active save's dynamic DB. Before any save is ingested the tables are
empty: the account endpoint 404s, the list endpoints return [].
"""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from x4_api.api.db_utils import fetch_one_or_404, table_exists
from x4_api.api.deps import get_db
from x4_api.api.faction_utils import disambiguate
from x4_api.api.schemas import PublicModel

router = APIRouter()


class PlayerAccount(PublicModel):
    player_id: str | None
    name: str | None
    credits: int | None
    hq_station_id: str | None
    current_sector: str | None
    current_ship_id: str | None
    sector_id: str | None = None
    zone_id: str | None = None


class BlueprintItem(PublicModel):
    ware_id: str


class LicenceItem(PublicModel):
    licence_type: str
    faction_id: str


class PlayerStat(PublicModel):
    stat_id: str
    value: float
    display: str


class PlayerRelation(PublicModel):
    faction_id: str
    faction_name: str | None
    color_hex: str | None
    relation: float
    initial_relation: float | None


@router.get("/player", response_model=PlayerAccount)
def get_player(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> PlayerAccount:
    """The player's account snapshot. 404 until a save has been ingested.

    Joins the player's current ship to resolve live position (sector/zone).
    """
    row = fetch_one_or_404(
        conn,
        "SELECT p.player_id, p.name, p.credits, p.hq_station_id, "
        "COALESCE(sh.sector_id, p.current_sector) AS current_sector, "
        "p.current_ship_id, sh.sector_id, sh.zone_id "
        "FROM player p "
        "LEFT JOIN ships sh ON sh.ship_id = p.current_ship_id "
        "WHERE p.id = 1",
        {},
        "No player data — ingest a save first.",
    )
    return PlayerAccount(**dict(row))


@router.get("/player/blueprints", response_model=list[BlueprintItem])
def list_blueprints(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[BlueprintItem]:
    """Ware IDs the player owns blueprints for."""
    rows = conn.execute("SELECT ware_id FROM player_blueprints ORDER BY ware_id").fetchall()
    return [BlueprintItem(**dict(r)) for r in rows]


@router.get("/player/licences", response_model=list[LicenceItem])
def list_licences(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[LicenceItem]:
    """Licences the player holds, with the granting faction."""
    rows = conn.execute(
        "SELECT licence_type, faction_id FROM player_licences ORDER BY licence_type, faction_id"
    ).fetchall()
    return [LicenceItem(**dict(r)) for r in rows]


@router.get("/player/stats", response_model=list[PlayerStat])
def player_stats(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[PlayerStat]:
    """Flat key-value player statistics from the save file."""
    if not table_exists(conn, "player_stats"):
        return []
    rows = conn.execute("SELECT stat_id, value FROM player_stats ORDER BY stat_id").fetchall()
    return [
        PlayerStat(
            stat_id=r["stat_id"],
            value=r["value"],
            display=_display_name(r["stat_id"]),
        )
        for r in rows
    ]


@router.get("/player/reputation", response_model=list[PlayerRelation])
def player_reputation(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[PlayerRelation]:
    """The player's current standing with every faction (best first), with gamestart drift."""
    rows = conn.execute(
        """
        SELECT f.faction_id, f.name AS faction_name, f.color_hex,
               COALESCE(c.relation, 0.0) AS relation,
               COALESCE(c.relation, 0.0) AS initial_relation
        FROM s.factions f
        LEFT JOIN faction_relations_current c 
               ON c.faction_id = 'player' AND c.other_faction_id = f.faction_id
        WHERE f.is_legacy = 0
        ORDER BY COALESCE(c.relation, 0.0) DESC
        """
    ).fetchall()

    return [
        PlayerRelation(**d) for d in disambiguate([dict(r) for r in rows], name_col="faction_name")
    ]


class PlayerMessage(PublicModel):
    id: int
    time: float
    title: str
    text: str | None
    source: str | None
    highpriority: int | None
    interact: str | None
    component: str | None
    component_name: str | None
    component_kind: str | None
    read: int | None
    extra_json: str | None


@router.get("/player/messages", response_model=list[PlayerMessage])
def player_messages(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[PlayerMessage]:
    """Player message inbox from the save file. Newest first."""
    rows = conn.execute(
        """
        SELECT pm.id, pm.time, pm.title, pm.text, pm.source,
               pm.highpriority, pm.interact, pm.component, pm.read, pm.extra_json,
               COALESCE(st.name, st.code) AS station_name,
               COALESCE(sh.name, sh.code) AS ship_name
        FROM player_messages pm
        LEFT JOIN stations st ON st.station_id = pm.component
        LEFT JOIN ships sh ON sh.ship_id = pm.component
        ORDER BY pm.time DESC
        """
    ).fetchall()

    result: list[PlayerMessage] = []
    for r in rows:
        d = dict(r)
        name = d.pop("station_name", None) or d.pop("ship_name", None)
        kind = "station" if d.get("station_name") else ("ship" if d.get("ship_name") else None)
        # Put the cleaned dict values back (station_name/ship_name already popped)
        result.append(
            PlayerMessage(
                id=d["id"],
                time=d["time"],
                title=d["title"],
                text=d["text"],
                source=d["source"],
                highpriority=d["highpriority"],
                interact=d["interact"],
                component=d["component"],
                component_name=name,
                component_kind=kind,
                read=d["read"],
                extra_json=d["extra_json"],
            )
        )
    return result


def _display_name(stat_id: str) -> str:
    """Convert snake_case stat_id to Title Case display name."""
    return " ".join(w.capitalize() for w in stat_id.split("_"))
