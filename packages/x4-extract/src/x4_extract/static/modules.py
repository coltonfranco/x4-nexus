"""Extract modules into the datalake."""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.parsing import xml_attr_bool as _bool_attr
from x4_extract.parsing import xml_attr_float as _float
from x4_extract.parsing import xml_attr_int as _int
from x4_extract.static.constants import MODULE_CLASSES, dlc_from_path

_RE_SIZE_FROM_NAME = re.compile(r"_([smlx]{1,2})_", re.IGNORECASE)
_NAME_TO_SIZE = {"s": "small", "m": "medium", "l": "large", "xl": "extralarge", "xs": "extralarge"}


@dataclass(slots=True)
class ExtractResult:
    modules: list[dict[str, Any]] = field(default_factory=list)


def extract(
    index_bytes: bytes, resolve_path: Callable[[str], bytes], resolve_name: Callable[[str], bytes]
) -> ExtractResult:
    root = etree.fromstring(index_bytes)
    out = ExtractResult()
    seen: set[str] = set()

    for entry in root.iterfind("entry"):
        name = entry.get("name")
        if not name or name in seen:
            continue

        path = entry.get("value")
        if not path:
            continue

        xml_path = path.replace("\\", "/") + ".xml"
        try:
            macro_bytes = resolve_path(xml_path)
            macro_root = etree.fromstring(macro_bytes)
            macro_el = macro_root.find("macro")
            if macro_el is None:
                continue

            class_raw = macro_el.get("class", "")
            if class_raw not in MODULE_CLASSES:
                continue

        except (KeyError, OSError, etree.XMLSyntaxError):
            continue

        seen.add(name)
        _parse_module(name, xml_path, macro_el, resolve_name, out)

    return out


