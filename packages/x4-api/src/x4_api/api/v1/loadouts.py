"""REST endpoint for ship loadouts (installed equipment)."""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class LoadoutSlot(PublicModel):
    ship_id: str
    slot_type: str
    slot_connection: str
    macro: str
    ammunition: int | None
    extra_json: str | None


@router.get("/ships/{ship_id}/loadout", response_model=list[LoadoutSlot])
def get_ship_loadout(
    ship_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[LoadoutSlot]:
    """All installed equipment slots for a ship. Empty list when the table doesn't exist yet."""
    has_table = bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ship_loadouts'"
        ).fetchone()
    )
    if not has_table:
        return []

    rows = conn.execute(
        """
        SELECT ship_id, slot_type, slot_connection, macro, ammunition, extra_json
        FROM ship_loadouts
        WHERE ship_id = ?
        ORDER BY slot_type, slot_connection
        """,
        (ship_id,),
    ).fetchall()
    return [LoadoutSlot(**dict(r)) for r in rows]
