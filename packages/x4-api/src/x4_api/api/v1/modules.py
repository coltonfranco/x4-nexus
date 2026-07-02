"""Station modules endpoint."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.db_utils import fetch_one_or_404
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()

# Module columns prefixed with m. for JOIN compatibility.
_M_LIST_COLS = (
    "m.module_id, m.name, m.dlc, m.kind, m.size, m.makerrace, m.description, m.shortname, "
    "m.is_datavault, m.is_landmark, m.is_unique, m.icon, m.hudicon, m.factionhqicon, m.subtype, "
    "m.produces_ware_id, m.storage_capacity, m.storage_type, m.drone_capacity, "
    "m.workforce_capacity, m.workforce_race, m.workforce_growthrate, "
    "m.build_sets, "
    "m.hull, m.explosiondamage, m.explosion_shield_damage, m.secrecy_level, "
    "m.turrets_s, m.turrets_m, m.turrets_l, m.turrets_xl, "
    "m.shields_s, m.shields_m, m.shields_l, m.shields_xl, "
    "m.dock_s, m.dock_m, m.dock_l, m.dock_xl, "
    "m.hangar_s, m.hangar_m, "
    "m.snap_points, "
    "m.production_method, "
    "m.icon_path"
)
# Ware columns joined via component_ref.
_W_LIST_COLS = (
    "w.price_min AS blueprint_price_min, "
    "w.price_avg AS blueprint_price_avg, "
    "w.price_max AS blueprint_price_max, "
    "w.restriction_licence, "
    "EXISTS(SELECT 1 FROM player_blueprints pb WHERE pb.ware_id = w.ware_id) AS has_blueprint, "
    # Calculated fields
    "(SELECT wp.time_sec FROM s.ware_production wp WHERE wp.ware_id = w.ware_id LIMIT 1) AS build_time_sec, "
    "(SELECT SUM(wi.amount * wr.price_avg) FROM s.ware_inputs wi JOIN s.wares wr ON wi.input_ware_id = wr.ware_id WHERE wi.ware_id = w.ware_id) AS est_cost, "
    "COALESCE("
    "  (SELECT wp.amount * 1.0 / NULLIF(wp.time_sec, 0) FROM s.ware_production wp "
    "   WHERE wp.ware_id = m.produces_ware_id AND wp.method = m.production_method LIMIT 1), "
    "  (SELECT wp.amount * 1.0 / NULLIF(wp.time_sec, 0) FROM s.ware_production wp "
    "   WHERE wp.ware_id = m.produces_ware_id AND wp.method = 'default' LIMIT 1)"
    ") AS production_rate, "
    # Obtainable — has factory or headquarters_player in space-delimited build_sets
    "COALESCE(' ' || m.build_sets || ' ' LIKE '% factory %' OR ' ' || m.build_sets || ' ' LIKE '% headquarters_player %', 0) AS is_obtainable, "
    # Produces ware name
    "(SELECT wr3.name FROM s.wares wr3 WHERE wr3.ware_id = m.produces_ware_id) AS produces_ware_name, "
    # Production consumption (first input for list view)
    "(SELECT wr2.name FROM s.ware_inputs wi2 JOIN s.wares wr2 ON wi2.input_ware_id = wr2.ware_id "
    " JOIN s.ware_production wp2 ON wi2.ware_id = wp2.ware_id AND wi2.method = wp2.method "
    " WHERE wi2.ware_id = m.produces_ware_id AND (wp2.method = m.production_method OR (wp2.method = 'default' AND m.production_method IS NULL)) "
    " ORDER BY wi2.amount DESC LIMIT 1) AS consumes_ware_name, "
    "(SELECT wi2.amount * 3600.0 / NULLIF(wp2.time_sec, 0) FROM s.ware_inputs wi2 "
    " JOIN s.ware_production wp2 ON wi2.ware_id = wp2.ware_id AND wi2.method = wp2.method "
    " WHERE wi2.ware_id = m.produces_ware_id AND (wp2.method = m.production_method OR (wp2.method = 'default' AND m.production_method IS NULL)) "
    " ORDER BY wi2.amount DESC LIMIT 1) AS consumption_rate"
)

_LIST_COLS = f"{_M_LIST_COLS}, {_W_LIST_COLS}"

_DETAIL_COLS = (
    _LIST_COLS + ", "
    "m.hull_min, m.hull_integrated, m.hull_invulnerable, m.hull_noscrap, "
    "m.secrecy_level, "
    "m.dock_allow, m.dock_allowbuild, m.dock_allowtrade, m.dock_allowunits, "
    "m.dock_external, m.dock_playeronly, m.dock_priority, m.dock_showroom, m.dock_size_tags, "
    "m.equip_classes, m.supply_classes, "
    "m.production_research, m.production_show_active, "
    "m.builder_units, m.build_has_storage, "
    "m.rotation_speed_max, m.rotation_accel_max, "
    "m.translation_speed_max, m.translation_accel_max, "
    "m.undock_distance, m.undock_speed, m.undock_rotate, "
    "m.autoaim_allow, m.ownership_claim, m.longrangescan_minlevel"
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
    produces_ware_id: str | None = None
    storage_capacity: int | None = None
    storage_type: str | None = None
    drone_capacity: int | None = None
    workforce_capacity: int | None = None
    workforce_race: str | None = None
    workforce_growthrate: float | None = None
    build_sets: str | None = None
    blueprint_price_min: int | None = None
    blueprint_price_avg: int | None = None
    blueprint_price_max: int | None = None
    restriction_licence: str | None = None
    has_blueprint: bool = False
    hull: int | None = None
    explosiondamage: int | None = None
    explosion_shield_damage: int | None = None
    secrecy_level: int | None = None
    turrets_s: int = 0
    turrets_m: int = 0
    turrets_l: int = 0
    turrets_xl: int = 0
    shields_s: int = 0
    shields_m: int = 0
    shields_l: int = 0
    shields_xl: int = 0
    dock_s: int = 0
    dock_m: int = 0
    dock_l: int = 0
    dock_xl: int = 0
    hangar_s: int = 0
    hangar_m: int = 0
    snap_points: int = 0
    production_method: str | None = None
    build_time_sec: float | None = None
    est_cost: float | None = None
    production_rate: float | None = None
    is_obtainable: bool = False
    produces_ware_name: str | None = None
    consumes_ware_name: str | None = None
    consumption_rate: float | None = None
    icon_url: str | None = None


class ModuleDetail(ModuleSummary):
    hull: int | None = None
    hull_min: int | None = None
    hull_integrated: bool | None = None
    hull_invulnerable: bool | None = None
    hull_noscrap: bool | None = None
    explosiondamage: int | None = None
    explosion_shield_damage: int | None = None
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
    turrets_s: int = 0
    turrets_m: int = 0
    turrets_l: int = 0
    turrets_xl: int = 0
    shields_s: int = 0
    shields_m: int = 0
    shields_l: int = 0
    shields_xl: int = 0
    construction_resources: list[dict] | None = None
    production_inputs: list[dict] | None = None


def _module_icon_url(module_id: str) -> str | None:
    """Resolve the module icon via the manifest using key ``module_{module_id}``.

    Returns ``None`` when the icon is not in the manifest (the generic fallback
    path is unreliable for modules because icons are organised under
    ``stationmodules/`` not a ``module/`` directory).
    """
    from x4_api.api.icons import ICON_BASE, _load_manifest
    key = f"module_{module_id}"
    manifest = _load_manifest()
    if key in manifest and "path" in manifest[key]:
        return f"{ICON_BASE}/{manifest[key]['path']}"
    return None


def _row_to_summary(r: sqlite3.Row) -> ModuleSummary:
    d = dict(r)
    d.pop("icon_path", None)
    d["icon_url"] = _module_icon_url(d["module_id"])
    return ModuleSummary(**d)


def _row_to_detail(r: sqlite3.Row, conn: sqlite3.Connection | None = None) -> ModuleDetail:
    d = dict(r)
    d.pop("icon_path", None)
    d["icon_url"] = _module_icon_url(d["module_id"])
    if conn is not None:
        d["construction_resources"] = _fetch_construction_resources(conn, d["module_id"])
        d["production_inputs"] = _fetch_production_inputs(conn, d["produces_ware_id"], d.get("production_method"))
    else:
        d["construction_resources"] = None
        d["production_inputs"] = None
    return ModuleDetail(**d)


_MODULES_FROM = "FROM s.modules m LEFT JOIN s.wares w ON m.module_id = w.component_ref"


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    kind: str | None = Query(None),
    is_obtainable: bool | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ModuleSummary]:
    sql = [f"SELECT {_LIST_COLS} {_MODULES_FROM} WHERE m.build_sets IS NOT NULL"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if kind is not None:
        sql.append("AND m.kind = :kind")
        params["kind"] = kind
    if is_obtainable:
        sql.append("AND COALESCE(' ' || m.build_sets || ' ' LIKE '% factory %' OR ' ' || m.build_sets || ' ' LIKE '% headquarters_player %', 0)")
    sql.append("ORDER BY m.module_id LIMIT :limit OFFSET :offset")
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [_row_to_summary(r) for r in rows]


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(
    module_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> ModuleDetail:
    row = fetch_one_or_404(
        conn,
        f"SELECT {_DETAIL_COLS} {_MODULES_FROM} WHERE m.module_id = :id",
        {"id": module_id},
        f"Unknown module_id: {module_id}",
    )
    return _row_to_detail(row, conn)


def _fetch_construction_resources(conn: sqlite3.Connection, module_id: str) -> list[dict] | None:
    """Return list of {ware_id, name, amount, price_avg, total} for building this module."""
    rows = conn.execute(
        """
        SELECT wi.input_ware_id, wr.name, wi.amount, wr.price_avg,
               (wi.amount * wr.price_avg) AS total
        FROM s.ware_inputs wi
        JOIN s.wares w ON wi.ware_id = w.ware_id
        JOIN s.wares wr ON wi.input_ware_id = wr.ware_id
        WHERE w.component_ref = :module_id
        ORDER BY total DESC
        """,
        {"module_id": module_id},
    ).fetchall()
    if not rows:
        return None
    return [
        {
            "ware_id": r["input_ware_id"],
            "name": r["name"],
            "amount": r["amount"],
            "price_avg": r["price_avg"],
            "total": r["total"],
        }
        for r in rows
    ]


def _fetch_production_inputs(conn: sqlite3.Connection, ware_id: str | None, method: str | None) -> list[dict] | None:
    """Return all production inputs for a produced ware, with rates per cycle and per hour."""
    if not ware_id:
        return None
    resolved_method = method or "default"
    rows = conn.execute(
        """
        SELECT wi.input_ware_id, wr.name, wi.amount,
               wp.time_sec, wp.amount AS output_amount,
               (wi.amount * 3600.0 / NULLIF(wp.time_sec, 0)) AS rate_per_hour
        FROM s.ware_inputs wi
        JOIN s.wares wr ON wi.input_ware_id = wr.ware_id
        JOIN s.ware_production wp ON wi.ware_id = wp.ware_id AND wi.method = wp.method
        WHERE wi.ware_id = :ware_id AND wi.method = :method
        ORDER BY wi.amount DESC
        """,
        {"ware_id": ware_id, "method": resolved_method},
    ).fetchall()
    if not rows:
        # Fallback to 'default' method
        rows = conn.execute(
            """
            SELECT wi.input_ware_id, wr.name, wi.amount,
                   wp.time_sec, wp.amount AS output_amount,
                   (wi.amount * 3600.0 / NULLIF(wp.time_sec, 0)) AS rate_per_hour
            FROM s.ware_inputs wi
            JOIN s.wares wr ON wi.input_ware_id = wr.ware_id
            JOIN s.ware_production wp ON wi.ware_id = wp.ware_id AND wi.method = wp.method
            WHERE wi.ware_id = :ware_id AND wi.method = 'default'
            ORDER BY wi.amount DESC
            """,
            {"ware_id": ware_id},
        ).fetchall()
    if not rows:
        return None
    return [
        {
            "ware_id": r["input_ware_id"],
            "name": r["name"],
            "amount": r["amount"],
            "output_amount": r["output_amount"],
            "time_sec": r["time_sec"],
            "rate_per_hour": round(r["rate_per_hour"]),
        }
        for r in rows
    ]
