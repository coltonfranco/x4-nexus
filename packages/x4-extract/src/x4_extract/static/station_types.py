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

    sets = [s.get("ref") for s in macro_el.iterfind("properties/build/sets/set") if s.get("ref")]

    # Skip pure environmental objects that carry no build context
    if not sets and ident_el is None:
        return

    out.stations.append({
        "station_id": macro_name,
        "name": ident_el.get("name") if ident_el is not None else None,
        "file_path": file_path,
        "icon": ident_el.get("icon") if ident_el is not None else None,
        "hull": _int(hull_el, "max"),
        "workforce_max": _int(workforce_el, "max"),
        "build_sets": json.dumps(sets) if sets else None,
    })


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM station_types")
    if result.stations:
        conn.executemany(
            "INSERT INTO station_types (station_id, name, file_path, icon, hull, workforce_max, build_sets) "
            "VALUES (:station_id, :name, :file_path, :icon, :hull, :workforce_max, :build_sets)",
            result.stations,
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
