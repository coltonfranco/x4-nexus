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

from x4_extract.static.constants import SHIP_CLASSES, dlc_from_path


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

    cargo_volume = 0
    if storage_el is not None:
        cargo_volume = _int(storage_el, "cargo") or _int(storage_el, "unit") or 0

    speed_max = 0.0
    mass = None
    drag_fwd = drag_rev = drag_horiz = drag_vert = drag_pitch = drag_yaw = drag_roll = None
    inertia_pitch = inertia_yaw = inertia_roll = None

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

            if mass and mass > 0 and drag_fwd and drag_fwd > 0:
                thrust = 1000.0
                if class_id == "s": thrust = 5000.0
                elif class_id == "m": thrust = 50000.0
                elif class_id == "l": thrust = 1500000.0
                elif class_id == "xl": thrust = 15000000.0
                elif class_id == "xs": thrust = 150.0
                elif class_id == "spacesuit": thrust = 0.15
                
                speed_max = thrust / (mass * drag_fwd)

        if inertia_el is not None:
            inertia_pitch = _float(inertia_el, "pitch")
            inertia_yaw = _float(inertia_el, "yaw")
            inertia_roll = _float(inertia_el, "roll")

    # Hardpoints counters
    counts = {
        "weapons_s": 0, "weapons_m": 0, "weapons_l": 0, "weapons_xl": 0,
        "turrets_s": 0, "turrets_m": 0, "turrets_l": 0, "turrets_xl": 0,
        "shields_s": 0, "shields_m": 0, "shields_l": 0, "shields_xl": 0,
        "engines_s": 0, "engines_m": 0, "engines_l": 0, "engines_xl": 0,
    }

    # Recursively resolve components to count hardpoints
    visited: set[str] = set()
    _resolve_and_count_hardpoints(macro_el, resolve_name, counts, visited)

    out.ships.append(
        {
            "ship_id": macro_name,
            "name": (ident_el.get("name") if ident_el is not None else None) or macro_name,
            "description": ident_el.get("description") if ident_el is not None else None,
            "basename": ident_el.get("basename") if ident_el is not None else None,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "class_id": class_id,
            "ship_type": ship_el.get("type") if ship_el is not None else None,
            "role": purpose_el.get("primary") if purpose_el is not None else None,
            "faction_id": ident_el.get("makerrace") if ident_el is not None else None,
            "hull": _int(hull_el, "max") if hull_el is not None else None,
            "cargo_volume": cargo_volume,
            "speed_max": speed_max,
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
            "missile_storage": _int(storage_el, "missile") if storage_el is not None else None,
            "drone_storage": _int(storage_el, "unit") if storage_el is not None else None,
            "countermeasure_storage": _int(storage_el, "countermeasure") if storage_el is not None else None,
            "deployable_storage": _int(storage_el, "deployable") if storage_el is not None else None,
            "secrecy_level": _int(secrecy_el, "level") if secrecy_el is not None else None,
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


def _resolve_and_count_hardpoints(el: etree._Element, resolve_name: Callable[[str], bytes], counts: dict[str, int], visited: set[str]) -> None:
    # Find component ref for this macro
    comp_el = el.find("component")
    if comp_el is not None:
        comp_ref = comp_el.get("ref")
        if comp_ref and comp_ref not in visited:
            visited.add(comp_ref)
            try:
                comp_bytes = resolve_name(comp_ref)
                comp_root = etree.fromstring(comp_bytes)
                comp_node = comp_root.find(f".//component[@name='{comp_ref}']")
                if comp_node is not None:
                    _count_connections(comp_node, counts)
            except (KeyError, etree.XMLSyntaxError):
                pass

    # Also resolve any child macros mounted on this macro
    for child_macro in el.xpath(".//macro[@ref]"):
        macro_ref = child_macro.get("ref")
        if macro_ref and macro_ref not in visited:
            visited.add(macro_ref)
            try:
                macro_bytes = resolve_name(macro_ref)
                macro_root = etree.fromstring(macro_bytes)
                macro_node = macro_root.find(f".//macro[@name='{macro_ref}']")
                if macro_node is not None:
                    _resolve_and_count_hardpoints(macro_node, resolve_name, counts, visited)
            except (KeyError, etree.XMLSyntaxError):
                pass


def _count_connections(comp_node: etree._Element, counts: dict[str, int]) -> None:
    for conn in comp_node.xpath(".//connection[@tags]"):
        tags_str = conn.get("tags", "")
        if not tags_str:
            continue

        tags = tags_str.split()

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


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    """Replace ship rows in static.db."""
    conn.execute("DELETE FROM ship_software")
    conn.execute("DELETE FROM ships")

    columns = [
        "ship_id", "name", "description", "basename", "file_path", "is_legacy", "dlc",
        "class_id", "ship_type", "role", "faction_id",
        "hull", "cargo_volume", "speed_max", "icon_path",
        "mass", "drag_forward", "drag_reverse", "drag_horizontal", "drag_vertical",
        "drag_pitch", "drag_yaw", "drag_roll",
        "inertia_pitch", "inertia_yaw", "inertia_roll",
        "people_capacity", "missile_storage", "drone_storage",
        "countermeasure_storage", "deployable_storage",
        "secrecy_level",
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
    conn.executemany(
        "INSERT INTO ship_software (ship_id, ware_id, compatible, is_default) "
        "VALUES (:ship_id, :ware_id, :compatible, :is_default)",
        result.software,
    )


def _int(el: etree._Element | None, attr: str) -> int | None:
    if el is None:
        return None
    v = el.get(attr)
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return int(float(v))


def _float(el: etree._Element | None, attr: str) -> float | None:
    if el is None:
        return None
    v = el.get(attr)
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None
