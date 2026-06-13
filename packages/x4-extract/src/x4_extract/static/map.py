"""Extract map data from `maps/xu_ep2_universe/` XML files.

Accepts any number of XML files from that directory. Each file may contain
`<macro class="cluster|sector|zone">` entries (both base game and DLC files
share this format). Gate topology is read from `galaxy.xml`, which is
diff-patched by the crawler to include all DLC connections.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

_RE_DLC = re.compile(r"^dlc_?(\w+?)_(?:clusters|sectors|zones|sechighways|zonehighways)\.xml$", re.IGNORECASE)


def _dlc_from_filename(name: str) -> str | None:
    m = _RE_DLC.match(name)
    return m.group(1) if m else None


@dataclass(slots=True)
class ExtractResult:
    clusters: list[dict[str, Any]] = field(default_factory=list)
    sectors: list[dict[str, Any]] = field(default_factory=list)
    zones: list[dict[str, Any]] = field(default_factory=list)
    gates: list[dict[str, Any]] = field(default_factory=list)
    regions: list[dict[str, Any]] = field(default_factory=list)
    superhighways: list[dict[str, Any]] = field(default_factory=list)
    zone_gate_kinds: dict[str, str] = field(default_factory=dict)


def extract(xmls: dict[str, bytes]) -> ExtractResult:
    """Parse any set of map XML bytes into row dicts. Pure function — no I/O.

    Keys are bare filenames (e.g. ``"clusters.xml"``, ``"dlc_boron_sectors.xml"``).
    Every file is scanned for cluster/sector/zone macros; gates are only
    parsed from ``galaxy.xml``.
    """
    out = ExtractResult()

    defaults: dict[str, dict[str, Any]] = {}
    if b_defaults := xmls.get("mapdefaults.xml"):
        try:
            root = etree.fromstring(b_defaults)
            defaults = _parse_mapdefaults(root)
        except etree.XMLSyntaxError:
            pass

    roots: dict[str, etree._Element] = {}
    for name, data in xmls.items():
        if name == "mapdefaults.xml":
            continue
        try:
            roots[name] = etree.fromstring(data)
        except etree.XMLSyntaxError:
            continue

    offsets: dict[str, dict[str, float]] = {}
    for root in roots.values():
        _parse_offsets(root, offsets)

    for name, root in roots.items():
        _parse_macros(root, out, defaults, offsets, dlc=_dlc_from_filename(name))
        _parse_regions(root, out, offsets)
        _parse_superhighways(root, out)

        if "galaxy" in name:
            _parse_gates(root, out)

    _compute_cluster_ownership(out.clusters, out.sectors)

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    """Replace map rows in static.db. Caller wraps in a transaction."""
    conn.execute("DELETE FROM superhighways")
    conn.execute("DELETE FROM regions")
    conn.execute("DELETE FROM gates")
    conn.execute("DELETE FROM zones")
    conn.execute("DELETE FROM sectors")
    conn.execute("DELETE FROM clusters")

    # owner_faction is gamestart seed (→ seed.db), not reference; not stored on clusters/sectors.
    conn.executemany(
        """INSERT INTO clusters (
            cluster_id, name, dlc, name_id, description_id, environment, sun_class, population_id, max_population, x, y, z, qx, qy, qz, qw
        ) VALUES (
            :cluster_id, :name, :dlc, :name_id, :description_id, :environment, :sun_class, :population_id, :max_population, :x, :y, :z, :qx, :qy, :qz, :qw
        )""",
        result.clusters,
    )
    conn.executemany(
        """INSERT INTO sectors (
            sector_id, cluster_id, name, dlc, name_id, description_id, sunlight, economy, security, tags, access_licence, x, y, z, qx, qy, qz, qw
        ) VALUES (
            :sector_id, :cluster_id, :name, :dlc, :name_id, :description_id, :sunlight, :economy, :security, :tags, :access_licence, :x, :y, :z, :qx, :qy, :qz, :qw
        )""",
        result.sectors,
    )
    conn.executemany(
        "INSERT INTO zones (zone_id, sector_id, x, y, z, qx, qy, qz, qw) "
        "VALUES (:zone_id, :sector_id, :x, :y, :z, :qx, :qy, :qz, :qw)",
        result.zones,
    )
    # Deduplicate composite-key tables: DLC map files may re-declare the same
    # gate/highway/region entries.  Last-wins so DLC overrides are preserved.
    _dedup(result.gates, ("from_zone_id", "to_zone_id"))
    _dedup(result.superhighways, ("from_zone_id", "to_zone_id"))
    _dedup(result.regions, ("region_id",))

    conn.executemany(
        "INSERT INTO gates (from_zone_id, to_zone_id, kind) "
        "VALUES (:from_zone_id, :to_zone_id, :kind)",
        result.gates,
    )
    conn.executemany(
        "INSERT INTO superhighways (from_zone_id, to_zone_id, kind) "
        "VALUES (:from_zone_id, :to_zone_id, :kind)",
        result.superhighways,
    )
    conn.executemany(
        "INSERT INTO regions (region_id, cluster_id, sector_id, x, y, z, qx, qy, qz, qw) "
        "VALUES (:region_id, :cluster_id, :sector_id, :x, :y, :z, :qx, :qy, :qz, :qw)",
        result.regions,
    )


# ---------------------------------------------------------------------------
# Internal parsers
# ---------------------------------------------------------------------------

def _parse_macros(
    root: etree._Element,
    out: ExtractResult,
    defaults: dict[str, dict[str, Any]],
    offsets: dict[str, dict[str, float]],
    dlc: str | None = None,
) -> None:
    for macro in root.iter("macro"):
        cls      = macro.get("class")
        macro_id = macro.get("name")
        if not macro_id or not cls:
            continue

        props = defaults.get(macro_id.lower(), {})
        pos = offsets.get(macro_id, {})

        if cls == "cluster":
            out.clusters.append({
                "cluster_id": macro_id,
                "name":       macro_id,
                "dlc":        dlc,
                "name_id":        props.get("name_id"),
                "description_id": props.get("description_id"),
                "environment":    props.get("environment"),
                "sun_class":      props.get("sun_class"),
                "population_id":  props.get("population_id"),
                "max_population": props.get("max_population"),
                "owner_faction":  None,
                "x": pos.get("x"),
                "y": pos.get("y"),
                "z": pos.get("z"),
                "qx": pos.get("qx"),
                "qy": pos.get("qy"),
                "qz": pos.get("qz"),
                "qw": pos.get("qw"),
            })

        elif cls == "sector":
            cluster_id = _derive_cluster_id(macro_id)
            out.sectors.append({
                "sector_id":    macro_id,
                "cluster_id":   cluster_id,
                "name":         macro_id,
                "owner_faction": None,
                "dlc":           dlc,
                "name_id":        props.get("name_id"),
                "description_id": props.get("description_id"),
                "sunlight":       props.get("sunlight"),
                "economy":        props.get("economy"),
                "security":       props.get("security"),
                "tags":           props.get("tags"),
                "access_licence": props.get("access_licence"),
                "x": pos.get("x"),
                "y": pos.get("y"),
                "z": pos.get("z"),
                "qx": pos.get("qx"),
                "qy": pos.get("qy"),
                "qz": pos.get("qz"),
                "qw": pos.get("qw"),
            })

        elif cls == "zone":
            sector_id = _derive_sector_id(macro_id)
            out.zones.append({
                "zone_id":   macro_id,
                "sector_id": sector_id,
                "x": pos.get("x"),
                "y": pos.get("y"),
                "z": pos.get("z"),
                "qx": pos.get("qx"),
                "qy": pos.get("qy"),
                "qz": pos.get("qz"),
                "qw": pos.get("qw"),
            })

            for conn_el in macro.findall(".//connection"):
                m2 = conn_el.find("macro")
                if m2 is not None:
                    ref = m2.get("ref", "").lower()
                    if "accelerator" in ref:
                        out.zone_gate_kinds[macro_id] = "accelerator"
                    elif "gate" in ref:
                        out.zone_gate_kinds[macro_id] = "gate"


def _parse_offsets(root: etree._Element, offsets: dict[str, dict[str, float]]) -> None:
    for conn in root.iterfind(".//connection"):
        mac = conn.find("macro")
        if mac is not None:
            ref = mac.get("ref") or mac.get("name")
            if ref:
                offset_data = {}
                pos = conn.find(".//offset/position")
                if pos is not None:
                    try:
                        offset_data["x"] = float(pos.get("x", 0))
                        offset_data["y"] = float(pos.get("y", 0))
                        offset_data["z"] = float(pos.get("z", 0))
                    except ValueError:
                        pass
                quat = conn.find(".//offset/quaternion")
                if quat is not None:
                    try:
                        offset_data["qx"] = float(quat.get("qx", 0))
                        offset_data["qy"] = float(quat.get("qy", 0))
                        offset_data["qz"] = float(quat.get("qz", 0))
                        offset_data["qw"] = float(quat.get("qw", 1))
                    except ValueError:
                        pass
                if offset_data:
                    offsets[ref] = offset_data


def _parse_gates(root: etree._Element, out: ExtractResult) -> None:
    """Parse inter-sector gate connections from galaxy.xml format."""
    for el in root.iterfind(".//connection"):
        # Test-fixture shorthand
        from_zone = el.get("from_zone_id")
        to_zone   = el.get("to_zone_id")
        if from_zone and to_zone:
            out.gates.append({"from_zone_id": from_zone, "to_zone_id": to_zone, "kind": el.get("kind")})
            continue

        # Real game format: <connection ref="destination" path="..."><macro path="..."/></connection>
        if el.get("ref") != "destination":
            continue
        from_path = el.get("path")
        mac = el.find("macro")
        if not from_path or mac is None:
            continue
        to_path = mac.get("path")
        if not to_path:
            continue

        m_from = re.search(r"([^/]+_connection)/connection_", from_path)
        m_to   = re.search(r"([^/]+_connection)/connection_", to_path)
        if m_from and m_to:
            from_zone = m_from.group(1).replace("_connection", "_macro")
            to_zone = m_to.group(1).replace("_connection", "_macro")
            kind = out.zone_gate_kinds.get(from_zone) or out.zone_gate_kinds.get(to_zone) or "gate"
            out.gates.append({
                "from_zone_id": from_zone,
                "to_zone_id":   to_zone,
                "kind":         kind,
            })

def _parse_regions(root: etree._Element, out: ExtractResult, offsets: dict[str, dict[str, float]]) -> None:
    _RE_REGION_MACRO = re.compile(r"^C(\d+)S(\d+)_", re.IGNORECASE)
    for conn_el in root.iterfind('.//connection[@ref="regions"]'):
        inner_macro = conn_el.find("macro")
        if inner_macro is None:
            continue
        region_macro_name = inner_macro.get("name")
        if not region_macro_name:
            continue
            
        pos = offsets.get(region_macro_name, {})
        m = _RE_REGION_MACRO.match(region_macro_name)
        
        cluster_id = None
        sector_id = None
        if m:
            cluster_id = f"Cluster_{int(m.group(1)):02d}_macro"
            sector_id = f"Cluster_{int(m.group(1)):02d}_Sector{int(m.group(2)):03d}_macro"
            
        out.regions.append({
            "region_id": region_macro_name,
            "cluster_id": cluster_id,
            "sector_id": sector_id,
            "x": pos.get("x"),
            "y": pos.get("y"),
            "z": pos.get("z"),
            "qx": pos.get("qx"),
            "qy": pos.get("qy"),
            "qz": pos.get("qz"),
            "qw": pos.get("qw"),
        })

def _parse_superhighways(root: etree._Element, out: ExtractResult) -> None:
    # Handle superhighways in clusters.xml or sechighways.xml
    for conn_el in root.iterfind('.//connection[@ref="sechighways"]'):
        mac = conn_el.find("macro")
        if mac is None:
            continue
        # Find entry and exit points inside the macro
        entry = mac.find('.//connection[@ref="entrypoint"]/macro')
        exit_ = mac.find('.//connection[@ref="exitpoint"]/macro')
        if entry is not None and exit_ is not None:
            from_ref = entry.get("ref")
            to_ref = exit_.get("ref")
            if from_ref and to_ref:
                out.superhighways.append({
                    "from_zone_id": from_ref,
                    "to_zone_id": to_ref,
                    "kind": "superhighway",
                })
    
    # Handle zonehighways
    for conn_el in root.iterfind('.//connection[@ref="zonehighways"]'):
        mac = conn_el.find("macro")
        if mac is None:
            continue
        entry = mac.find('.//connection[@ref="entrypoint"]/macro')
        exit_ = mac.find('.//connection[@ref="exitpoint"]/macro')
        if entry is not None and exit_ is not None:
            from_path = entry.get("path", "")
            to_path = exit_.get("path", "")
            m_from = re.search(r"([^/]+_connection)", from_path)
            m_to = re.search(r"([^/]+_connection)", to_path)
            if m_from and m_to:
                out.superhighways.append({
                    "from_zone_id": m_from.group(1).replace("_connection", "_macro"),
                    "to_zone_id": m_to.group(1).replace("_connection", "_macro"),
                    "kind": "localhighway",
                })

def _compute_cluster_ownership(clusters: list[dict[str, Any]], sectors: list[dict[str, Any]]) -> None:
    from collections import Counter
    cluster_owners = {}
    for c in clusters:
        cluster_id = c["cluster_id"]
        owners = [s["owner_faction"] for s in sectors if s["cluster_id"] == cluster_id and s.get("owner_faction")]
        if owners:
            # Predominant owner
            common = Counter(owners).most_common(1)
            cluster_owners[cluster_id] = common[0][0]
            
    for c in clusters:
        c["owner_faction"] = cluster_owners.get(c["cluster_id"])

def _parse_mapdefaults(root: etree._Element) -> dict[str, dict[str, Any]]:
    defaults = {}
    for ds in root.iter("dataset"):
        macro = ds.get("macro")
        if not macro: continue
        macro = macro.lower()  # normalise; game XMLs use PascalCase, mapdefaults uses mixed case
        
        props: dict[str, Any] = {}
        ident = ds.find(".//identification")
        if ident is not None:
            props["name_id"] = ident.get("name")
            props["description_id"] = ident.get("description")
            
        area = ds.find(".//area")
        if area is not None:
            props["sunlight"] = _float(area, "sunlight")
            props["economy"] = _float(area, "economy")
            props["security"] = _float(area, "security")
            raw_tags = area.get("tags", "").strip()
            props["tags"] = raw_tags if raw_tags else None

        access = ds.find(".//access")
        if access is not None:
            props["access_licence"] = access.get("licence")
            
        env = ds.find(".//space")
        if env is not None:
            props["environment"] = env.get("environment")
            
        sun = ds.find(".//sun")
        if sun is not None:
            props["sun_class"] = sun.get("class")
            
        pop_id = None
        max_population = 0
        for planet in ds.iter("planet"):
            p_pop = planet.get("population")
            if p_pop:
                pop_id = p_pop
            maxpop = planet.get("maxpopulation")
            if maxpop and maxpop.isdigit():
                max_population += int(maxpop)
        
        if pop_id:
            props["population_id"] = pop_id
        if max_population > 0:
            props["max_population"] = max_population
            
        defaults[macro] = props
    return defaults


# ---------------------------------------------------------------------------
# Derivation helpers
# ---------------------------------------------------------------------------

_RE_CLUSTER_FROM_SECTOR = re.compile(r"^(Cluster_\w+?)_Sector", re.IGNORECASE)


def _derive_cluster_id(sector_id: str) -> str | None:
    m = _RE_CLUSTER_FROM_SECTOR.match(sector_id)
    return (m.group(1) + "_macro") if m else None

def _derive_sector_id(zone_macro: str) -> str | None:
    # e.g., "Zone005_Cluster_108_Sector001_macro" -> "Cluster_108_Sector001_macro"
    # e.g., "tzoneCluster_108_Sector001SHCon6_GateZone_macro" -> "Cluster_108_Sector001_macro"
    m = re.search(r"(Cluster_\d+_Sector\d+)", zone_macro, re.IGNORECASE)
    if m:
        return f"{m.group(1)}_macro"
    m = re.search(r"(Cluster_\d+)", zone_macro, re.IGNORECASE)
    if m:
        return f"{m.group(1)}_macro"
    
    # Fallback to older regex
    m = re.search(r"^(t?zone|Zone\d+_)(.*)", zone_macro, re.IGNORECASE)
    if m:
        return m.group(2)
    return None

def _float(el: etree._Element, attr: str) -> float | None:
    v = el.get(attr)
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _dedup(rows: list[dict[str, Any]], keys: tuple[str, ...]) -> None:
    """Deduplicate *rows* in-place by composite key, keeping the last occurrence."""
    seen: dict[tuple, dict[str, Any]] = {}
    for r in rows:
        key = tuple(r[k] for k in keys)
        seen[key] = r
    rows[:] = list(seen.values())
