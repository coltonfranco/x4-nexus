"""REST endpoints for the player's current account, blueprints, and licences.

These read the active save's dynamic DB. Before any save is ingested the tables are
empty: the account endpoint 404s, the list endpoints return [].
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class PlayerAccount(PublicModel):
    player_id: str | None
    name: str | None
    credits: int | None
    hq_station_id: str | None
    current_sector: str | None
    current_ship_id: str | None


class BlueprintItem(PublicModel):
    ware_id: str


class LicenceItem(PublicModel):
    licence_type: str
    faction_id: str


@router.get("/player", response_model=PlayerAccount)
def get_player(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> PlayerAccount:
    """The player's account snapshot. 404 until a save has been ingested."""
    row = conn.execute(
        "SELECT player_id, name, credits, hq_station_id, current_sector, current_ship_id "
        "FROM player WHERE id = 1"
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="No player data — ingest a save first.")
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
