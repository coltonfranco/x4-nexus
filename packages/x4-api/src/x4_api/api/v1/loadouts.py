"""REST endpoints for named ship loadout presets.

Loadouts are named equipment configurations assigned to ship macros — used for
game starts, tutorial ships, and NPC ship spawning. The equipment list answers
"what does this ship come equipped with by default?"
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class LoadoutEquipmentItem(PublicModel):
    slot_path: str | None
    macro: str
    kind: str
    optional: bool
    quantity: int | None
    weaponmode: str | None = None
    ammunition: str | None = None


class LoadoutDetail(PublicModel):
    loadout_id: str
    ship_macro: str
    name: str | None = None
    description: str | None = None
    equipment: list[LoadoutEquipmentItem]


def _fetch_loadout(conn: sqlite3.Connection, loadout_id: str, ship_macro: str, name: str | None = None, description: str | None = None) -> LoadoutDetail:
    eq_rows = conn.execute(
        "SELECT slot_path, macro, kind, optional, quantity, weaponmode, ammunition "
        "FROM s.loadout_equipment WHERE loadout_id = :id ORDER BY kind, slot_path",
        {"id": loadout_id},
    ).fetchall()
    return LoadoutDetail(
        loadout_id=loadout_id,
        ship_macro=ship_macro,
        name=name,
        description=description,
        equipment=[
            LoadoutEquipmentItem(
                slot_path=r["slot_path"],
                macro=r["macro"],
                kind=r["kind"],
                optional=bool(r["optional"]),
                quantity=r["quantity"],
                weaponmode=r["weaponmode"],
                ammunition=r["ammunition"],
            )
            for r in eq_rows
        ],
    )


@router.get("/loadouts", response_model=list[LoadoutDetail])
def list_loadouts(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    ship_macro: str | None = Query(None, description="Filter by ship macro ID"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[LoadoutDetail]:
    """List loadout presets with full equipment. Filter by ship_macro to see loadouts for a specific ship."""
    sql = ["SELECT loadout_id, ship_macro, name, description FROM s.loadouts WHERE 1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if ship_macro is not None:
        sql.append("AND ship_macro = :ship_macro")
        params["ship_macro"] = ship_macro
    sql.append("ORDER BY loadout_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [_fetch_loadout(conn, r["loadout_id"], r["ship_macro"], r["name"], r["description"]) for r in rows]


@router.get("/loadouts/{loadout_id}", response_model=LoadoutDetail)
def get_loadout(
    loadout_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> LoadoutDetail:
    """Get a specific loadout with its full equipment list."""
    row = conn.execute(
        "SELECT loadout_id, ship_macro, name, description FROM s.loadouts WHERE loadout_id = :id",
        {"id": loadout_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown loadout_id: {loadout_id}")
    return _fetch_loadout(conn, row["loadout_id"], row["ship_macro"], row["name"], row["description"])
