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
    shield_capacity_max: float | None
    cargo_volume: int | None
    dps_max: float | None
    speed_min: float | None
    speed_max: float | None
    travel_max: float | None
    boost_max: float | None
    accel_max: float | None
    shield_recharge_max: float | None
    radar_range: float | None
    range_max: float | None
    icon_url: str | None
    image_url: str | None
    people_capacity: int | None = None
    missile_storage: int | None = None
    drone_storage: int | None = None
    countermeasure_storage: int | None = None
    deployable_storage: int | None = None
    dock_s: int = 0
    dock_m: int = 0
    dock_l: int = 0
    dock_xl: int = 0
    storage_s: int = 0
    storage_m: int = 0
    storage_l: int = 0
    storage_xl: int = 0
    weapons_s: int = 0
    weapons_m: int = 0
    weapons_l: int = 0
    weapons_xl: int = 0
    turrets_s: int = 0
    turrets_m: int = 0
    turrets_l: int = 0
    turrets_xl: int = 0
    shields_s: int = 0
    shields_m: int = 0
    shields_l: int = 0
    shields_xl: int = 0
    engines_s: int = 0
    engines_m: int = 0
    engines_l: int = 0
    engines_xl: int = 0
    price_avg: int | None
    is_owned: bool = False
    restriction_licence: str | None = None
    is_obtainable: bool = False


class ShipSoftware(PublicModel):
    ware_id: str
    compatible: int
    is_default: int


class ShipDetail(ShipSummary):
    description: str | None
    basename: str | None
    variation: str | None
    secrecy_level: int | None
    travel_min: float | None
    travel_stability: float | None
    boost_min: float | None
    pitch_min: float | None
    pitch_max: float | None
    yaw_min: float | None
    yaw_max: float | None
    roll_min: float | None
    roll_max: float | None
    accel_forward: float | None
    decel_forward: float | None
    accel_boost: float | None
    accel_travel: float | None
    accel_strafe: float | None
    accel_angular: float | None
    accel_factor_reverse: float | None
    accel_factor_horizontal: float | None
    accel_factor_vertical: float | None
    modifier_weapon_heat: float | None
    explosion_damage: float | None
    explosion_shield_damage: float | None
    explosion_shield_disruption: float | None
    travel_stability: float | None
    gatherrate_gas: float | None
    gatherrate_ore: float | None
    gatherrate_silicon: float | None
    can_be_captured: int | None
    radar_range_direct: float | None
    boost_recharge_delay: float | None
    rotation_speed_max: float | None
    rotation_accel_max: float | None
    shield_capacity_min: float | None
    shield_recharge_min: float | None
    shield_delay_min: float | None
    shield_delay_max: float | None
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
    launch_tubes: int
    software: list[ShipSoftware]
    drop_list_id: str | None


_DETAIL_COLS = (
    "s.ship_id, s.name, s.description, s.basename, s.variation, s.dlc, s.class_id, s.ship_type, s.role, s.faction_id, "
    "s.hull, s.cargo_volume, s.dps_max, s.speed_min, s.speed_max, s.icon_path, "
    "secrecy_level, "
    "travel_min, travel_max, travel_stability, boost_min, boost_max, "
    "pitch_min, pitch_max, yaw_min, yaw_max, roll_min, roll_max, "
    "accel_forward, decel_forward, accel_boost, accel_travel, accel_strafe, accel_angular, "
    "accel_factor_reverse, accel_factor_horizontal, accel_factor_vertical, "
    "modifier_weapon_heat, explosion_damage, explosion_shield_damage, "
    "explosion_shield_disruption, travel_stability, "
    "gatherrate_gas, gatherrate_ore, gatherrate_silicon, "
    "can_be_captured, radar_range_direct, boost_recharge_delay, "
    "rotation_speed_max, rotation_accel_max, "
    "shield_capacity_min, shield_capacity_max, shield_recharge_min, shield_recharge_max, "
    "shield_delay_min, shield_delay_max, radar_range, s.accel_max, s.range_max, "
    "mass, drag_forward, drag_reverse, drag_horizontal, drag_vertical, "
    "drag_pitch, drag_yaw, drag_roll, "
    "inertia_pitch, inertia_yaw, inertia_roll, "
    "people_capacity, missile_storage, drone_storage, "
    "countermeasure_storage, deployable_storage, "
    "dock_s, dock_m, dock_l, dock_xl, "
    "storage_s, storage_m, storage_l, storage_xl, "
    "launch_tubes, "
    "weapons_s, weapons_m, weapons_l, weapons_xl, "
    "turrets_s, turrets_m, turrets_l, turrets_xl, "
    "shields_s, shields_m, shields_l, shields_xl, "
    "engines_s, engines_m, engines_l, engines_xl, "
    "w.price_avg, w.restriction_licence, "
    "EXISTS(SELECT 1 FROM ships dyn WHERE dyn.macro = s.ship_id AND dyn.is_player_owned = 1) AS is_owned, "
    "(w.ware_id IS NOT NULL AND s.faction_id NOT IN ('xenon', 'khaak') AND (w.restriction_licence IS NULL OR w.restriction_licence IN ('generaluseship', 'generaluseequipment') OR EXISTS (SELECT 1 FROM player_licences pl WHERE pl.licence_type = w.restriction_licence AND pl.faction_id = s.faction_id))) AS is_obtainable"
)


