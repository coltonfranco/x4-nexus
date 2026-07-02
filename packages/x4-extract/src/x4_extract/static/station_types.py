"""Extract NPC and buildable station type definitions (macro class="station").

Station macros define the top-level objects that appear on the galaxy map as named
locations: wharfs, shipyards, trading stations, equipment docks, etc. Environmental
objects (asteroid turrets, derelicts) also carry class="station" but have no build
sets — they are excluded by the presence check on <build><sets>.

Parsed from macros.xml index + individual macro files, same pattern as ships/modules.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.parsing import xml_attr_bool as _bool_attr
from x4_extract.parsing import xml_attr_int as _int


@dataclass(slots=True)
class ExtractResult:
    stations: list[dict[str, Any]] = field(default_factory=list)


def extract(
    index_bytes: bytes,
    resolve_path: Callable[[str], bytes],
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
            if macro_el is None or macro_el.get("class") != "station":
                continue
        except (KeyError, OSError, etree.XMLSyntaxError):
            continue

        seen.add(name)
        _parse_station(name, xml_path, macro_el, out)

    return out


def _parse_station(
    macro_name: str,
    file_path: str,
    macro_el: etree._Element,
    out: ExtractResult,
) -> None:
    ident_el = macro_el.find("properties/identification")
    hull_el = macro_el.find("properties/hull")
    workforce_el = macro_el.find("properties/workforce")
    dock_el = macro_el.find("properties/dock")
    docksize_el = macro_el.find("properties/docksize")
    equip_el = macro_el.find("properties/equip")
    supply_el = macro_el.find("properties/supply")
    prod_el = macro_el.find("properties/production")
    secrecy_el = macro_el.find("properties/secrecy")
    ownership_el = macro_el.find("properties/ownership")
    storage_el = macro_el.find("properties/storage")
    cargo_el = macro_el.find("properties/cargo")

    sets = [s.get("ref") for s in macro_el.iterfind("properties/build/sets/set") if s.get("ref")]

    # Skip pure environmental objects that carry no build context
    if not sets and ident_el is None:
        return

    out.stations.append({
        "station_id": macro_name,
        "name": ident_el.get("name") if ident_el is not None else None,
        "file_path": file_path,
        "makerrace": ident_el.get("makerrace") if ident_el is not None else None,
        "description": ident_el.get("description") if ident_el is not None else None,
        "icon": ident_el.get("icon") if ident_el is not None else None,
        "hull": _int(hull_el, "max"),
        "hull_integrated": _bool_attr(hull_el, "integrated"),
        "workforce_max": _int(workforce_el, "max") if _int(workforce_el, "max") is not None else _int(workforce_el, "capacity"),
        "workforce_race": workforce_el.get("race") if workforce_el is not None else None,
        "drone_capacity": _int(storage_el, "unit"),
        "storage_capacity": _int(cargo_el, "max") if cargo_el is not None else None,
        "storage_type": cargo_el.get("tags") if cargo_el is not None else None,
        "dock_allow": _bool_attr(dock_el, "allow") if dock_el is not None else None,
        "dock_allowtrade": _bool_attr(dock_el, "allowtrade") if dock_el is not None else None,
        "dock_allowbuild": _bool_attr(dock_el, "allowbuild") if dock_el is not None else None,
        "dock_external": _bool_attr(dock_el, "external") if dock_el is not None else None,
        "dock_playeronly": _bool_attr(dock_el, "playeronly") if dock_el is not None else None,
        "dock_size_tags": docksize_el.get("tags") if docksize_el is not None else None,
        "equip_classes": equip_el.get("classes") if equip_el is not None else None,
        "supply_classes": supply_el.get("classes") if supply_el is not None else None,
        "production_research": _bool_attr(prod_el, "research") if prod_el is not None else None,
        "secrecy_level": _int(secrecy_el, "level") if secrecy_el is not None else None,
        "ownership_claim": _bool_attr(ownership_el, "claim") if ownership_el is not None else None,
        "build_sets": json.dumps(sets) if sets else None,
    })


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM station_types")
    if result.stations:
        conn.executemany(
            "INSERT INTO station_types (station_id, name, file_path, makerrace, description, icon,"
            "  hull, hull_integrated, workforce_max, workforce_race,"
            "  drone_capacity, storage_capacity, storage_type,"
            "  dock_allow, dock_allowtrade, dock_allowbuild, dock_external, dock_playeronly, dock_size_tags,"
            "  equip_classes, supply_classes, production_research,"
            "  secrecy_level, ownership_claim, build_sets) "
            "VALUES (:station_id, :name, :file_path, :makerrace, :description, :icon,"
            "  :hull, :hull_integrated, :workforce_max, :workforce_race,"
            "  :drone_capacity, :storage_capacity, :storage_type,"
            "  :dock_allow, :dock_allowtrade, :dock_allowbuild, :dock_external, :dock_playeronly, :dock_size_tags,"
            "  :equip_classes, :supply_classes, :production_research,"
            "  :secrecy_level, :ownership_claim, :build_sets)",
            result.stations,
        )
