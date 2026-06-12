"""Map topology endpoints.

Exposes clusters, sectors, and gates.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class ClusterSummary(PublicModel):
    cluster_id: str
    macro_id: str | None = None
    name: str | None = None
    description: str | None = None
    owner_faction: str | None = None
    dlc: str | None = None
    environment: str | None = None
    sun_class: str | None = None
    population_id: str | None = None
    max_population: int | None = None
    x: float | None = None
    y: float | None = None
    z: float | None = None
    # Hex-grid layout coordinates
    qx: float | None = None
    qy: float | None = None
    qz: float | None = None
    qw: float | None = None


class SectorSummary(PublicModel):
    sector_id: str
    cluster_id: str | None
    macro_id: str | None = None
    name: str | None = None
    description: str | None = None
    owner_faction: str | None
    dlc: str | None = None
    sunlight: float | None = None
    economy: float | None = None
    security: float | None = None
    tags: str | None = None
    access_licence: str | None = None
    x: float | None = None
    y: float | None = None
    z: float | None = None
    # Hex-grid layout coordinates
    qx: float | None = None
    qy: float | None = None
    qz: float | None = None
    qw: float | None = None


class ZoneSummary(PublicModel):
    zone_id: str
    sector_id: str | None
    x: float | None = None
    y: float | None = None
    z: float | None = None


class GateSummary(PublicModel):
    from_zone_id: str
    to_zone_id: str
    kind: str | None

class SuperhighwaySummary(PublicModel):
    from_zone_id: str
    to_zone_id: str
    kind: str

class RegionSummary(PublicModel):
    region_id: str
    cluster_id: str | None = None
    sector_id: str | None = None
    x: float | None = None
    y: float | None = None
    z: float | None = None


class ResourceEntry(PublicModel):
    region_name: str
    sector_id: str | None
    ware: str
    yield_level: str


class LiveResourceEntry(PublicModel):
    sector_id: str
    ware: str
    current: int | None
    max: int | None
    yield_tier: str | None


@router.get("/map/clusters", response_model=list[ClusterSummary])
def list_clusters(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner_faction: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ClusterSummary]:
    # owner_faction is gamestart seed (predominant sector owner), LEFT JOINed from seed.db.
    sql = [
        "SELECT c.cluster_id, c.name AS macro_id, c.dlc, c.name_id AS name, c.description_id AS description, "
        "co.owner_faction, c.environment, c.sun_class, c.population_id, c.max_population, "
        "c.x, c.y, c.z, c.qx, c.qy, c.qz, c.qw",
        "FROM s.clusters c LEFT JOIN seed.cluster_ownership co ON co.cluster_id = c.cluster_id WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if owner_faction is not None:
        sql.append("AND co.owner_faction = :owner_faction")
        params["owner_faction"] = owner_faction
    sql.append("ORDER BY c.cluster_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [ClusterSummary(**dict(r)) for r in rows]


@router.get("/map/sectors", response_model=list[SectorSummary])
def list_sectors(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    cluster_id: str | None = Query(None),
    owner_faction: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[SectorSummary]:
    # owner_faction is gamestart seed, LEFT JOINed from seed.sector_ownership.
    sql = [
        "SELECT sec.sector_id, sec.cluster_id, sec.name AS macro_id, so.owner_faction, sec.dlc, "
        "sec.name_id AS name, sec.description_id AS description, sec.sunlight, sec.economy, sec.security, "
        "sec.tags, sec.access_licence, sec.x, sec.y, sec.z, sec.qx, sec.qy, sec.qz, sec.qw "
        "FROM s.sectors sec LEFT JOIN seed.sector_ownership so ON so.sector_id = sec.sector_id WHERE 1=1"
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if cluster_id is not None:
        sql.append("AND sec.cluster_id = :cluster_id")
        params["cluster_id"] = cluster_id
    if owner_faction is not None:
        sql.append("AND so.owner_faction = :owner_faction")
        params["owner_faction"] = owner_faction
    sql.append("ORDER BY sec.sector_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [SectorSummary(**dict(r)) for r in rows]


@router.get("/map/sectors/{sector_id}", response_model=SectorSummary)
def get_sector(
    sector_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> SectorSummary:
    row = conn.execute(
        "SELECT sec.sector_id, sec.cluster_id, sec.name AS macro_id, so.owner_faction, sec.dlc, "
        "sec.name_id AS name, sec.description_id AS description, sec.sunlight, sec.economy, sec.security, "
        "sec.tags, sec.access_licence, sec.x, sec.y, sec.z, sec.qx, sec.qy, sec.qz, sec.qw "
        "FROM s.sectors sec LEFT JOIN seed.sector_ownership so ON so.sector_id = sec.sector_id "
        "WHERE sec.sector_id = :id",
        {"id": sector_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown sector_id: {sector_id}")
    return SectorSummary(**dict(row))


@router.get("/map/gates", response_model=list[GateSummary])
def list_gates(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    limit: int = Query(500, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> list[GateSummary]:
    rows = conn.execute(
        "SELECT from_zone_id, to_zone_id, kind FROM s.gates ORDER BY from_zone_id, to_zone_id LIMIT :limit OFFSET :offset",
        {"limit": limit, "offset": offset},
    ).fetchall()
    return [GateSummary(**dict(r)) for r in rows]


@router.get("/map/zones", response_model=list[ZoneSummary])
def list_zones(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    sector_id: str | None = Query(None),
    limit: int = Query(500, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> list[ZoneSummary]:
    sql = ["SELECT zone_id, sector_id, x, y, z FROM s.zones WHERE 1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if sector_id is not None:
        sql.append("AND sector_id = :sector_id")
        params["sector_id"] = sector_id
    sql.append("ORDER BY zone_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [ZoneSummary(**dict(r)) for r in rows]


@router.get("/map/sectors/{sector_id}/zones", response_model=list[ZoneSummary])
def get_sector_zones(
    sector_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[ZoneSummary]:
    """List all zones available in a specific sector."""
    row = conn.execute("SELECT 1 FROM s.sectors WHERE sector_id = :id", {"id": sector_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown sector_id: {sector_id}")
    rows = conn.execute(
        "SELECT zone_id, sector_id, x, y, z FROM s.zones WHERE sector_id = :id ORDER BY zone_id",
        {"id": sector_id},
    ).fetchall()
    return [ZoneSummary(**dict(r)) for r in rows]


class MapStation(PublicModel):
    station_id: str
    name: str | None = None
    code: str | None = None
    macro: str | None = None
    owner_faction: str | None = None
    sector_id: str | None = None
    zone_id: str | None = None
    x: float | None = None
    y: float | None = None
    z: float | None = None
    # Function category derived from gamestart tags; one of the major types below or
    # the first tag present, else None for ordinary production stations.
    category: str | None = None
    is_player_owned: bool = False
    is_hq: bool = False
    is_under_construction: bool = False
    source: str = "seed"  # 'live' (active save) | 'seed' (gamestart placement)


# Function tags the in-sector map keeps visible when zoomed out (order = priority).
_MAJOR_STATION_TAGS = ("shipyard", "wharf", "equipmentdock", "tradestation")

# Live station macros encode their function (e.g. station_arg_tradestation_base_01_macro,
# station_pla_headquarters_base_01_macro). Substring → category, checked in this order.
_MACRO_CATEGORY_MARKERS = (
    ("shipyard", "shipyard"),
    ("wharf", "wharf"),
    ("equipmentdock", "equipmentdock"),
    ("tradestation", "tradestation"),
    ("headquarters", "headquarters"),
    ("defence", "defence"),
    ("defense", "defence"),
    ("piratebase", "piratebase"),
    ("piratestation", "piratebase"),
    ("factory", "factory"),
)


def _category_from_macro(macro: str | None) -> str | None:
    """Derive a function category from a live station's macro id."""
    if not macro:
        return None
    m = macro.lower()
    for marker, category in _MACRO_CATEGORY_MARKERS:
        if marker in m:
            return category
    return None


