"""REST endpoints for game ships."""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.icons import get_icon_url
from x4_api.api.schemas import PublicModel

router = APIRouter()

ICON_BASE = "/static/icons"


class ShipSummary(PublicModel):
    ship_id: str
    name: str
    dlc: str | None
    class_id: str | None
    ship_type: str | None
    faction_id: str | None
    role: str | None
    hull: int | None
    cargo_volume: int | None
    speed_min: float | None
    speed_max: float | None
    icon_url: str | None
    image_url: str | None


class ShipSoftware(PublicModel):
    ware_id: str
    compatible: int
    is_default: int


class ShipDetail(ShipSummary):
    description: str | None
    basename: str | None
    secrecy_level: int | None
    travel_min: float | None
    travel_max: float | None
    boost_min: float | None
    boost_max: float | None
    pitch_min: float | None
    pitch_max: float | None
    yaw_min: float | None
    yaw_max: float | None
    roll_min: float | None
    roll_max: float | None
    shield_capacity_min: float | None
    shield_capacity_max: float | None
    shield_recharge_min: float | None
    shield_recharge_max: float | None
    shield_delay_min: float | None
    shield_delay_max: float | None
    radar_range: float | None
    mass: float | None
    drag_forward: float | None
    drag_reverse: float | None
    drag_horizontal: float | None
    drag_vertical: float | None
    drag_pitch: float | None
    drag_yaw: float | None
    drag_roll: float | None
    inertia_pitch: float | None
    inertia_yaw: float | None
    inertia_roll: float | None
    people_capacity: int | None
    missile_storage: int | None
    drone_storage: int | None
    countermeasure_storage: int | None
    deployable_storage: int | None
    weapons_s: int
    weapons_m: int
    weapons_l: int
    weapons_xl: int
    turrets_s: int
    turrets_m: int
    turrets_l: int
    turrets_xl: int
    shields_s: int
    shields_m: int
    shields_l: int
    shields_xl: int
    engines_s: int
    engines_m: int
    engines_l: int
    engines_xl: int
    software: list[ShipSoftware]
    drop_list_id: str | None


_DETAIL_COLS = (
    "ship_id, name, description, basename, dlc, class_id, ship_type, role, faction_id, "
    "hull, cargo_volume, speed_min, speed_max, icon_path, "
    "secrecy_level, "
    "travel_min, travel_max, boost_min, boost_max, "
    "pitch_min, pitch_max, yaw_min, yaw_max, roll_min, roll_max, "
    "shield_capacity_min, shield_capacity_max, shield_recharge_min, shield_recharge_max, "
    "shield_delay_min, shield_delay_max, radar_range, "
    "mass, drag_forward, drag_reverse, drag_horizontal, drag_vertical, "
    "drag_pitch, drag_yaw, drag_roll, "
    "inertia_pitch, inertia_yaw, inertia_roll, "
    "people_capacity, missile_storage, drone_storage, "
    "countermeasure_storage, deployable_storage, "
    "weapons_s, weapons_m, weapons_l, weapons_xl, "
    "turrets_s, turrets_m, turrets_l, turrets_xl, "
    "shields_s, shields_m, shields_l, shields_xl, "
    "engines_s, engines_m, engines_l, engines_xl"
)


@router.get("/ships", response_model=list[ShipSummary])
def list_ships(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    class_id: str | None = Query(None),
    faction_id: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ShipSummary]:
    """List all ships in the game catalog."""
    sql = [
        "SELECT ship_id, name, dlc, class_id, ship_type, role, faction_id, hull, cargo_volume, speed_min, speed_max, icon_path",
        "FROM s.ships WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if class_id is not None:
        sql.append("AND class_id = :class_id")
        params["class_id"] = class_id
    if faction_id is not None:
        sql.append("AND faction_id = :faction_id")
        params["faction_id"] = faction_id
    sql.append("ORDER BY ship_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [
        ShipSummary(
            ship_id=r["ship_id"],
            name=r["name"],
            dlc=r["dlc"],
            class_id=r["class_id"],
            ship_type=r["ship_type"],
            role=r["role"],
            faction_id=r["faction_id"],
            hull=r["hull"],
            cargo_volume=r["cargo_volume"],
            speed_min=r["speed_min"],
            speed_max=r["speed_max"],
            icon_url=get_icon_url(r["icon_path"]),
            image_url=get_icon_url(f"ship_{r['ship_id']}"),
        )
        for r in rows
    ]


@router.get("/ships/{ship_id}", response_model=ShipDetail)
def get_ship(
    ship_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> ShipDetail:
    """Get detailed stats for a specific ship."""
    row = conn.execute(
        f"SELECT {_DETAIL_COLS} FROM s.ships WHERE ship_id = :id", {"id": ship_id}
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown ship_id: {ship_id}")
    sw_rows = conn.execute(
        "SELECT ware_id, compatible, is_default FROM s.ship_software WHERE ship_id = :id ORDER BY ware_id",
        {"id": ship_id},
    ).fetchall()
    r = dict(row)
    r["icon_url"] = get_icon_url(r.pop("icon_path"))
    r["image_url"] = get_icon_url(f"ship_{r['ship_id']}")
    r["software"] = [ShipSoftware(**dict(s)) for s in sw_rows]
    r["drop_list_id"] = _resolve_drop_list(conn, r["ship_id"], r["class_id"], r["faction_id"], r["role"])
    return ShipDetail(**r)


_SIZE = {"s": "small", "m": "medium", "l": "large", "xl": "large", "xs": "small"}


def _resolve_drop_list(
    conn: sqlite3.Connection,
    ship_id: str,
    class_id: str | None,
    faction_id: str | None,
    role: str | None,
) -> str | None:
    size = _SIZE.get(class_id or "")
    if not size:
        return None

    if faction_id == "xenon":
        candidate = f"ship_{size}_xenon"
    elif faction_id == "khaak":
        candidate = f"ship_{size}_khaak"
    elif ship_id.startswith("ship_pir_") and size == "small":
        candidate = "ship_small_pirate"
    elif role == "fight":
        candidate = f"ship_{size}_military"
    else:
        candidate = f"ship_{size}_civilian"

    exists = conn.execute(
        "SELECT 1 FROM s.drop_lists WHERE list_id = :id", {"id": candidate}
    ).fetchone()
    return candidate if exists else None

