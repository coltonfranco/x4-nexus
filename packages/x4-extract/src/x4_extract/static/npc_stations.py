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
from collections import Counter, defaultdict
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
    """Write NPC station placements + derived ownership into seed.db.

    `conn` must be the seed.db connection with static.db ATTACHed AS `s` — the
    derivations map god.xml's lowercase sector macros to the canonical PascalCase
    `s.sectors.sector_id` and look up each sector's cluster. Caller wraps in a transaction.
    """
    conn.execute("DELETE FROM npc_stations")
    if result.stations:
        conn.executemany(
            "INSERT INTO npc_stations "
            "(station_id, owner_faction, race, tags, location_zone, location_sector, x, y, z) "
            "VALUES (:station_id, :owner_faction, :race, :tags, "
            ":location_zone, :location_sector, :x, :y, :z)",
            result.stations,
        )

    # Canonical id maps from the reference map (static.db, attached as s).
    lower_to_canonical: dict[str, str] = {}
    sector_to_cluster: dict[str, str | None] = {}
    for sid, cid in conn.execute("SELECT sector_id, cluster_id FROM s.sectors"):
        lower_to_canonical[sid.lower()] = sid
        sector_to_cluster[sid] = cid

    # Derive sector owner: highest-priority non-hostile station in the sector wins.
    sector_owner: dict[str, tuple[int, str]] = {}  # lower_sector → (priority, faction)
    for st in result.stations:
        sector = st.get("location_sector")  # already lowercased in extract()
        faction = st.get("owner_faction")
        if not sector or not faction or faction in _HOSTILE_FACTIONS:
            continue
        tags: list[str] = json.loads(st["tags"]) if st.get("tags") else []
        priority = max((_TAG_PRIORITY.get(t, 0) for t in tags), default=0)
        current = sector_owner.get(sector)
        if current is None or priority > current[0]:
            sector_owner[sector] = (priority, faction)

    conn.execute("DELETE FROM sector_ownership")
    sector_rows: list[tuple[str, str]] = []
    for lower_sector, (_, faction) in sector_owner.items():
        canonical = lower_to_canonical.get(lower_sector)
        if canonical is not None:
            sector_rows.append((canonical, faction))
    conn.executemany(
        "INSERT INTO sector_ownership (sector_id, owner_faction) VALUES (?, ?)",
        sector_rows,
    )

    # Predominant sector owner per cluster.
    cluster_counter: dict[str, Counter[str]] = defaultdict(Counter)
    for canonical, faction in sector_rows:
        cluster_id = sector_to_cluster.get(canonical)
        if cluster_id is not None:
            cluster_counter[cluster_id][faction] += 1
    conn.execute("DELETE FROM cluster_ownership")
    conn.executemany(
        "INSERT INTO cluster_ownership (cluster_id, owner_faction) VALUES (?, ?)",
        [(cid, counter.most_common(1)[0][0]) for cid, counter in cluster_counter.items()],
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