def _station_category(tags_raw: str | None) -> str | None:
    """Pick a display category from a gamestart npc_station tags JSON array."""
    if not tags_raw:
        return None
    try:
        tags = json.loads(tags_raw)
    except (ValueError, TypeError):
        return None
    if not isinstance(tags, list) or not tags:
        return None
    lowered = [str(t).lower() for t in tags]
    for major in _MAJOR_STATION_TAGS:
        if major in lowered:
            return major
    return lowered[0]


@router.get("/map/stations", response_model=list[MapStation])
def list_map_stations(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    sector_id: str | None = Query(None, description="Filter by sector macro id"),
    limit: int = Query(5000, ge=1, le=20000),
    offset: int = Query(0, ge=0),
) -> list[MapStation]:
    """Stations positioned within their sector, for the zoomed-in map view.

    Prefers live save stations; positions fall back live -> static zone centre, so
    placement is correct at zone granularity even before per-station offsets are
    parsed. With no save ingested, returns gamestart npc placements (which already
    carry coordinates). `category` is derived from gamestart function tags.
    """
    has_table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='stations'"
    ).fetchone()
    has_live = bool(has_table) and (
        conn.execute("SELECT 1 FROM stations LIMIT 1").fetchone() is not None
    )

    params: dict[str, object] = {"limit": limit, "offset": offset}
    if has_live:
        sql = [
            "SELECT st.station_id, st.name, st.code, st.macro, st.owner_faction, "
            "st.sector_id, st.zone_id, "
            # Station offset is zone-relative; add the zone's sector-relative centre for an
            # accurate sector-relative position. tempzone stations (no zone coord) fall back
            # to offset-from-sector-origin.
            "(COALESCE(z.x, 0) + COALESCE(st.x, 0)) AS x, "
            "(COALESCE(z.y, 0) + COALESCE(st.y, 0)) AS y, "
            "(COALESCE(z.z, 0) + COALESCE(st.z, 0)) AS z, "
            "st.is_player_owned, st.is_under_construction, "
            "(SELECT ns.tags FROM seed.npc_stations ns WHERE LOWER(ns.location_zone) = LOWER(st.zone_id) LIMIT 1) AS tags, "
            "CASE WHEN p.hq_station_id IS NOT NULL AND p.hq_station_id = st.station_id THEN 1 ELSE 0 END AS is_hq, "
            "'live' AS source "
            "FROM stations st "
            # Save zone ids are lowercase; static zone ids are PascalCase — match case-insensitively.
            "LEFT JOIN s.zones z ON LOWER(z.zone_id) = LOWER(st.zone_id) "
            "LEFT JOIN player p ON p.id = 1 "
            "WHERE 1=1"
        ]
        if sector_id is not None:
            sql.append("AND st.sector_id = :sector_id")
            params["sector_id"] = sector_id
        sql.append("ORDER BY st.station_id LIMIT :limit OFFSET :offset")
    else:
        sql = [
            "SELECT ns.station_id, NULL AS name, NULL AS code, NULL AS macro, "
            "ns.owner_faction, ns.location_sector AS sector_id, ns.location_zone AS zone_id, "
            "COALESCE(z.x, ns.x) AS x, COALESCE(z.y, ns.y) AS y, COALESCE(z.z, ns.z) AS z, "
            "0 AS is_player_owned, 0 AS is_under_construction, ns.tags AS tags, "
            "0 AS is_hq, 'seed' AS source "
            "FROM seed.npc_stations ns "
            "LEFT JOIN s.zones z ON LOWER(z.zone_id) = LOWER(ns.location_zone) "
            "WHERE 1=1"
        ]
        if sector_id is not None:
            sql.append("AND ns.location_sector = :sector_id")
            params["sector_id"] = sector_id
        sql.append("ORDER BY ns.station_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    out: list[MapStation] = []
    for r in rows:
        d = dict(r)
        tags = d.pop("tags", None)
        # Live macro is the most reliable signal; fall back to gamestart tags (seed branch).
        category = _category_from_macro(d.get("macro")) or _station_category(tags)
        out.append(MapStation(category=category, **d))
    return out


@router.get("/map/resources", response_model=list[ResourceEntry])
def list_resources(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    ware: str | None = Query(None, description="Filter by ware (ore, silicon, nividium, hydrogen, helium, methane, ice)"),
    sector_id: str | None = Query(None, description="Filter by sector macro ID"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ResourceEntry]:
    """List resource region entries. Filter by ware to find where a resource spawns."""
    sql = [
        "SELECT region_name, sector_id, ware, yield AS yield_level",
        "FROM s.region_resources WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if ware is not None:
        sql.append("AND ware = :ware")
        params["ware"] = ware
    if sector_id is not None:
        sql.append("AND sector_id = :sector_id")
        params["sector_id"] = sector_id
    sql.append("ORDER BY region_name, ware LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [ResourceEntry(**dict(r)) for r in rows]


@router.get("/map/sectors/{sector_id}/resources", response_model=list[ResourceEntry])
def get_sector_resources(
    sector_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[ResourceEntry]:
    """List all resources available in a specific sector."""
    row = conn.execute("SELECT 1 FROM s.sectors WHERE sector_id = :id", {"id": sector_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown sector_id: {sector_id}")
    rows = conn.execute(
        "SELECT region_name, sector_id, ware, yield AS yield_level "
        "FROM s.region_resources WHERE sector_id = :id ORDER BY ware",
        {"id": sector_id},
    ).fetchall()
    return [ResourceEntry(**dict(r)) for r in rows]


@router.get("/map/resources/live", response_model=list[LiveResourceEntry])
def list_live_resources(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    ware: str | None = Query(None, description="Filter by ware (ore, silicon, ...)"),
    sector_id: str | None = Query(None, description="Filter by sector macro id"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[LiveResourceEntry]:
    """Live, depleting mineable resources per sector, from the active save.

    Returns [] until a save with resource data is ingested (the dashboard's mining
    heatmap falls back to the static /map/resources in that case).
    """
    table = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sector_resources'"
    ).fetchone()
    if table is None:  # dynamic DB predates the schema; treat as no data
        return []
    sql = [
        "SELECT sector_id, ware, current, max, yield_tier FROM sector_resources WHERE 1=1"
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if ware is not None:
        sql.append("AND ware = :ware")
        params["ware"] = ware
    if sector_id is not None:
        sql.append("AND sector_id = :sector_id")
        params["sector_id"] = sector_id
    sql.append("ORDER BY sector_id, ware LIMIT :limit OFFSET :offset")
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [LiveResourceEntry(**dict(r)) for r in rows]


@router.get("/map/regions", response_model=list[RegionSummary])
def list_regions(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    cluster_id: str | None = Query(None),
    sector_id: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[RegionSummary]:
    sql = ["SELECT region_id, cluster_id, sector_id, x, y, z FROM s.regions WHERE 1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if cluster_id is not None:
        sql.append("AND cluster_id = :cluster_id")
        params["cluster_id"] = cluster_id
    if sector_id is not None:
        sql.append("AND sector_id = :sector_id")
        params["sector_id"] = sector_id
    sql.append("ORDER BY region_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [RegionSummary(**dict(r)) for r in rows]

@router.get("/map/superhighways", response_model=list[SuperhighwaySummary])
def list_superhighways(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    limit: int = Query(500, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> list[SuperhighwaySummary]:
    rows = conn.execute(
        "SELECT from_zone_id, to_zone_id, kind FROM s.superhighways ORDER BY from_zone_id, to_zone_id LIMIT :limit OFFSET :offset",
        {"limit": limit, "offset": offset},
    ).fetchall()
    return [SuperhighwaySummary(**dict(r)) for r in rows]


class SectorConnection(PublicModel):
    from_sector_id: str
    to_sector_id: str
    kind: str | None  # gate | highway


@router.get("/map/sector-connections", response_model=list[SectorConnection])
def list_sector_connections(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[SectorConnection]:
    """Return all sector-to-sector connections (gate and superhighway, deduplicated)."""
    rows = conn.execute("""
        SELECT DISTINCT
            CASE WHEN z1.sector_id < z2.sector_id THEN z1.sector_id ELSE z2.sector_id END AS from_sector_id,
            CASE WHEN z1.sector_id < z2.sector_id THEN z2.sector_id ELSE z1.sector_id END AS to_sector_id,
            'gate' AS kind
        FROM s.gates g
        JOIN s.zones z1 ON z1.zone_id = g.from_zone_id
        JOIN s.zones z2 ON z2.zone_id = g.to_zone_id
        WHERE z1.sector_id != z2.sector_id
          AND z1.sector_id IS NOT NULL AND z2.sector_id IS NOT NULL

        UNION

        SELECT DISTINCT
            CASE WHEN z1.sector_id < z2.sector_id THEN z1.sector_id ELSE z2.sector_id END AS from_sector_id,
            CASE WHEN z1.sector_id < z2.sector_id THEN z2.sector_id ELSE z1.sector_id END AS to_sector_id,
            sh.kind AS kind
        FROM s.superhighways sh
        JOIN s.zones z1 ON z1.zone_id = sh.from_zone_id
        JOIN s.zones z2 ON z2.zone_id = sh.to_zone_id
        WHERE z1.sector_id != z2.sector_id
          AND z1.sector_id IS NOT NULL AND z2.sector_id IS NOT NULL

        ORDER BY from_sector_id, to_sector_id
    """).fetchall()
    return [SectorConnection(**dict(r)) for r in rows]


class ClusterConnection(PublicModel):
    from_cluster_id: str
    to_cluster_id: str
    kind: str | None  # gate | highway


@router.get("/map/connections", response_model=list[ClusterConnection])
def list_cluster_connections(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[ClusterConnection]:
    """Return all cluster-to-cluster connections (gate and superhighway, deduplicated)."""
    rows = conn.execute("""
        SELECT DISTINCT
            CASE WHEN s1.cluster_id < s2.cluster_id THEN s1.cluster_id ELSE s2.cluster_id END AS from_cluster_id,
            CASE WHEN s1.cluster_id < s2.cluster_id THEN s2.cluster_id ELSE s1.cluster_id END AS to_cluster_id,
            'gate' AS kind
        FROM s.gates g
        JOIN s.zones z1 ON z1.zone_id = g.from_zone_id
        JOIN s.sectors s1 ON s1.sector_id = z1.sector_id
        JOIN s.zones z2 ON z2.zone_id = g.to_zone_id
        JOIN s.sectors s2 ON s2.sector_id = z2.sector_id
        WHERE s1.cluster_id != s2.cluster_id
          AND s1.cluster_id IS NOT NULL AND s2.cluster_id IS NOT NULL

        UNION

        SELECT DISTINCT
            CASE WHEN s1.cluster_id < s2.cluster_id THEN s1.cluster_id ELSE s2.cluster_id END AS from_cluster_id,
            CASE WHEN s1.cluster_id < s2.cluster_id THEN s2.cluster_id ELSE s1.cluster_id END AS to_cluster_id,
            sh.kind AS kind
        FROM s.superhighways sh
        JOIN s.zones z1 ON z1.zone_id = sh.from_zone_id
        JOIN s.sectors s1 ON s1.sector_id = z1.sector_id
        JOIN s.zones z2 ON z2.zone_id = sh.to_zone_id
        JOIN s.sectors s2 ON s2.sector_id = z2.sector_id
        WHERE s1.cluster_id != s2.cluster_id
          AND s1.cluster_id IS NOT NULL AND s2.cluster_id IS NOT NULL

        ORDER BY from_cluster_id, to_cluster_id
    """).fetchall()
    return [ClusterConnection(**dict(r)) for r in rows]


class ClusterResourceEntry(PublicModel):
    cluster_id: str
    ware: str
    yield_level: str  # low | medium | high | veryhigh (best yield present in the cluster)


@router.get("/map/cluster-resources", response_model=list[ClusterResourceEntry])
def list_cluster_resources(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[ClusterResourceEntry]:
    """Return best resource yield per ware per cluster, for map overlay display."""
    rows = conn.execute("""
        SELECT c.cluster_id, rr.ware,
            CASE MAX(
                CASE rr.yield WHEN 'veryhigh' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END
            )
                WHEN 4 THEN 'veryhigh'
                WHEN 3 THEN 'high'
                WHEN 2 THEN 'medium'
                ELSE 'low'
            END AS yield_level
        FROM s.region_resources rr
        JOIN s.sectors s ON s.sector_id = rr.sector_id
        JOIN s.clusters c ON c.cluster_id = s.cluster_id
        GROUP BY c.cluster_id, rr.ware
        ORDER BY c.cluster_id, rr.ware
    """).fetchall()
    return [ClusterResourceEntry(**dict(r)) for r in rows]
