"""Extract modules into the datalake."""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.static.constants import MODULE_CLASSES, dlc_from_path

_RE_SIZE_FROM_NAME = re.compile(r"_([smlx]{1,2})_", re.IGNORECASE)
_NAME_TO_SIZE = {"s": "small", "m": "medium", "l": "large", "xl": "extralarge", "xs": "extralarge"}


@dataclass(slots=True)
class ExtractResult:
    modules: list[dict[str, Any]] = field(default_factory=list)


def extract(index_bytes: bytes, resolve_path: Callable[[str], bytes], resolve_name: Callable[[str], bytes]) -> ExtractResult:
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

    # Deep stats
    hull_el = macro_el.find("properties/hull")
    exp_el = macro_el.find("properties/explosiondamage")
    workforce_el = macro_el.find("properties/workforce")
    cargo_el = macro_el.find("properties/cargo")
    storage_el = macro_el.find("properties/storage")
    prod_el = macro_el.find("properties/production/queue")

    produces_ware_id = prod_el.get("ware") if prod_el is not None else None

    # Cargo (for storage modules)
    storage_capacity = None
    storage_type = None
    if cargo_el is not None:
        storage_capacity = _int(cargo_el, "max")
        storage_type = cargo_el.get("tags")

    # Hardpoints
    hardpoints = {
        "turret_s": 0, "turret_m": 0, "turret_l": 0, "turret_xl": 0,
        "shield_s": 0, "shield_m": 0, "shield_l": 0, "shield_xl": 0,
    }

    comp_ref_el = macro_el.find("component")
    if comp_ref_el is not None:
        comp_ref = comp_ref_el.get("ref")
        if comp_ref:
            try:
                comp_bytes = resolve_name(comp_ref)
                _resolve_and_count_hardpoints(comp_bytes, resolve_name, hardpoints)
            except (KeyError, OSError):
                pass

    out.modules.append({
        "module_id": macro_name,
        "name": display_name,
        "file_path": file_path,
        "is_legacy": "legacy" in file_path.lower(),
        "dlc": dlc_from_path(file_path),
        "kind": kind,
        "size": size,
        "produces_ware_id": produces_ware_id,
        "storage_capacity": storage_capacity,
        "storage_type": storage_type,
        "drone_capacity": _int(storage_el, "unit"),
        "workforce_capacity": _int(workforce_el, "capacity") if _int(workforce_el, "capacity") is not None else _int(workforce_el, "max"),
        "hull": _int(hull_el, "max"),
        "explosiondamage": _int(exp_el, "value"),
        "turrets_s": hardpoints["turret_s"],
        "turrets_m": hardpoints["turret_m"],
        "turrets_l": hardpoints["turret_l"],
        "turrets_xl": hardpoints["turret_xl"],
        "shields_s": hardpoints["shield_s"],
        "shields_m": hardpoints["shield_m"],
        "shields_l": hardpoints["shield_l"],
        "shields_xl": hardpoints["shield_xl"],
        "icon_path": f"/assets/icons/modules/{macro_name}.png",
    })


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
        "module_id", "name", "file_path", "is_legacy", "dlc", "kind", "size", "produces_ware_id",
        "storage_capacity", "storage_type", "drone_capacity", "workforce_capacity",
        "hull", "explosiondamage", "turrets_s", "turrets_m", "turrets_l", "turrets_xl",
        "shields_s", "shields_m", "shields_l", "shields_xl", "icon_path"
    ]

    if result.modules:
        conn.executemany(
            f"INSERT INTO modules ({','.join(cols)}) VALUES ({','.join(':'+c for c in cols)})",
            result.modules,
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
