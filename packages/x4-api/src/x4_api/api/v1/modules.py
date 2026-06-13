"""Station modules endpoint."""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.icons import get_icon_url
from x4_api.api.schemas import PublicModel

router = APIRouter()

_LIST_COLS = (
    "module_id, name, dlc, kind, size, makerrace, description, shortname, "
    "is_datavault, is_landmark, is_unique, icon, hudicon, factionhqicon, subtype, "
    "produces_ware_id, storage_capacity, storage_type, drone_capacity, "
    "workforce_capacity, workforce_race, icon_path"
)
_DETAIL_COLS = (
    _LIST_COLS + ", "
    "hull, hull_min, hull_integrated, hull_invulnerable, hull_noscrap, "
    "explosiondamage, secrecy_level, "
    "dock_allow, dock_allowbuild, dock_allowtrade, dock_allowunits, "
    "dock_external, dock_playeronly, dock_priority, dock_showroom, dock_size_tags, "
    "equip_classes, supply_classes, "
    "production_research, production_show_active, "
    "builder_units, build_has_storage, "
    "rotation_speed_max, rotation_accel_max, "
    "translation_speed_max, translation_accel_max, "
    "undock_distance, undock_speed, undock_rotate, "
    "autoaim_allow, ownership_claim, longrangescan_minlevel, "
    "turrets_s, turrets_m, turrets_l, turrets_xl, "
    "shields_s, shields_m, shields_l, shields_xl"
)


class ModuleSummary(PublicModel):
    module_id: str
    name: str
    dlc: str | None
    kind: str | None
    size: str | None
    makerrace: str | None = None
    description: str | None = None
    shortname: str | None = None
    is_datavault: bool | None = None
    is_landmark: bool | None = None
    is_unique: bool | None = None
    icon: str | None = None
    hudicon: str | None = None
    factionhqicon: str | None = None
    subtype: str | None = None
    produces_ware_id: str | None
    storage_capacity: int | None
    storage_type: str | None
    drone_capacity: int | None
    workforce_capacity: int | None
    workforce_race: str | None = None
    icon_url: str | None


class ModuleDetail(ModuleSummary):
    hull: int | None
    hull_min: int | None = None
    hull_integrated: bool | None = None
    hull_invulnerable: bool | None = None
    hull_noscrap: bool | None = None
    explosiondamage: int | None
    secrecy_level: int | None = None
    dock_allow: bool | None = None
    dock_allowbuild: bool | None = None
    dock_allowtrade: bool | None = None
    dock_allowunits: bool | None = None
    dock_external: bool | None = None
    dock_playeronly: bool | None = None
    dock_priority: int | None = None
    dock_showroom: bool | None = None
    dock_size_tags: str | None = None
    equip_classes: str | None = None
    supply_classes: str | None = None
    production_research: bool | None = None
    production_show_active: bool | None = None
    builder_units: int | None = None
    build_has_storage: bool | None = None
    rotation_speed_max: float | None = None
    rotation_accel_max: float | None = None
    translation_speed_max: float | None = None
    translation_accel_max: float | None = None
    undock_distance: float | None = None
    undock_speed: float | None = None
    undock_rotate: bool | None = None
    autoaim_allow: bool | None = None
    ownership_claim: bool | None = None
    longrangescan_minlevel: int | None = None
    turrets_s: int
    turrets_m: int
    turrets_l: int
    turrets_xl: int
    shields_s: int
    shields_m: int
    shields_l: int
    shields_xl: int


def _row_to_summary(r: sqlite3.Row) -> ModuleSummary:
    d = dict(r)
    d["icon_url"] = get_icon_url(d.pop("icon_path"))
    return ModuleSummary(**d)


def _row_to_detail(r: sqlite3.Row) -> ModuleDetail:
    d = dict(r)
    d["icon_url"] = get_icon_url(d.pop("icon_path"))
    return ModuleDetail(**d)


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    kind: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ModuleSummary]:
    sql = [f"SELECT {_LIST_COLS} FROM s.modules WHERE 1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if kind is not None:
        sql.append("AND kind = :kind")
        params["kind"] = kind
    sql.append("ORDER BY module_id LIMIT :limit OFFSET :offset")
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [_row_to_summary(r) for r in rows]


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(
    module_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> ModuleDetail:
    row = conn.execute(
        f"SELECT {_DETAIL_COLS} FROM s.modules WHERE module_id = :id",
        {"id": module_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown module_id: {module_id}")
    return _row_to_detail(row)
