"""Extract NPC station instances from `libraries/god.xml`.

god.xml `<stations>` lists every NPC-owned station placed in the universe at
game start: shipyards, wharfs, equipment docks, trade stations, defence
platforms, pirate bases, etc.  Each entry carries the owning faction, the
station's functional tags, and its position in a sector or zone.

Location macros use god.xml's lowercase convention, e.g.
"cluster_14_sector001_macro" — not the PascalCase used in the map tables.
"""

from __future__ import annotations

import json
import re
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    stations: list[dict[str, Any]] = field(default_factory=list)


_RE_TAGS = re.compile(r"[a-zA-Z_]+")
_RE_SECTOR_FROM_ZONE = re.compile(r"(cluster_\w+?_sector\w+?)(?:_macro|$)", re.IGNORECASE)


def extract(god_bytes: bytes) -> ExtractResult:
    """Parse god.xml into NPC station instance rows. Pure function — no I/O."""
    root = etree.fromstring(god_bytes)
    out = ExtractResult()

    stations_el = root.find("stations")
    if stations_el is None:
        return out

    seen: set[str] = set()
    for s_el in stations_el:
        if callable(s_el.tag) or s_el.tag != "station":
            continue

        station_id = s_el.get("id")
        if not station_id or station_id in seen:
            continue
        seen.add(station_id)

        owner   = s_el.get("owner")
        race    = s_el.get("race")

        # Tags live on <station><select tags="[shipyard]"/>
        select_el = s_el.find("station/select")
        tags: list[str] = []
        if select_el is not None:
            raw_tags = select_el.get("tags", "")
            tags = _RE_TAGS.findall(raw_tags)

        # Location: zone macro or sector macro
        loc_el  = s_el.find("location")
        pos_el  = s_el.find("position")

        location_zone: str | None = None
        location_sector: str | None = None

        if loc_el is not None:
            loc_class = loc_el.get("class")
            loc_macro = loc_el.get("macro", "").lower()
            if loc_class == "zone":
                location_zone = loc_macro
                location_sector = _derive_sector(loc_macro)
            elif loc_class == "sector":
                location_sector = loc_macro

        x = y = z = None
        if pos_el is not None:
            x = _float(pos_el, "x")
            y = _float(pos_el, "y")
            z = _float(pos_el, "z")

        out.stations.append({
            "station_id":      station_id,
            "owner_faction":   owner,
            "race":            race,
            "tags":            json.dumps(tags) if tags else None,
            "location_zone":   location_zone,
            "location_sector": location_sector,
            "x": x, "y": y, "z": z,
        })

    return out


_HOSTILE_FACTIONS = {"xenon", "khaak"}

# Tag priority for sector ownership — higher = more authoritative claim
_TAG_PRIORITY = {
    "shipyard": 5,
    "wharf": 4,
    "equipmentdock": 3,
    "tradestation": 2,
    "defence": 1,
}


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM npc_stations")
    if result.stations:
        conn.executemany(
            "INSERT INTO npc_stations "
            "(station_id, owner_faction, race, tags, location_zone, location_sector, x, y, z) "
            "VALUES (:station_id, :owner_faction, :race, :tags, "
            ":location_zone, :location_sector, :x, :y, :z)",
            result.stations,
        )

    # Derive sector owner from npc_stations: highest-priority non-hostile station wins.
    # god.xml uses lowercase sector macros; sectors table uses PascalCase.  Use LOWER() to join.
    sector_owner: dict[str, tuple[int, str]] = {}  # lower_sector → (priority, faction)
    for s in result.stations:
        sector = s.get("location_sector")
        faction = s.get("owner_faction")
        if not sector or not faction or faction in _HOSTILE_FACTIONS:
            continue
        tags: list[str] = json.loads(s["tags"]) if s.get("tags") else []
        priority = max((_TAG_PRIORITY.get(t, 0) for t in tags), default=0)
        current = sector_owner.get(sector)
        if current is None or priority > current[0]:
            sector_owner[sector] = (priority, faction)

    for lower_sector, (_, faction) in sector_owner.items():
        conn.execute(
            "UPDATE sectors SET owner_faction = ? WHERE LOWER(sector_id) = ?",
            (faction, lower_sector),
        )


def _derive_sector(zone_macro: str) -> str | None:
    m = _RE_SECTOR_FROM_ZONE.search(zone_macro)
    if m:
        s = m.group(1)
        return s if s.endswith("_macro") else s + "_macro"
    return None


def _float(el: etree._Element, attr: str) -> float | None:
    v = el.get(attr)
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None