def _parse_module(
    macro_name: str,
    file_path: str,
    macro_el: etree._Element,
    resolve_name: Callable[[str], bytes],
    out: ExtractResult,
) -> None:
    class_raw = macro_el.get("class", "")
    kind = "defence" if class_raw == "defencemodule" else class_raw
    kind = "dock" if kind in ["dockarea", "pier"] else kind

    ident_el = macro_el.find("properties/identification")
    display_name = (ident_el.get("name") if ident_el is not None else None) or macro_name
    size = ident_el.get("size") if ident_el is not None else None
    if size is None:
        m = _RE_SIZE_FROM_NAME.search(macro_name)
        if m:
            size = _NAME_TO_SIZE.get(m.group(1).lower())

    makerrace = ident_el.get("makerrace") if ident_el is not None else None

    # Deep stats
    hull_el = macro_el.find("properties/hull")
    exp_el = macro_el.find("properties/explosiondamage")
    workforce_el = macro_el.find("properties/workforce")
    cargo_el = macro_el.find("properties/cargo")
    storage_el = macro_el.find("properties/storage")
    prod_el = macro_el.find("properties/production/queue")
    prod_parent = macro_el.find("properties/production")
    build_el = macro_el.find("properties/build")
    build_sets_el = build_el.find("sets") if build_el is not None else None
    dock_el = macro_el.find("properties/dock")
    docksize_el = macro_el.find("properties/docksize")
    equip_el = macro_el.find("properties/equip")
    supply_el = macro_el.find("properties/supply")
    builder_el = macro_el.find("properties/builder")
    undock_el = macro_el.find("properties/undock")
    secrecy_el = macro_el.find("properties/secrecy")
    ownership_el = macro_el.find("properties/ownership")
    rotationspeed_el = macro_el.find("properties/rotationspeed")
    rotationaccel_el = macro_el.find("properties/rotationacceleration")
    translationspeed_el = macro_el.find("properties/translationspeed")
    translationaccel_el = macro_el.find("properties/translationacceleration")
    longrangescan_el = macro_el.find("properties/longrangescan")
    autoaim_el = macro_el.find("properties/autoaim")

    produces_ware_id = prod_el.get("ware") if prod_el is not None else None
    if produces_ware_id is None:
        if macro_name == "proc_gen_scrapworks_macro":
            produces_ware_id = "scrapmetal"
        elif macro_name == "proc_gen_scrapworkskhaak_macro":
            produces_ware_id = "khaakscrapmetal"

    # Cargo (for storage modules)
    storage_capacity = None
    storage_type = None
    if cargo_el is not None:
        storage_capacity = _int(cargo_el, "max")
        storage_type = cargo_el.get("tags")

    # Hardpoints
    hardpoints = {
        "turret_s": 0,
        "turret_m": 0,
        "turret_l": 0,
        "turret_xl": 0,
        "shield_s": 0,
        "shield_m": 0,
        "shield_l": 0,
        "shield_xl": 0,
    }
    # Dock / hangar / snap counts
    dock_counts = {"dock_s": 0, "dock_m": 0, "dock_l": 0, "dock_xl": 0}
    hangar_counts = {"hangar_s": 0, "hangar_m": 0}
    snap_points = 0

    comp_ref_el = macro_el.find("component")
    if comp_ref_el is not None:
        comp_ref = comp_ref_el.get("ref")
        if comp_ref:
            try:
                comp_bytes = resolve_name(comp_ref)
                _resolve_and_count_hardpoints(comp_bytes, resolve_name, hardpoints)
                snap_points = _count_snap_points(comp_bytes)
            except (KeyError, OSError):
                pass

    # Count dock bays and hangars from macro connections
    _count_dock_bays(macro_el, dock_counts, hangar_counts)

    # Production method from queue
    queue_el = macro_el.find("properties/production/queue")
    production_method = queue_el.get("method") if queue_el is not None else None

    out.modules.append(
        {
            "module_id": macro_name,
            "name": display_name,
            "file_path": file_path,
            "is_legacy": "legacy" in file_path.lower(),
            "dlc": dlc_from_path(file_path),
            "kind": kind,
            "size": size,
            "makerrace": makerrace,
            "description": ident_el.get("description") if ident_el is not None else None,
            "shortname": ident_el.get("shortname") if ident_el is not None else None,
            "is_datavault": _bool_attr(ident_el, "datavault") if ident_el is not None else None,
            "is_landmark": _bool_attr(ident_el, "landmark") if ident_el is not None else None,
            "is_unique": _bool_attr(ident_el, "unique") if ident_el is not None else None,
            "icon": ident_el.get("icon") if ident_el is not None else None,
            "hudicon": ident_el.get("hudicon") if ident_el is not None else None,
            "factionhqicon": ident_el.get("factionhqicon") if ident_el is not None else None,
            "subtype": ident_el.get("type") if ident_el is not None else None,
            "produces_ware_id": produces_ware_id,
            "storage_capacity": storage_capacity,
            "storage_type": storage_type,
            "drone_capacity": _int(storage_el, "unit"),
            "workforce_capacity": _int(workforce_el, "capacity")
            if _int(workforce_el, "capacity") is not None
            else _int(workforce_el, "max"),
            "workforce_race": workforce_el.get("race") if workforce_el is not None else None,
            "workforce_growthrate": _float(workforce_el, "growthrate"),
            "hull": _int(hull_el, "max"),
            "hull_min": _int(hull_el, "min"),
            "hull_integrated": _bool_attr(hull_el, "integrated"),
            "hull_invulnerable": _bool_attr(hull_el, "invulnerable"),
            "hull_noscrap": _bool_attr(hull_el, "noscrap"),
            "explosiondamage": _int(exp_el, "value"),
            "explosion_shield_damage": _int(exp_el, "shield"),
            "secrecy_level": _int(secrecy_el, "level") if secrecy_el is not None else None,
            # Docks
            "dock_allow": _bool_attr(dock_el, "allow") if dock_el is not None else None,
            "dock_allowbuild": _bool_attr(dock_el, "allowbuild") if dock_el is not None else None,
            "dock_allowtrade": _bool_attr(dock_el, "allowtrade") if dock_el is not None else None,
            "dock_allowunits": _bool_attr(dock_el, "allowunits") if dock_el is not None else None,
            "dock_external": _bool_attr(dock_el, "external") if dock_el is not None else None,
            "dock_playeronly": _bool_attr(dock_el, "playeronly") if dock_el is not None else None,
            "dock_priority": _int(dock_el, "priority") if dock_el is not None else None,
            "dock_showroom": _bool_attr(dock_el, "showroom") if dock_el is not None else None,
            "dock_size_tags": docksize_el.get("tags") if docksize_el is not None else None,
            # Equipment / supply
            "equip_classes": equip_el.get("classes") if equip_el is not None else None,
            "supply_classes": supply_el.get("classes") if supply_el is not None else None,
            # Production
            "production_research": _bool_attr(prod_parent, "research")
            if prod_parent is not None
            else None,
            "production_show_active": _bool_attr(prod_parent, "showactivestate")
            if prod_parent is not None
            else None,
            # Builder
            "builder_units": _int(builder_el, "optimalprocessorunits")
            if builder_el is not None
            else None,
            "build_has_storage": _bool_attr(build_el, "buildstorage")
            if build_el is not None
            else None,
            "build_sets": _build_sets(build_sets_el),
            # Movement
            "rotation_speed_max": _float(rotationspeed_el, "max"),
            "rotation_accel_max": _float(rotationaccel_el, "max"),
            "translation_speed_max": _float(translationspeed_el, "max"),
            "translation_accel_max": _float(translationaccel_el, "max"),
            "undock_distance": _float(undock_el, "distance"),
            "undock_speed": _float(undock_el, "speed"),
            "undock_rotate": _bool_attr(undock_el, "rotate"),
            # Misc
            "autoaim_allow": _bool_attr(autoaim_el, "allow") if autoaim_el is not None else None,
            "ownership_claim": _bool_attr(ownership_el, "claim")
            if ownership_el is not None
            else None,
            "longrangescan_minlevel": _int(longrangescan_el, "minlevel")
            if longrangescan_el is not None
            else None,
            # Hardpoints
            "turrets_s": hardpoints["turret_s"],
            "turrets_m": hardpoints["turret_m"],
            "turrets_l": hardpoints["turret_l"],
            "turrets_xl": hardpoints["turret_xl"],
            "shields_s": hardpoints["shield_s"],
            "shields_m": hardpoints["shield_m"],
            "shields_l": hardpoints["shield_l"],
            # Dock / hangar
            "dock_s": dock_counts["dock_s"],
            "dock_m": dock_counts["dock_m"],
            "dock_l": dock_counts["dock_l"],
            "dock_xl": dock_counts["dock_xl"],
            "hangar_s": hangar_counts["hangar_s"],
            "hangar_m": hangar_counts["hangar_m"],
            # Connection points
            "snap_points": snap_points,
            # Production
            "production_method": production_method,
            "shields_xl": hardpoints["shield_xl"],
            "icon_path": f"/assets/icons/modules/{macro_name}.png",
        }
    )


