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
            region_macro_name = inner_macro.get("name", "")
            region_prop = inner_macro.find(".//properties/region")
            region_def = region_prop.get("ref") if region_prop is not None else None
            if not region_def:
                continue
            m = _RE_REGION_MACRO.match(region_macro_name)
            if m:
                sector_id = f"Cluster_{int(m.group(1)):02d}_Sector{int(m.group(2)):03d}_macro"
                mapping.setdefault(region_def, set()).add(sector_id)
    return mapping


def extract(
    xml_bytes: bytes,
    region_to_sectors: dict[str, set[str]] | None = None,
) -> ExtractResult:
    """Parse region_definitions.xml into (region_name, sector_id, ware, yield) rows.

    When `region_to_sectors` is provided (built from map files), each resource row
    is expanded once per sector the region appears in.  Regions with no map entry
    get a single row with sector_id=NULL.
    """
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    mapping = region_to_sectors or {}

    for region_el in root.iterfind("region"):
        name = region_el.get("name")
        if not name:
            continue

        resources = [
            (res_el.get("ware"), res_el.get("yield"))
            for res_el in region_el.iterfind("resources/resource")
            if res_el.get("ware") and res_el.get("yield")
        ]
        if not resources:
            continue

        sectors: list[str | None] = list(mapping.get(name, [None]))  # type: ignore[list-item]

        for sector_id in sectors:
            for ware, yield_level in resources:
                out.resources.append({
                    "region_name": name,
                    "sector_id": sector_id,
                    "ware": ware,
                    "yield": yield_level,
                })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM region_resources")
    if result.resources:
        conn.executemany(
            "INSERT OR IGNORE INTO region_resources (region_name, sector_id, ware, yield) "
            "VALUES (:region_name, :sector_id, :ware, :yield)",
            result.resources,
        )
