"""Extract resource region definitions from `libraries/region_definitions.xml`.

Each <region> entry lists the wares it contains and their yield level.  Region
definitions are generic templates; their sector placement is encoded in the map
files (maps/xu_ep2_universe/*.xml) where each cluster macro lists its region
connections.  The caller should build a `region_to_sectors` mapping from those
map files and pass it here so that each (region, ware) pair is expanded into one
row per sector where the region appears.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    resources: list[dict[str, Any]] = field(default_factory=list)


# Parses region_macro names like C01S01_Region002_macro → cluster 01, sector 01
_RE_REGION_MACRO = re.compile(r"^C(\d+)S(\d+)_", re.IGNORECASE)


def build_region_sector_map(map_xmls: dict[str, bytes]) -> dict[str, set[str]]:
    """Return {region_def_name: {sector_id, ...}} by scanning map file region connections."""
    mapping: dict[str, set[str]] = {}
    for _filename, xml_bytes in map_xmls.items():
        try:
            root = etree.fromstring(xml_bytes)
        except etree.XMLSyntaxError:
            continue
        for conn_el in root.iterfind('.//connection[@ref="regions"]'):
            inner_macro = conn_el.find("macro")
            if inner_macro is None:
                continue
            region_prop = inner_macro.find(".//properties/region")
            region_def = region_prop.get("ref") if region_prop is not None else None
            if not region_def:
                continue
            # Walk up to the enclosing sector macro to get the canonical sector ID.
            sector_el: etree._Element | None = conn_el
            for _ in range(4):  # connection → connections → macro(sector) — 2-3 levels up
                if sector_el is None:
                    break
                sector_el = sector_el.getparent()
                if sector_el is None:
                    break
                if sector_el.tag == "macro" and sector_el.get("name", "").endswith("_macro"):
                    sector_id = sector_el.get("name")
                    if sector_id is not None:
                        mapping.setdefault(region_def, set()).add(sector_id)
                    break
    return mapping


# Map asteroid groupref prefixes to ware IDs and yield levels.
# Size suffixes: xxl/xl → veryhigh, l → high, m → medium, s/xs → low
_ASTEROID_WARE = {
    "asteroid_ore": "ore",
    "asteroid_silicon": "silicon",
    "asteroid_nividium": "nividium",
    "asteroid_ice": "ice",
    "asteroid_hydrogen": "hydrogen",
    "asteroid_helium": "helium",
    "asteroid_methane": "methane",
    "asteroid_rawscrap": "rawscrap",
}
_SIZE_YIELD = {
    "xxl": "veryhigh",
    "xl": "veryhigh",
    "l": "high",
    "m": "medium",
    "s": "low",
    "xs": "low",
}


def extract(
    xml_bytes: bytes,
    region_to_sectors: dict[str, set[str]] | None = None,
) -> ExtractResult:
    """Parse region_definitions.xml into (region_name, sector_id, ware, yield) rows.

    Region definitions use <fields><asteroid groupref=\"asteroid_ore_l\"> to
    declare resource types and yield levels.  The ware is parsed from the
    groupref prefix, the yield from the size suffix.
    """
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    mapping = region_to_sectors or {}

    for region_el in root.iterfind("region"):
        name = region_el.get("name")
        if not name:
            continue

        # Collect unique (ware, best_yield) pairs from asteroid fields
        best_yield: dict[str, str] = {}
        for ast_el in region_el.iterfind("fields/asteroid"):
            groupref = ast_el.get("groupref", "")
            for prefix, ware in _ASTEROID_WARE.items():
                if groupref.startswith(prefix):
                    size = groupref[len(prefix) :].lstrip("_")
                    yld = _SIZE_YIELD.get(size, "medium")
                    # Keep the best yield per ware
                    prev = best_yield.get(ware)
                    if prev is None or _yield_rank(yld) > _yield_rank(prev):
                        best_yield[ware] = yld
                    break

        # Also collect gas resources from <fields><nebula resources="hydrogen helium">
        for neb_el in region_el.iterfind("fields/nebula"):
            res_str = neb_el.get("resources", "")
            for r in res_str.split():
                if r and r not in best_yield:
                    best_yield[r] = "medium"  # nebulas don't declare yield levels

        if not best_yield:
            continue

        sectors: list[str | None] = list(mapping.get(name, [None]))
        for sector_id in sectors:
            for ware, yield_level in best_yield.items():
                out.resources.append(
                    {
                        "region_name": name,
                        "sector_id": sector_id,
                        "ware": ware,
                        "yield": yield_level,
                    }
                )

    return out


def _yield_rank(yld: str) -> int:
    return {"veryhigh": 4, "high": 3, "medium": 2, "low": 1}.get(yld, 1)


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM region_resources")
    if result.resources:
        conn.executemany(
            "INSERT INTO region_resources (region_name, sector_id, ware, yield) "
            "VALUES (:region_name, :sector_id, :ware, :yield)",
            result.resources,
        )