def _count_dock_bays(
    macro_el: etree._Element,
    dock_counts: dict[str, int],
    hangar_counts: dict[str, int],
) -> None:
    """Count docking bays (by ship size) and ship storage from macro connections."""
    conns_el = macro_el.find("connections")
    if conns_el is None:
        return
    for conn in conns_el.iterfind("connection"):
        macro_ref_el = conn.find("macro")
        if macro_ref_el is None:
            continue
        ref = macro_ref_el.get("ref", "")
        if "dockingbay" in ref:
            if "_xs_" in ref or "_s_" in ref:
                dock_counts["dock_s"] += 1
            elif "_m_" in ref:
                dock_counts["dock_m"] += 1
            elif "_l_" in ref:
                dock_counts["dock_l"] += 1
            elif "_xl_" in ref:
                dock_counts["dock_xl"] += 1
        elif "shipstorage" in ref:
            if "_xs_" in ref or "_s_" in ref:
                hangar_counts["hangar_s"] += 1
            elif "_m_" in ref:
                hangar_counts["hangar_m"] += 1


def _count_snap_points(comp_bytes: bytes) -> int:
    """Count <connection tags=\"snap\"> in component XML."""
    try:
        root = etree.fromstring(comp_bytes)
    except etree.XMLSyntaxError:
        return 0
    count = 0
    for conn in root.iterfind(".//connection"):
        tags = conn.get("tags", "")
        if "snap" in tags:
            count += 1
    return count


