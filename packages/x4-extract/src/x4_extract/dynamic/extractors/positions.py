"""Shared position cache for collectors that need component offsets.

Multiple collectors (ships, deployables, stations) each register a wildcard position
listener at depth=None. The streaming dispatcher fires only the *first* matching
registration per element — the rest never see the element.  Rather than forcing every
collector to maintain its own position dict (which would stay empty for all but the
first-registered one), this module provides a SINGLE shared dict and a single
registration that all collectors wire into.

Usage from a collector::

    from x4_extract.dynamic.extractors.positions import (
        position_cache,
        register_position_handler,
    )

    class MyCollector:
        # read-only — populated by the shared handler
        _component_offsets = position_cache

        def register(self) -> list[Registration]:
            return [
                # … your own registrations …
                register_position_handler(),
            ]
"""

from __future__ import annotations

from lxml import etree

from x4_extract.savefile.dispatch import Registration, Target

# component_id → (x, y, z)
position_cache: dict[str, tuple[float, float, float]] = {}

# zone_macro → (x, y, z) from static.db — loaded once by load_static_zones()
_static_zones: dict[str, tuple[float, float, float]] = {}


def _float(v: str | None) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except ValueError:
        return 0.0


def load_static_zones(static_db_path: str) -> None:
    """Pre-load every zone's design-time position from static.db.

    Zones with <offset default=\"1\"/> (no position child) inherit their static
    position instead of a meaningless (0, 0, 0). Call once before ingestion.

    Static DB uses mixed-case zone IDs (Zone001_Cluster_01_…) while saves use
    lowercase everywhere — store keys lowercased so lookups from save macros match."""
    import sqlite3

    _static_zones.clear()
    conn = sqlite3.connect(static_db_path)
    for row in conn.execute("SELECT zone_id, x, y, z FROM zones"):
        _static_zones[row[0].lower()] = (
            float(row[1]) if row[1] is not None else 0.0,
            float(row[2]) if row[2] is not None else 0.0,
            float(row[3]) if row[3] is not None else 0.0,
        )
    conn.close()


def _on_position(elem: etree._Element) -> None:
    """Capture <offset><position x=… y=… z=…/> into the shared cache.

    Missing attributes default to 0.0 — X4 frequently omits coordinates that are
    zero (e.g. <position z=\"159016\"/>)."""
    offset = elem.getparent()
    if offset is None or offset.tag != "offset":
        return
    comp = offset.getparent()
    if comp is None or comp.tag != "component":
        return
    cid = comp.get("id")
    if cid:
        position_cache[cid] = (
            _float(elem.get("x")),
            _float(elem.get("y")),
            _float(elem.get("z")),
        )


def _on_offset(elem: etree._Element) -> None:
    """Handle <offset default=\"1\"/> (no <position> child).

    The <position> handler fires BEFORE this one (children before parents in the
    end-event stream).  Only zone, sector, and cluster components get fallback
    positions — their static positions serve as spatial anchors for nested ships.
    Ship/station components that carry an empty offset (typically just <rotation>)
    are left unset so the ancestor walk can reach the enclosing zone."""
    comp = elem.getparent()
    if comp is None or comp.tag != "component":
        return
    cid = comp.get("id")
    if cid is None or cid in position_cache:
        return
    cls = comp.get("class", "")
    if cls == "zone":
        macro = comp.get("macro", "").lower()
        static_pos = _static_zones.get(macro)
        position_cache[cid] = static_pos if static_pos is not None else (0.0, 0.0, 0.0)
    elif cls in ("sector", "cluster"):
        position_cache[cid] = (0.0, 0.0, 0.0)


def register_position_handler() -> Registration:
    """Capture <position x=… y=… z=…/> under <offset> at any depth."""
    return Registration(
        target=Target(tag="position", depth=None, parent_tag="offset"),
        visitor=_on_position,
    )


def register_offset_handler() -> Registration:
    """Capture bare <offset> elements as a fallback when no <position> child exists."""
    return Registration(
        target=Target(tag="offset", depth=None),
        visitor=_on_offset,
    )
