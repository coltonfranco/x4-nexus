"""Extract `index/macros.xml` and referenced ship macros into the `ships` table.

Speed max calculation: X4 determines true max speed by multiplying thruster forward
thrust by the ship's drag/mass modifiers. Since resolving arbitrary thruster macros
adds significant complexity for v1, `speed_max` is simplified. We attempt to extract
forward drag and mass from the ship's physics node and return `1 / drag_forward` or
similar as a placeholder, or 0.0 if not easily available.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.parsing import xml_attr_float as _float
from x4_extract.parsing import xml_attr_int as _int
from x4_extract.static.constants import SHIP_CLASSES, dlc_from_path

CountCache = dict[tuple[str, bool], dict[str, int]]


@dataclass(slots=True)
class ExtractResult:
    ships: list[dict[str, Any]] = field(default_factory=list)
    software: list[dict[str, Any]] = field(default_factory=list)


def extract(index_bytes: bytes, resolve_path: Callable[[str], bytes], resolve_name: Callable[[str], bytes]) -> ExtractResult:
    """Parse merged macros.xml, resolve ship macros recursively, and extract row dicts."""
    root = etree.fromstring(index_bytes)
    out = ExtractResult()

    for entry in root.iterfind("entry"):
        name = entry.get("name")
        if not name:
            continue

        path = entry.get("value")
        if not path:
            continue

        # Paths in index use backslashes and omit the .xml extension
        xml_path = path.replace("\\", "/") + ".xml"
        try:
            ship_bytes = resolve_path(xml_path)
            ship_root = etree.fromstring(ship_bytes)
            macro_el = ship_root.find("macro")
            if macro_el is None:
                continue

            class_raw = macro_el.get("class", "")
            if class_raw not in SHIP_CLASSES:
                continue

        except (KeyError, OSError, etree.XMLSyntaxError):
            continue

        _parse_ship_macro(name, xml_path, macro_el, resolve_name, out)

    return out


def _parse_ship_macro(macro_name: str, file_path: str, macro_el: etree._Element, resolve_name: Callable[[str], bytes], out: ExtractResult) -> None:
    class_raw = macro_el.get("class", "")
    class_id = class_raw.replace("ship_", "") if class_raw.startswith("ship_") else class_raw

    ident_el = macro_el.find("properties/identification")
    purpose_el = macro_el.find("properties/purpose")
    hull_el = macro_el.find("properties/hull")
    physics_el = macro_el.find("properties/physics")
    storage_el = macro_el.find("properties/storage")
    people_el = macro_el.find("properties/people")
    secrecy_el = macro_el.find("properties/secrecy")
    ship_el = macro_el.find("properties/ship")
    jerk_el = macro_el.find("properties/jerk")
    modifiers_el = macro_el.find("properties/modifiers")
    explosion_el = macro_el.find("properties/explosiondamage")
    travel_stability_el = macro_el.find("properties/traveldrivestability")
    gatherrate_el = macro_el.find("properties/gatherrate")
    capture_el = macro_el.find("properties/capture")
    radar_el = macro_el.find("properties/radar")
    boost_el = macro_el.find("properties/boost")
    rotationspeed_el = macro_el.find("properties/rotationspeed")
    rotationaccel_el = macro_el.find("properties/rotationacceleration")

    missile_storage = drone_storage = countermeasure_storage = deployable_storage = None
    if storage_el is not None:
        missile_storage = _int(storage_el, "missile")
        drone_storage = _int(storage_el, "unit")
        countermeasure_storage = _int(storage_el, "countermeasure")
        deployable_storage = _int(storage_el, "deployable")
        
    if countermeasure_storage is None:
        if class_id == 's':
            countermeasure_storage = 4
        elif class_id == 'm':
            countermeasure_storage = 8
        elif class_id == 'l':
            countermeasure_storage = 20
        elif class_id == 'xl':
            countermeasure_storage = 40
        
    if deployable_storage is None:
        if class_id == 's':
            deployable_storage = 50
        elif class_id == 'm':
            deployable_storage = 100
        elif class_id == 'l':
            deployable_storage = 250
        elif class_id == 'xl':
            deployable_storage = 450

    mass = None
    drag_fwd = drag_rev = drag_horiz = drag_vert = drag_pitch = drag_yaw = drag_roll = None
    inertia_pitch = inertia_yaw = inertia_roll = None
    accel_factor_reverse = accel_factor_horizontal = accel_factor_vertical = None

    if physics_el is not None:
        mass = _float(physics_el, "mass")
        drag_el = physics_el.find("drag")
        inertia_el = physics_el.find("inertia")

        if drag_el is not None:
            drag_fwd = _float(drag_el, "forward")
            drag_rev = _float(drag_el, "reverse")
            drag_horiz = _float(drag_el, "horizontal")
            drag_vert = _float(drag_el, "vertical")
            drag_pitch = _float(drag_el, "pitch")
            drag_yaw = _float(drag_el, "yaw")
            drag_roll = _float(drag_el, "roll")

        if inertia_el is not None:
            inertia_pitch = _float(inertia_el, "pitch")
            inertia_yaw = _float(inertia_el, "yaw")
            inertia_roll = _float(inertia_el, "roll")

        accfactors_el = physics_el.find("accfactors")
        if accfactors_el is not None:
            accel_factor_reverse = _float(accfactors_el, "reverse")
            accel_factor_horizontal = _float(accfactors_el, "horizontal")
            accel_factor_vertical = _float(accfactors_el, "vertical")

    accel_forward = _float(jerk_el.find("forward"), "accel") if jerk_el is not None and jerk_el.find("forward") is not None else None
    decel_forward = _float(jerk_el.find("forward"), "decel") if jerk_el is not None and jerk_el.find("forward") is not None else None
    accel_boost = _float(jerk_el.find("forward_boost"), "accel") if jerk_el is not None and jerk_el.find("forward_boost") is not None else None
    accel_travel = _float(jerk_el.find("forward_travel"), "accel") if jerk_el is not None and jerk_el.find("forward_travel") is not None else None
    accel_strafe = _float(jerk_el.find("strafe"), "value") if jerk_el is not None and jerk_el.find("strafe") is not None else None
    accel_angular = _float(jerk_el.find("angular"), "value") if jerk_el is not None and jerk_el.find("angular") is not None else None

    modifier_weapon_heat = _float(modifiers_el.find("weapon"), "heat") if modifiers_el is not None and modifiers_el.find("weapon") is not None else None
    explosion_damage = _float(explosion_el, "value")
    explosion_shield_damage = _float(explosion_el, "shield")
    travel_stability = _float(travel_stability_el, "maxvalue")

    gatherrate_gas = _float(gatherrate_el, "gas")
    gatherrate_ore = _float(gatherrate_el, "ore")
    gatherrate_silicon = _float(gatherrate_el, "silicon")
    explosion_shield_disruption = _float(explosion_el, "shielddisruption")
    can_be_captured = _int(capture_el, "allow") if capture_el is not None else None
    radar_range_direct = _float(radar_el, "range")
    boost_recharge_delay = _float(boost_el, "rechargedelay")
    rotation_speed_max = _float(rotationspeed_el, "max")
    rotation_accel_max = _float(rotationaccel_el, "max")

    # Hardpoints counters
    counts = {
        "cargo_volume": 0,
        "weapons_s": 0, "weapons_m": 0, "weapons_l": 0, "weapons_xl": 0,
        "turrets_s": 0, "turrets_m": 0, "turrets_l": 0, "turrets_xl": 0,
        "shields_s": 0, "shields_m": 0, "shields_l": 0, "shields_xl": 0,
        "engines_s": 0, "engines_m": 0, "engines_l": 0, "engines_xl": 0,
        "dock_s": 0, "dock_m": 0, "dock_l": 0, "dock_xl": 0,
        "storage_s": 0, "storage_m": 0, "storage_l": 0, "storage_xl": 0,
        "launch_tubes": 0,
    }

    # Recursively resolve components to count hardpoints.  Caches avoid
    # re-parsing and re-counting the same component macros (shared across
    # many ships — the biggest perf win in the entire extraction pipeline).
    tree_cache: dict[str, etree._Element | None] = {}
    count_cache: CountCache = {}
    _resolve_and_count_hardpoints(macro_el, resolve_name, counts, tree_cache, count_cache)

    out.ships.append(
        {
            "ship_id": macro_name,
            "name": (ident_el.get("name") if ident_el is not None else None) or macro_name,
            "description": ident_el.get("description") if ident_el is not None else None,
            "basename": ident_el.get("basename") if ident_el is not None else None,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "variation": ident_el.get("variation") if ident_el is not None else None,
            "class_id": class_id,
            "ship_type": ship_el.get("type") if ship_el is not None else None,
            "role": purpose_el.get("primary") if purpose_el is not None else None,
            "faction_id": ident_el.get("makerrace") if ident_el is not None else None,
            "hull": _int(hull_el, "max") if hull_el is not None else None,
            "cargo_volume": counts.get("cargo_volume", 0),
            "dps_max": None,
            "speed_min": None,
            "speed_max": None,
            "travel_min": None,
            "travel_max": None,
            "boost_min": None,
            "boost_max": None,
            "pitch_min": None,
            "pitch_max": None,
            "yaw_min": None,
            "yaw_max": None,
            "roll_min": None,
            "roll_max": None,
            "shield_capacity_min": None,
            "shield_capacity_max": None,
            "shield_recharge_min": None,
            "shield_recharge_max": None,
            "shield_delay_min": None,
            "shield_delay_max": None,
            "radar_range": None,
            "icon_path": ident_el.get("icon") if ident_el is not None else None,
            "mass": mass,
            "drag_forward": drag_fwd,
            "drag_reverse": drag_rev,
            "drag_horizontal": drag_horiz,
            "drag_vertical": drag_vert,
            "drag_pitch": drag_pitch,
            "drag_yaw": drag_yaw,
            "drag_roll": drag_roll,
            "inertia_pitch": inertia_pitch,
            "inertia_yaw": inertia_yaw,
            "inertia_roll": inertia_roll,
            "people_capacity": _int(people_el, "capacity") if people_el is not None else None,
            "missile_storage": missile_storage,
            "drone_storage": drone_storage,
            "countermeasure_storage": countermeasure_storage,
            "deployable_storage": deployable_storage,
            "secrecy_level": _int(secrecy_el, "level") if secrecy_el is not None else None,
            "accel_forward": accel_forward,
            "decel_forward": decel_forward,
            "accel_boost": accel_boost,
            "accel_travel": accel_travel,
            "accel_strafe": accel_strafe,
            "accel_angular": accel_angular,
            "accel_factor_reverse": accel_factor_reverse,
            "accel_factor_horizontal": accel_factor_horizontal,
            "accel_factor_vertical": accel_factor_vertical,
            "modifier_weapon_heat": modifier_weapon_heat,
            "explosion_damage": explosion_damage,
            "explosion_shield_damage": explosion_shield_damage,
            "explosion_shield_disruption": explosion_shield_disruption,
            "travel_stability": travel_stability,
            "gatherrate_gas": gatherrate_gas,
            "gatherrate_ore": gatherrate_ore,
            "gatherrate_silicon": gatherrate_silicon,
            "can_be_captured": can_be_captured,
            "radar_range_direct": radar_range_direct,
            "boost_recharge_delay": boost_recharge_delay,
            "rotation_speed_max": rotation_speed_max,
            "rotation_accel_max": rotation_accel_max,
            **counts
        }
    )

    for sw_el in macro_el.iterfind("properties/software/software"):
        ware_id = sw_el.get("ware")
        if not ware_id:
            continue
        compatible = sw_el.get("compatible")
        default = sw_el.get("default")
        out.software.append({
            "ship_id": macro_name,
            "ware_id": ware_id,
            "compatible": 1 if compatible == "1" else 0,
            "is_default": 1 if default == "1" else 0,
        })


def _resolve_and_count_hardpoints(
    el: etree._Element,
    resolve_name: Callable[[str], bytes],
    counts: dict[str, int],
    tree_cache: dict[str, etree._Element | None],
    count_cache: CountCache,
) -> None:
    """Resolve component macros recursively and count hardpoints.

    *tree_cache* prevents re-parsing the same XML hundreds of times.
    *count_cache* prevents re-counting connections on identical components.
    """
    # Accumulate cargo volume from properties/cargo and properties/storage
    cargo_el = el.find("properties/cargo")
    if cargo_el is not None:
        c = _int(cargo_el, "max")
        if c:
            counts["cargo_volume"] += c
    storage_el = el.find("properties/storage")
    if storage_el is not None:
        c = _int(storage_el, "cargo")
        if c:
            counts["cargo_volume"] += c

    # Resolve the direct component — hardpoints only, NOT docks.
    # The component is the 3D model + hardpoint connections.  Docks are
    # always defined in child macros (dockarea / shipstorage), not here.
    comp_el = el.find("component")
    if comp_el is not None:
        comp_ref = comp_el.get("ref")
        if comp_ref:
            _add_component_counts(comp_ref, resolve_name, counts, tree_cache, count_cache, count_docks=False)

    # Resolve child macros — docks, hardpoints, and cargo.
    # Docks (dockarea, shipstorage) are defined in child macros, NOT the
    # main component, so they MUST be counted here.
    for child_macro in _xpath_elements(el, ".//macro[@ref]"):
        macro_ref = child_macro.get("ref")
        if macro_ref:
            _add_component_counts(macro_ref, resolve_name, counts, tree_cache, count_cache, count_docks=True)


def _add_component_counts(
    ref: str,
    resolve_name: Callable[[str], bytes],
    counts: dict[str, int],
    tree_cache: dict[str, etree._Element | None],
    count_cache: CountCache,
    count_docks: bool = True,
) -> None:
    """Resolve *ref* (once) and merge its counts into *counts*.

    Cargo is always counted — storage macros are distinct and additive.
    When *count_docks* is True, dock bays and hardpoint connections are
    also counted.  When False, only hardpoint connections are counted.
    """
    cache_key = (ref, count_docks)
    if cache_key in count_cache:
        for k, v in count_cache[cache_key].items():
            counts[k] += v
        return

    # Resolve and parse the XML (cached).
    if ref not in tree_cache:
        try:
            raw = resolve_name(ref)
            tree_cache[ref] = etree.fromstring(raw)
        except (KeyError, etree.XMLSyntaxError):
            tree_cache[ref] = None
    root = tree_cache[ref]
    if root is None:
        return

    # Find the matching element and count its connections.
    node = root.find(f".//*[@name='{ref}']")
    if node is None:
        return

    local: dict[str, int] = {
        "cargo_volume": 0,
        "weapons_s": 0, "weapons_m": 0, "weapons_l": 0, "weapons_xl": 0,
        "turrets_s": 0, "turrets_m": 0, "turrets_l": 0, "turrets_xl": 0,
        "shields_s": 0, "shields_m": 0, "shields_l": 0, "shields_xl": 0,
        "engines_s": 0, "engines_m": 0, "engines_l": 0, "engines_xl": 0,
        "dock_s": 0, "dock_m": 0, "dock_l": 0, "dock_xl": 0,
        "storage_s": 0, "storage_m": 0, "storage_l": 0, "storage_xl": 0,
        "launch_tubes": 0,
    }
    
    # Cargo always accumulates — storage macros are distinct from dock macros
    # and their cargo is additive, never duplicate.
    # Docks are gated by count_docks to allow callers to skip dock counting
    # when it would double-count (e.g. if a macro is reached via multiple paths).
    cargo_el = node.find("properties/cargo")
    if cargo_el is not None:
        c = _int(cargo_el, "max")
        if c:
            local["cargo_volume"] += c
    storage_el = node.find("properties/storage")
    if storage_el is not None:
        c = _int(storage_el, "cargo")
        if c:
            local["cargo_volume"] += c

    if count_docks:
        dock_el = node.find("properties/dock")
        if dock_el is not None:
            cap = _int(dock_el, "capacity") or 1  # external pads omit capacity → implicit 1
            docksize_el = node.find("properties/docksize")
            if cap and docksize_el is not None:
                tags = docksize_el.get("tags", "")
                if "dock_xl" in tags or "extralarge" in tags:
                    size = "xl"
                elif "dock_l" in tags or "large" in tags:
                    size = "l"
                elif "dock_m" in tags or "medium" in tags:
                    size = "m"
                elif "dock_xs" in tags or "extrasmall" in tags:
                    size = None  # XS = drones/spacesuits, not ship docks
                else:
                    size = "s"

                if size is not None:
                    if dock_el.get("storage") == "1":
                        local[f"storage_{size}"] += cap
                    else:
                        local[f"dock_{size}"] += cap

    _count_connections(node, local)

    # Recurse into child macro refs on this component.
    for child_macro in _xpath_elements(node, ".//macro[@ref]"):
        child_ref = child_macro.get("ref")
        if child_ref:
            _add_component_counts(child_ref, resolve_name, local, tree_cache, count_cache, count_docks)

    # Cache and merge.
    count_cache[cache_key] = local
    for k, v in local.items():
        counts[k] += v


def _count_connections(comp_node: etree._Element, counts: dict[str, int]) -> None:
    for conn in _xpath_elements(comp_node, ".//connection[@tags]"):
        tags_str = conn.get("tags", "")
        if not tags_str:
            continue

        tags = tags_str.split()

        if "launchtube" in tags:
            counts["launch_tubes"] += 1
            continue

        # Determine kind
        kind = None
        if "engine" in tags:
            kind = "engines"
        elif "turret" in tags:
            kind = "turrets"
        elif "weapon" in tags:
            kind = "weapons"
        elif "shield" in tags:
            kind = "shields"

        if not kind:
            continue

        # Determine size
        size = "s"
        if "extralarge" in tags:
            size = "xl"
        elif "large" in tags:
            size = "l"
        elif "medium" in tags:
            size = "m"

        counts[f"{kind}_{size}"] += 1


def _xpath_elements(node: etree._Element, query: str) -> list[etree._Element]:
    result = node.xpath(query)
    if not isinstance(result, list):
        return []
    return [item for item in result if isinstance(item, etree._Element)]


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    """Replace ship rows in static.db."""
    conn.execute("DELETE FROM ship_software")
    conn.execute("DELETE FROM ships")

    columns = [
        "ship_id", "name", "description", "basename", "file_path", "is_legacy", "dlc",
        "class_id", "ship_type", "role", "faction_id", "variation",
        "hull", "cargo_volume", "dps_max", "speed_min", "speed_max", "travel_min", "travel_max",
        "boost_min", "boost_max", "pitch_min", "pitch_max", "yaw_min", "yaw_max",
        "roll_min", "roll_max", "shield_capacity_min", "shield_capacity_max",
        "shield_recharge_min", "shield_recharge_max", "shield_delay_min",
        "shield_delay_max", "radar_range", "icon_path",
        "mass", "drag_forward", "drag_reverse", "drag_horizontal", "drag_vertical",
        "drag_pitch", "drag_yaw", "drag_roll",
        "inertia_pitch", "inertia_yaw", "inertia_roll",
        "people_capacity", "missile_storage", "drone_storage",
        "countermeasure_storage", "deployable_storage",
        "secrecy_level",
        "dock_s", "dock_m", "dock_l", "dock_xl",
        "storage_s", "storage_m", "storage_l", "storage_xl",
        "launch_tubes",
        "accel_forward", "decel_forward", "accel_boost", "accel_travel",
        "accel_strafe", "accel_angular", "accel_factor_reverse",
        "accel_factor_horizontal", "accel_factor_vertical",
        "modifier_weapon_heat", "explosion_damage", "explosion_shield_damage",
        "explosion_shield_disruption", "travel_stability",
        "gatherrate_gas", "gatherrate_ore", "gatherrate_silicon",
        "can_be_captured", "radar_range_direct", "boost_recharge_delay",
        "rotation_speed_max", "rotation_accel_max",
        "weapons_s", "weapons_m", "weapons_l", "weapons_xl",
        "turrets_s", "turrets_m", "turrets_l", "turrets_xl",
        "shields_s", "shields_m", "shields_l", "shields_xl",
        "engines_s", "engines_m", "engines_l", "engines_xl"
    ]

    cols_str = ", ".join(columns)
    vals_str = ", ".join(f":{c}" for c in columns)

    conn.executemany(
        f"INSERT INTO ships ({cols_str}) VALUES ({vals_str})",
        result.ships,
    )
    if result.software:
        conn.executemany(
            "INSERT INTO ship_software (ship_id, ware_id, compatible, is_default) "
            "VALUES (:ship_id, :ware_id, :compatible, :is_default)",
            result.software,
        )


def update_derived_stats(conn: sqlite3.Connection) -> None:
    """Calculate min/max stats based on extracted ship equipment capacity.

    Pre-computes per-size aggregates once and materializes them into a
    single UPDATE — the old approach used ~40 correlated scalar subqueries
    that SQLite re-ran for every row (5,000+ subqueries for 365 ships).
    """
    sizes = ("s", "m", "l", "xl")

    # Fetch per-size engine aggregates (one query per aggregate).
    def _eng_agg(agg: str, expr: str) -> dict[str, float]:
        rows = conn.execute(
            f"SELECT size, {agg}({expr}) FROM equip_engines"
            " WHERE class_id='engine' AND size IN ('s','m','l','xl')"
            " GROUP BY size"
        ).fetchall()
        return {r[0]: (r[1] or 0.0) for r in rows}

    e_thrust_min = _eng_agg("MIN", "thrust_forward")
    e_thrust_max = _eng_agg("MAX", "thrust_forward")
    e_travel_min = _eng_agg("MIN", "thrust_forward * travel_thrust")
    e_travel_max = _eng_agg("MAX", "thrust_forward * travel_thrust")
    e_boost_min  = _eng_agg("MIN", "thrust_forward * boost_thrust")
    e_boost_max  = _eng_agg("MAX", "thrust_forward * boost_thrust")

    # Fetch per-size thruster aggregates.
    def _thr_agg(agg: str, col: str) -> dict[str, float]:
        rows = conn.execute(
            f"SELECT size, {agg}({col}) FROM equip_engines"
            " WHERE class_id='thruster' AND size IN ('s','m','l','xl')"
            " GROUP BY size"
        ).fetchall()
        return {r[0]: (r[1] or 0.0) for r in rows}

    t_pitch_min = _thr_agg("MIN", "thrust_pitch")
    t_pitch_max = _thr_agg("MAX", "thrust_pitch")
    t_yaw_min   = _thr_agg("MIN", "thrust_yaw")
    t_yaw_max   = _thr_agg("MAX", "thrust_yaw")
    t_roll_min  = _thr_agg("MIN", "thrust_roll")
    t_roll_max  = _thr_agg("MAX", "thrust_roll")

    # Fetch per-size shield aggregates.
    def _shd_agg(agg: str, col: str) -> dict[str, float]:
        rows = conn.execute(
            f"SELECT size, {agg}({col}) FROM equip_shields"
            " WHERE size IN ('s','m','l','xl') GROUP BY size"
        ).fetchall()
        return {r[0]: (r[1] or 0.0) for r in rows}

    s_cap_min  = _shd_agg("MIN", "capacity")
    s_cap_max  = _shd_agg("MAX", "capacity")
    s_rec_min  = _shd_agg("MIN", "recharge_rate")
    s_rec_max  = _shd_agg("MAX", "recharge_rate")
    s_del_min  = _shd_agg("MIN", "recharge_delay")
    s_del_max  = _shd_agg("MAX", "recharge_delay")

    # Build the scalar expressions using pre-computed dicts.
    def _sum4(d: dict[str, float]) -> str:
        return " + ".join(
            f"COALESCE(engines_{s} * {d.get(s, 0.0)}, 0)" for s in sizes
        )

    def _sum4_shd(d: dict[str, float]) -> str:
        return " + ".join(
            f"COALESCE(shields_{s} * {d.get(s, 0.0)}, 0)" for s in sizes
        )

    def _wep_agg(agg: str) -> dict[str, float]:
        rows = conn.execute(
            f"SELECT w.size, {agg}(b.damage * COALESCE(b.amount, 1) * COALESCE(b.barrelamount, 1) / COALESCE(b.reload_rate, 1.0))"
            " FROM equip_weapons w JOIN equip_bullets b ON w.default_bullet_id = b.bullet_id"
            " WHERE w.class_id IN ('weapon', 'missilelauncher') AND w.size IN ('s','m','l','xl')"
            " GROUP BY w.size"
        ).fetchall()
        return {r[0]: (r[1] or 0.0) for r in rows}

    w_dps_max = _wep_agg("MAX")

    def _tur_agg(agg: str) -> dict[str, float]:
        rows = conn.execute(
            f"SELECT w.size, {agg}(b.damage * COALESCE(b.amount, 1) * COALESCE(b.barrelamount, 1) / COALESCE(b.reload_rate, 1.0))"
            " FROM equip_weapons w JOIN equip_bullets b ON w.default_bullet_id = b.bullet_id"
            " WHERE w.class_id = 'turret' AND w.size IN ('s','m','l','xl')"
            " GROUP BY w.size"
        ).fetchall()
        return {r[0]: (r[1] or 0.0) for r in rows}

    t_dps_max = _tur_agg("MAX")

    def _sum4_wep(d: dict[str, float]) -> str:
        return " + ".join(
            f"COALESCE(weapons_{s} * {d.get(s, 0.0)}, 0)" for s in sizes
        )

    def _sum4_tur(d: dict[str, float]) -> str:
        return " + ".join(
            f"COALESCE(turrets_{s} * {d.get(s, 0.0)}, 0)" for s in sizes
        )

    # Thruster stats are per-ship-class (same size as the ship itself).
    def _thr_expr(d: dict[str, float]) -> str:
        parts = []
        for s in sizes:
            if d.get(s, 0.0):
                parts.append(f"WHEN class_id = '{s}' THEN {d[s]}")
        if not parts:
            return "NULL"
        return f"CASE {' '.join(parts)} ELSE NULL END"

    # Shield delay uses ALL sizes together (any slot can be populated).
    s_del_min_val = min(s_del_min.values()) if s_del_min else 0.0
    s_del_max_val = max(s_del_max.values()) if s_del_max else 0.0
    has_shields = " OR ".join(f"shields_{s} > 0" for s in sizes)

    # Radar: materialize the per-ship max radar range.
    conn.execute("DROP TABLE IF EXISTS _ship_radar")
    conn.execute(
        "CREATE TEMP TABLE _ship_radar AS"
        " SELECT s.ship_id, COALESCE(MAX(e.radar_range), 40000) AS radar"
        " FROM ships s"
        " LEFT JOIN ship_software sw ON s.ship_id = sw.ship_id AND sw.is_default = 1"
        " LEFT JOIN equip_software e ON sw.ware_id = e.software_id"
        " GROUP BY s.ship_id"
    )

    # ── Per-size best weapon range (bullet_speed x lifetime / 1000) ─────
    def _range_agg() -> dict[str, float]:
        rows = conn.execute(
            "SELECT w.size, MAX(b.speed * b.lifetime / 1000.0)"
            " FROM equip_weapons w"
            " JOIN equip_bullets b ON w.default_bullet_id = b.bullet_id"
            " WHERE w.class_id IN ('weapon', 'turret') AND w.size IN ('s','m','l','xl')"
            " GROUP BY w.size"
        ).fetchall()
        return {r[0]: (r[1] or 0.0) for r in rows}

    r_best = _range_agg()
    _range_parts = []
    # Sort by range descending so the first matching size is the best one
    for s, r in sorted(r_best.items(), key=lambda kv: -kv[1]):
        _range_parts.append(f"WHEN (weapons_{s} > 0 OR turrets_{s} > 0) THEN {r}")
    range_expr = f"CASE {' '.join(_range_parts)} ELSE 0 END" if _range_parts else "0"

    # One UPDATE with all values computed inline from the pre-fetched dicts.
    conn.execute(f"""
        UPDATE ships SET
          dps_max    = ({_sum4_wep(w_dps_max)}) + ({_sum4_tur(t_dps_max)}),
          speed_min  = ({_sum4(e_thrust_min)}) / drag_forward,
          speed_max  = ({_sum4(e_thrust_max)}) / drag_forward,
          travel_min = ({_sum4(e_travel_min)}) / drag_forward,
          travel_max = ({_sum4(e_travel_max)}) / drag_forward,
          boost_min  = ({_sum4(e_boost_min)})  / drag_forward,
          boost_max  = ({_sum4(e_boost_max)})  / drag_forward,
          accel_max  = ({_sum4(e_thrust_max)}) / mass,

          pitch_min = {_thr_expr(t_pitch_min)} / inertia_pitch,
          pitch_max = {_thr_expr(t_pitch_max)} / inertia_pitch,
          yaw_min   = {_thr_expr(t_yaw_min)}   / inertia_yaw,
          yaw_max   = {_thr_expr(t_yaw_max)}   / inertia_yaw,
          roll_min  = {_thr_expr(t_roll_min)}  / inertia_roll,
          roll_max  = {_thr_expr(t_roll_max)}  / inertia_roll,

          shield_capacity_min  = ({_sum4_shd(s_cap_min)}),
          shield_capacity_max  = ({_sum4_shd(s_cap_max)}),
          shield_recharge_min  = ({_sum4_shd(s_rec_min)}),
          shield_recharge_max  = ({_sum4_shd(s_rec_max)}),
          shield_delay_min = CASE WHEN {has_shields} THEN {s_del_min_val} END,
          shield_delay_max = CASE WHEN {has_shields} THEN {s_del_max_val} END,

          radar_range = (SELECT radar FROM _ship_radar r WHERE r.ship_id = ships.ship_id),
          range_max   = MIN(30, {range_expr})
        WHERE mass > 0 AND drag_forward > 0
    """)
    conn.execute("DROP TABLE IF EXISTS _ship_radar")