def _resolve_and_count_hardpoints(
    xml_bytes: bytes,
    resolve_name: Callable[[str], bytes],
    hardpoints: dict[str, int],
) -> None:
    """Recursively search for <connection> tags with weapon/shield/turret capabilities."""
    try:
        root = etree.fromstring(xml_bytes)
    except etree.XMLSyntaxError:
        return

    _count_connections(root, hardpoints)

    # Some components reference sub-components or macros. Recursively resolve.
    for conn in root.iterfind(".//connection"):
        macro_ref_el = conn.find("macro")
        if macro_ref_el is not None:
            macro_ref = macro_ref_el.get("ref")
            if macro_ref:
                try:
                    child_bytes = resolve_name(macro_ref)
                    _resolve_and_count_hardpoints(child_bytes, resolve_name, hardpoints)
                except (KeyError, OSError):
                    pass


def _count_connections(root: etree._Element, hardpoints: dict[str, int]) -> None:
    for conn in root.iterfind(".//connection"):
        tags = conn.get("tags", "").lower()
        if not tags:
            continue

        is_turret = "turret" in tags
        is_shield = "shield" in tags

        if not (is_turret or is_shield):
            continue

        if "small" in tags:
            size = "s"
        elif "medium" in tags:
            size = "m"
        elif "large" in tags:
            size = "l"
        elif "extralarge" in tags:
            size = "xl"
        else:
            continue

        if is_turret:
            hardpoints[f"turret_{size}"] += 1
        elif is_shield:
            hardpoints[f"shield_{size}"] += 1


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM modules")

    cols = [
        "module_id",
        "name",
        "file_path",
        "is_legacy",
        "dlc",
        "kind",
        "size",
        "makerrace",
        "description",
        "shortname",
        "is_datavault",
        "is_landmark",
        "is_unique",
        "icon",
        "hudicon",
        "factionhqicon",
        "subtype",
        "produces_ware_id",
        "storage_capacity",
        "storage_type",
        "drone_capacity",
        "workforce_capacity",
        "workforce_race",
        "workforce_growthrate",
        "hull",
        "hull_min",
        "hull_integrated",
        "hull_invulnerable",
        "hull_noscrap",
        "explosiondamage",
        "explosion_shield_damage",
        "secrecy_level",
        "dock_allow",
        "dock_allowbuild",
        "dock_allowtrade",
        "dock_allowunits",
        "dock_external",
        "dock_playeronly",
        "dock_priority",
        "dock_showroom",
        "dock_size_tags",
        "equip_classes",
        "supply_classes",
        "production_research",
        "production_show_active",
        "builder_units",
        "build_has_storage",
        "build_sets",
        "rotation_speed_max",
        "rotation_accel_max",
        "translation_speed_max",
        "translation_accel_max",
        "undock_distance",
        "undock_speed",
        "undock_rotate",
        "autoaim_allow",
        "ownership_claim",
        "longrangescan_minlevel",
        "turrets_s",
        "turrets_m",
        "turrets_l",
        "turrets_xl",
        "shields_s",
        "shields_m",
        "shields_l",
        "shields_xl",
        "dock_s",
        "dock_m",
        "dock_l",
        "dock_xl",
        "hangar_s",
        "hangar_m",
        "snap_points",
        "production_method",
        "icon_path",
    ]

    if result.modules:
        conn.executemany(
            f"INSERT INTO modules ({','.join(cols)}) VALUES ({','.join(':' + c for c in cols)})",
            result.modules,
        )


def _build_sets(el: etree._Element | None) -> str | None:
    """Extract space-separated build set refs from <sets><set ref="..."/>."""
    if el is None:
        return None
    refs = [ref for s in el.iterfind("set") if (ref := s.get("ref")) is not None]
    return " ".join(refs) if refs else None
