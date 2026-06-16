"""Buyable ship-part catalog with inlined stat breakdowns.

The `wares` table holds engines, shields, weapons, turrets, thrusters, missiles,
drones, software and deployables as tradable items with prices — but their
performance stats live in the separate `equip_*` tables, keyed by the ware id with a
`_macro` suffix. The dashboard's Equipment page is a comparison tool (pick a category
+ size, rank by the stat that matters), so the list response **inlines** each part's
stat block: the stat tables are small enough to load whole in a handful of queries,
and inlining means the UI never round-trips per row.

Stat coverage is partial for a few kinds (thrusters/missiles/drones have no stat
table); those parts still carry price and parsed metadata (kind/size/mk/faction).
"""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.icons import ICON_BASE, get_icon_url
from x4_api.api.schemas import PublicModel
from x4_api.domain.ware_class import CATEGORY_SQL, equipment_kind, equipment_meta

# Fallback icons for equipment kinds that don't have in-game icon images.
# Sourced from the game's own ship builder sidebar tab icons.
_KIND_FALLBACK_ICON: dict[str, str] = {
    "software":       f"{ICON_BASE}/ship_build_sidebar_tabs/shipbuildst_software.png",
    "missile":        f"{ICON_BASE}/ship_build_sidebar_tabs/shipbuildst_consumable.png",
    "countermeasure": f"{ICON_BASE}/ship_build_sidebar_tabs/shipbuildst_consumable.png",
    "deployable":     f"{ICON_BASE}/ship_build_sidebar_tabs/shipbuildst_consumable.png",
    "drone":          f"{ICON_BASE}/ship_build_sidebar_tabs/shipbuildst_consumable.png",
}

router = APIRouter()


class EngineStats(PublicModel):
    mk: int | None
    thrust_forward: float | None
    thrust_reverse: float | None
    thrust_strafe: float | None
    travel_thrust: float | None
    travel_charge: float | None
    boost_thrust: float | None
    boost_duration: float | None


class ShieldStats(PublicModel):
    mk: int | None
    capacity: float | None
    recharge_rate: float | None
    recharge_delay: float | None


class WeaponStats(PublicModel):
    class_id: str | None
    size: str | None
    mk: int | None
    rotation_speed: float | None
    heat_overheat: float | None
    heat_coolrate: float | None
    # Resolved from the weapon's default bullet.
    damage: float | None
    shield_damage: float | None
    hull_damage: float | None
    shield_disruption: float | None
    reload_rate: float | None
    reload_time: float | None
    bullet_speed: float | None
    bullet_lifetime: float | None
    bullet_amount: int | None
    bullet_barrel: int | None
    bullet_angle: float | None
    bullet_maxhits: int | None
    bullet_range: float | None
    heat_value: float | None
    explosion_hull: float | None
    explosion_shield: float | None
    ammo_value: int | None
    ammo_reload: float | None
    missile_lifetime: float | None
    missile_range: float | None
    area_damage: float | None
    area_lifetime: float | None


class EquipmentItem(PublicModel):
    ware_id: str
    name: str
    kind: str
    size: str | None
    mk: int | None
    compat_tags: str | None           # space-separated restrictive tags (NULL = fits all ships of this size)
    compat_ship_name: str | None      # resolved ship name from compat_tags (NULL if not exclusive)
    faction_id: str | None
    price_min: int | None
    price_avg: int | None
    price_max: int | None
    icon_url: str | None
    restriction_licence: str | None
    has_production: bool
    engine_stats: EngineStats | None
    shield_stats: ShieldStats | None
    weapon_stats: WeaponStats | None


_BASE_COLS = (
    "ware_id, name, group_id, transport, price_min, price_avg, price_max, tags, icon_path, restriction_licence, "
    "EXISTS(SELECT 1 FROM s.ware_production p WHERE p.ware_id = wares.ware_id) AS has_production"
)


def _resolve_compat_ship(conn: sqlite3.Connection, compat_tags: str) -> str | None:
    """Resolve a compat_tags string to a human-readable ship name.

    Tags like ``ship_gen_m_yacht_01`` or ``pir_battleship_01`` are fragmentary
    ship-macro identifiers.  We split each tag on ``_`` and match every segment
    as a LIKE wildcard, e.g. ``pir_battleship_01`` → ``%pir%battleship%01%``
    which matches ``ship_pir_xl_battleship_01_a_macro``.
    """
    for tag in compat_tags.split():
        segments = [s for s in tag.split("_") if s]
        if not segments:
            continue
        pattern = "%" + "%".join(segments) + "%"
        row = conn.execute(
            "SELECT name FROM s.ships WHERE ship_id LIKE ? LIMIT 1",
            (pattern,),
        ).fetchone()
        if row:
            return row["name"]
    return None