@router.get("/ships", response_model=list[ShipSummary])
def list_ships(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    class_id: str | None = Query(None),
    faction_id: str | None = Query(None),
    is_obtainable: bool | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ShipSummary]:
    """List all ships in the game catalog."""
    sql = [
        "SELECT s.ship_id, s.name, s.dlc, s.class_id, s.ship_type, s.role, s.faction_id, s.hull, s.shield_capacity_max, s.cargo_volume, s.dps_max, s.speed_min, s.speed_max, s.travel_max, s.boost_max, s.accel_max, s.shield_recharge_max, s.radar_range, s.range_max, s.people_capacity, s.missile_storage, s.drone_storage, s.countermeasure_storage, s.deployable_storage, s.dock_s, s.dock_m, s.dock_l, s.dock_xl, s.storage_s, s.storage_m, s.storage_l, s.storage_xl, s.weapons_s, s.weapons_m, s.weapons_l, s.weapons_xl, s.turrets_s, s.turrets_m, s.turrets_l, s.turrets_xl, s.shields_s, s.shields_m, s.shields_l, s.shields_xl, s.engines_s, s.engines_m, s.engines_l, s.engines_xl, s.icon_path, w.price_avg, w.restriction_licence,",
        "EXISTS(SELECT 1 FROM ships dyn WHERE dyn.macro = s.ship_id AND dyn.is_player_owned = 1) AS is_owned,",
        "(w.ware_id IS NOT NULL AND s.faction_id NOT IN ('xenon', 'khaak') AND (w.restriction_licence IS NULL OR w.restriction_licence IN ('generaluseship', 'generaluseequipment') OR EXISTS (SELECT 1 FROM player_licences pl WHERE pl.licence_type = w.restriction_licence AND pl.faction_id = s.faction_id))) AS is_obtainable",
        "FROM s.ships s",
        "LEFT JOIN s.wares w ON w.ware_id = REPLACE(s.ship_id, '_macro', '')",
        "WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if class_id is not None:
        sql.append("AND s.class_id = :class_id")
        params["class_id"] = class_id
    if faction_id is not None:
        sql.append("AND s.faction_id = :faction_id")
        params["faction_id"] = faction_id
    if is_obtainable:
        sql.append(
            "AND w.ware_id IS NOT NULL AND s.faction_id NOT IN ('xenon', 'khaak') "
            "AND (w.restriction_licence IS NULL OR w.restriction_licence IN ('generaluseship', 'generaluseequipment') OR EXISTS ("
            "SELECT 1 FROM player_licences pl "
            "WHERE pl.licence_type = w.restriction_licence AND pl.faction_id = s.faction_id"
            "))"
        )
    sql.append("ORDER BY s.ship_id LIMIT :limit OFFSET :offset")

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
            shield_capacity_max=r["shield_capacity_max"],
            cargo_volume=r["cargo_volume"],
            dps_max=r["dps_max"],
            speed_min=r["speed_min"],
            speed_max=r["speed_max"],
            travel_max=r["travel_max"],
            boost_max=r["boost_max"],
            accel_max=r["accel_max"],
            shield_recharge_max=r["shield_recharge_max"],
            radar_range=r["radar_range"],
            range_max=r["range_max"],
            people_capacity=r["people_capacity"],
            missile_storage=r["missile_storage"],
            drone_storage=r["drone_storage"],
            countermeasure_storage=r["countermeasure_storage"],
            deployable_storage=r["deployable_storage"],
            dock_s=r["dock_s"] or 0,
            dock_m=r["dock_m"] or 0,
            dock_l=r["dock_l"] or 0,
            dock_xl=r["dock_xl"] or 0,
            storage_s=r["storage_s"] or 0,
            storage_m=r["storage_m"] or 0,
            storage_l=r["storage_l"] or 0,
            storage_xl=r["storage_xl"] or 0,
            weapons_s=r["weapons_s"] or 0,
            weapons_m=r["weapons_m"] or 0,
            weapons_l=r["weapons_l"] or 0,
            weapons_xl=r["weapons_xl"] or 0,
            turrets_s=r["turrets_s"] or 0,
            turrets_m=r["turrets_m"] or 0,
            turrets_l=r["turrets_l"] or 0,
            turrets_xl=r["turrets_xl"] or 0,
            shields_s=r["shields_s"] or 0,
            shields_m=r["shields_m"] or 0,
            shields_l=r["shields_l"] or 0,
            shields_xl=r["shields_xl"] or 0,
            engines_s=r["engines_s"] or 0,
            engines_m=r["engines_m"] or 0,
            engines_l=r["engines_l"] or 0,
            engines_xl=r["engines_xl"] or 0,
            icon_url=get_icon_url(r["icon_path"]),
            image_url=get_icon_url(f"ship_{r['ship_id']}"),
            price_avg=r["price_avg"],
            is_owned=bool(r["is_owned"]),
            restriction_licence=r["restriction_licence"],
            is_obtainable=bool(r["is_obtainable"]),
        )
        for r in rows
    ]


