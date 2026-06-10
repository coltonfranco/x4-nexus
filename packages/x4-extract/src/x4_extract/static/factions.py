"""Extract `libraries/factions.xml` + `libraries/colors.xml` into the factions tables.

Color resolution is a two-level indirection in X4:
  <color ref="faction_argon" />  in factions.xml
  → <mapping id="faction_argon" ref="azure_dark_moderate_glow" />  in colors.xml
  → <color id="azure_dark_moderate_glow" r="0" g="120" b="215" a="255" />  in colors.xml
  → "#0078D7"
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    factions: list[dict[str, Any]] = field(default_factory=list)
    relations: list[dict[str, Any]] = field(default_factory=list)
    licences: list[dict[str, Any]] = field(default_factory=list)


def extract(factions_bytes: bytes, colors_bytes: bytes | None = None) -> ExtractResult:
    """Parse factions.xml (and optionally colors.xml) into row dicts. Pure function — no I/O."""
    color_map = _build_color_map(colors_bytes) if colors_bytes else {}

    root = etree.fromstring(factions_bytes)
    out = ExtractResult()

    for f_el in root.iterfind("faction"):
        faction_id = f_el.get("id")
        if not faction_id:
            continue

        color_el = f_el.find("color")
        color_ref = color_el.get("ref") if color_el is not None else None
        color_hex = color_map.get(color_ref) if color_ref else None

        icon_el = f_el.find("icon")
        icon_active = icon_el.get("active") if icon_el is not None else None
        icon_inactive = icon_el.get("inactive") if icon_el is not None else None
        icon_banner = icon_el.get("banner") if icon_el is not None else None

        out.factions.append(
            {
                "faction_id": faction_id,
                "name": f_el.get("name", faction_id),
                "color_hex": color_hex,
                "primary_race": f_el.get("primaryrace"),
                "description": f_el.get("description"),
                "short_name": f_el.get("shortname"),
                "prefix_name": f_el.get("prefixname"),
                "space_name": f_el.get("spacename"),
                "home_space_name": f_el.get("homespacename"),
                "behaviour_set": f_el.get("behaviourset"),
                "police_faction": f_el.get("policefaction"),
                "icon_active": icon_active,
                "icon_inactive": icon_inactive,
                "icon_banner": icon_banner,
                "tags": f_el.get("tags"),
            }
        )

        for rel_el in f_el.iterfind("relations/relation"):
            other = rel_el.get("faction")
            val = rel_el.get("relation")
            if other and val is not None:
                try:
                    out.relations.append({
                        "faction_id": faction_id,
                        "other_faction_id": other,
                        "initial_relation": float(val),
                    })
                except ValueError:
                    pass

        for lic_el in f_el.iterfind("licences/licence"):
            l_type = lic_el.get("type")
            if l_type:
                price = None
                p_str = lic_el.get("price")
                if p_str and p_str.isdigit():
                    price = int(p_str)
                min_rel = None
                r_str = lic_el.get("minrelation")
                if r_str:
                    try:
                        min_rel = float(r_str)
                    except ValueError:
                        pass
                
                out.licences.append({
                    "licence_type": l_type,
                    "faction_id": faction_id,
                    "name": lic_el.get("name"),
                    "description": lic_el.get("description"),
                    "icon": lic_el.get("icon"),
                    "precursor": lic_el.get("precursor"),
                    "price": price,
                    "min_relation": min_rel,
                })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    """Replace faction rows in static.db. Caller wraps in a transaction."""
    conn.execute("DELETE FROM faction_licences")
    conn.execute("DELETE FROM faction_relations")
    conn.execute("DELETE FROM factions")
    conn.executemany(
        "INSERT INTO factions (faction_id, name, color_hex, primary_race, description, short_name, prefix_name, "
        "space_name, home_space_name, behaviour_set, police_faction, icon_active, icon_inactive, icon_banner, tags) "
        "VALUES (:faction_id, :name, :color_hex, :primary_race, :description, :short_name, :prefix_name, "
        ":space_name, :home_space_name, :behaviour_set, :police_faction, :icon_active, :icon_inactive, :icon_banner, :tags)",
        result.factions,
    )
    conn.executemany(
        "INSERT INTO faction_relations (faction_id, other_faction_id, initial_relation) "
        "VALUES (:faction_id, :other_faction_id, :initial_relation)",
        result.relations,
    )
    # Use INSERT OR IGNORE because factions.xml can list the same licence multiple times per faction with different precursor/tags
    conn.executemany(
        "INSERT OR IGNORE INTO faction_licences (licence_type, faction_id, name, description, icon, precursor, price, min_relation) "
        "VALUES (:licence_type, :faction_id, :name, :description, :icon, :precursor, :price, :min_relation)",
        result.licences,
    )


def _build_color_map(colors_bytes: bytes) -> dict[str, str]:
    """Return mapping of color/mapping id → '#RRGGBB' hex string."""
    root = etree.fromstring(colors_bytes)

    # Pass 1: direct color definitions id → (r, g, b)
    rgb: dict[str, tuple[int, int, int]] = {}
    for el in root.iter("color"):
        cid = el.get("id")
        r, g, b = el.get("r"), el.get("g"), el.get("b")
        if cid and r is not None and g is not None and b is not None:
            try:
                rgb[cid] = (int(r), int(g), int(b))
            except ValueError:
                pass

    # Pass 2: mappings id → ref (indirection layer)
    resolved: dict[str, str] = {}
    for el in root.iter("mapping"):
        mid = el.get("id")
        ref = el.get("ref")
        if mid and ref and ref in rgb:
            r, g, b = rgb[ref]
            resolved[mid] = f"#{r:02X}{g:02X}{b:02X}"

    # Also expose direct colors by id for completeness
    for cid, (r, g, b) in rgb.items():
        resolved.setdefault(cid, f"#{r:02X}{g:02X}{b:02X}")

    return resolved