def _load_stat_tables(
    conn: sqlite3.Connection,
) -> tuple[dict[str, sqlite3.Row], dict[str, sqlite3.Row], dict[str, sqlite3.Row], dict[str, sqlite3.Row]]:
    """Pull the whole equip_* stat tables into id-keyed dicts (a few hundred rows each)."""
    engines = {r["engine_id"]: r for r in conn.execute("SELECT * FROM s.equip_engines")}
    shields = {r["shield_id"]: r for r in conn.execute("SELECT * FROM s.equip_shields")}
    weapons = {r["weapon_id"]: r for r in conn.execute("SELECT * FROM s.equip_weapons")}
    bullets = {r["bullet_id"]: r for r in conn.execute("SELECT * FROM s.equip_bullets")}
    return engines, shields, weapons, bullets


def _weapon_stats(row: sqlite3.Row, bullets: dict[str, sqlite3.Row]) -> WeaponStats:
    bullet = bullets.get(row["default_bullet_id"]) if row["default_bullet_id"] else None
    return WeaponStats(
        class_id=row["class_id"],
        size=row["size"],
        mk=row["mk"],
        rotation_speed=row["rotation_speed"],
        heat_overheat=row["heat_overheat"],
        heat_coolrate=row["heat_coolrate"],
        damage=bullet["damage"] if bullet else None,
        shield_damage=bullet["shield_damage"] if bullet else None,
        hull_damage=bullet["hull_damage"] if bullet else None,
        shield_disruption=bullet["shield_disruption"] if bullet else None,
        reload_rate=bullet["reload_rate"] if bullet else None,
        reload_time=bullet["reload_time"] if bullet else None,
        bullet_speed=bullet["speed"] if bullet else None,
        bullet_lifetime=bullet["lifetime"] if bullet else None,
        bullet_amount=bullet["amount"] if bullet else None,
        bullet_barrel=bullet["barrelamount"] if bullet else None,
        bullet_angle=bullet["angle"] if bullet else None,
        bullet_maxhits=bullet["maxhits"] if bullet else None,
        bullet_range=bullet["range_direct"] if bullet else None,
        heat_value=bullet["heat_value"] if bullet else None,
        explosion_hull=bullet["explosion_hull"] if bullet else None,
        explosion_shield=bullet["explosion_shield"] if bullet else None,
        ammo_value=bullet["ammo_value"] if bullet else None,
        ammo_reload=bullet["ammo_reload"] if bullet else None,
        missile_lifetime=bullet["missile_lifetime"] if bullet else None,
        missile_range=bullet["missile_range"] if bullet else None,
        area_damage=bullet["area_damage"] if bullet else None,
        area_lifetime=bullet["area_lifetime"] if bullet else None,
    )