class ClassMax(PublicModel):
    hull: int
    speed_max: float
    travel_max: float
    boost_max: float
    accel_max: float
    shield_capacity_max: float
    shield_recharge_max: float
    cargo_volume: int
    dps_max: float
    range_max: float


@router.get("/ships/class-max", response_model=ClassMax)
def class_max(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    class_id: str = Query(..., description="Canonical class_id, e.g. ship_xl"),
) -> ClassMax:
    """Return the maximum theoretical value for each stat among ships of the given class."""
    row = conn.execute(
        "SELECT MAX(hull), MAX(speed_max), MAX(travel_max), MAX(boost_max),"
        " MAX(accel_max), MAX(shield_capacity_max), MAX(shield_recharge_max),"
        " MAX(cargo_volume), MAX(dps_max), MAX(range_max)"
        " FROM s.ships WHERE class_id = :cid",
        {"cid": class_id},
    ).fetchone()
    if row is None or row[0] is None:
        raise HTTPException(status_code=404, detail=f"No ships found for class_id: {class_id}")
    return ClassMax(
        hull=row[0], speed_max=row[1] or 0, travel_max=row[2] or 0,
        boost_max=row[3] or 0, accel_max=row[4] or 0,
        shield_capacity_max=row[5] or 0, shield_recharge_max=row[6] or 0,
        cargo_volume=row[7] or 0, dps_max=row[8] or 0, range_max=row[9] or 0,
    )


@router.get("/ships/{ship_id}", response_model=ShipDetail)
def get_ship(
    ship_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> ShipDetail:
    """Get detailed stats for a specific ship."""
    row = conn.execute(
        f"SELECT {_DETAIL_COLS} FROM s.ships s LEFT JOIN s.wares w ON w.ware_id = REPLACE(s.ship_id, '_macro', '') WHERE s.ship_id = :id", {"id": ship_id}
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
    r["is_owned"] = bool(r["is_owned"])
    r["is_obtainable"] = bool(r["is_obtainable"])
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