def _build_item(
    conn: sqlite3.Connection,
    row: sqlite3.Row,
    engines: dict[str, sqlite3.Row],
    shields: dict[str, sqlite3.Row],
    weapons: dict[str, sqlite3.Row],
    bullets: dict[str, sqlite3.Row],
) -> EquipmentItem:
    kind = equipment_kind(row["group_id"], row["tags"])
    faction, size, mk = equipment_meta(row["ware_id"])
    macro = f"{row['ware_id']}_macro"

    compat_tags = None
    engine_stats = shield_stats = weapon_stats = None
    if kind in ("engine", "thruster") and (e := engines.get(macro)) is not None:
        compat_tags = e["compat_tags"]
        engine_stats = EngineStats(
            mk=e["mk"],
            thrust_forward=e["thrust_forward"],
            thrust_reverse=e["thrust_reverse"],
            thrust_strafe=e["thrust_strafe"],
            travel_thrust=e["travel_thrust"],
            travel_charge=e["travel_charge"],
            boost_thrust=e["boost_thrust"],
            boost_duration=e["boost_duration"],
        )
    elif kind == "shield" and (s := shields.get(macro)) is not None:
        compat_tags = s["compat_tags"]
        shield_stats = ShieldStats(
            mk=s["mk"],
            capacity=s["capacity"],
            recharge_rate=s["recharge_rate"],
            recharge_delay=s["recharge_delay"],
        )
    elif kind in ("weapon", "turret", "missile") and (w := weapons.get(macro)) is not None:
        compat_tags = w["compat_tags"]
        weapon_stats = _weapon_stats(w, bullets)
    elif kind == "missile" and (b := bullets.get(macro)) is not None:
        # Missile wares often don't have a launcher macro — the ware *is*
        # the bullet.  Directly resolve stats from the bullet table.
        weapon_stats = WeaponStats(
            class_id="missile",
            size=size,
            mk=mk,
            rotation_speed=None,
            heat_overheat=None,
            heat_coolrate=None,
            damage=b["damage"],
            shield_damage=b["shield_damage"],
            hull_damage=b["hull_damage"],
            shield_disruption=b["shield_disruption"],
            reload_rate=b["reload_rate"],
            reload_time=b["reload_time"],
            bullet_speed=b["speed"],
            bullet_lifetime=b["lifetime"],
            bullet_amount=b["amount"],
            bullet_barrel=b["barrelamount"],
            bullet_angle=b["angle"],
            bullet_maxhits=b["maxhits"],
            bullet_range=b["range_direct"],
            heat_value=b["heat_value"],
            explosion_hull=b["explosion_hull"],
            explosion_shield=b["explosion_shield"],
            ammo_value=b["ammo_value"],
            ammo_reload=b["ammo_reload"],
            missile_lifetime=b["missile_lifetime"],
            missile_range=b["missile_range"],
            area_damage=b["area_damage"],
            area_lifetime=b["area_lifetime"],
        )

    return EquipmentItem(
        ware_id=row["ware_id"],
        name=row["name"],
        kind=kind,
        size=size,
        mk=mk,
        compat_tags=compat_tags,
        compat_ship_name=_resolve_compat_ship(conn, compat_tags) if compat_tags else None,
        faction_id=faction,
        price_min=row["price_min"],
        price_avg=row["price_avg"],
        price_max=row["price_max"],
        icon_url=get_icon_url(row["icon_path"]) or get_icon_url(f"upgrade_{row['ware_id']}_macro") or _KIND_FALLBACK_ICON.get(kind),
        restriction_licence=row["restriction_licence"],
        has_production=bool(row["has_production"]),
        engine_stats=engine_stats,
        shield_stats=shield_stats,
        weapon_stats=weapon_stats,
    )


@router.get("/equipment", response_model=list[EquipmentItem])
def list_equipment(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    kind: str | None = Query(None, description="engine, shield, weapon, turret, thruster, missile, …"),
    size: str | None = Query(None, description="xs, s, m, l, xl"),
    faction_id: str | None = Query(None, description="Race/faction code parsed from the ware id, e.g. arg"),
    search: str | None = Query(None, description="Case-insensitive name substring"),
    limit: int = Query(2000, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[EquipmentItem]:
    """Every buyable ship part with its stat block inlined. kind/size/faction are parsed
    from the ware id and filtered in-process."""
    rows = conn.execute(
        f"SELECT {_BASE_COLS} FROM s.wares WHERE ({CATEGORY_SQL}) = 'equipment' ORDER BY ware_id"
    ).fetchall()
    engines, shields, weapons, bullets = _load_stat_tables(conn)

    out: list[EquipmentItem] = []
    needle = search.lower() if search else None
    for r in rows:
        item = _build_item(conn, r, engines, shields, weapons, bullets)
        if kind is not None and item.kind != kind:
            continue
        if size is not None and item.size != size:
            continue
        if faction_id is not None and item.faction_id != faction_id:
            continue
        if needle is not None and needle not in item.name.lower():
            continue
        out.append(item)
    return out[offset : offset + limit]


@router.get("/equipment/{ware_id}", response_model=EquipmentItem)
def get_equipment(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> EquipmentItem:
    """One ship part with its stat block (engine/shield/weapon) when extracted."""
    row = conn.execute(
        f"SELECT {_BASE_COLS}, ({CATEGORY_SQL}) AS category FROM s.wares WHERE ware_id = :id",
        {"id": ware_id},
    ).fetchone()
    if row is None or row["category"] != "equipment":
        raise HTTPException(status_code=404, detail=f"Unknown equipment ware_id: {ware_id}")
    engines, shields, weapons, bullets = _load_stat_tables(conn)
    return _build_item(conn, row, engines, shields, weapons, bullets)
