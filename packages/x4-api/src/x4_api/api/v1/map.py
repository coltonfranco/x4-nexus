"""Map topology endpoints.

Exposes clusters, sectors, and gates.
"""


import sqlite3
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.faction_utils import disambiguate
from x4_api.api.schemas import PublicModel

router = APIRouter()


def _faction_name_map(conn: sqlite3.Connection) -> dict[str, str]:
    """Return {faction_id: disambiguated_name} for every non-legacy faction."""
    rows = conn.execute(
        "SELECT faction_id, name FROM s.factions WHERE is_legacy = 0"
    ).fetchall()
    return {r["faction_id"]: r["name"] for r in disambiguate([dict(r) for r in rows])}


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
    known_to_player: bool = False


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
    # Build cluster ownership map from live stations (most-stations-wins per cluster).
    live_owner: dict[str, str] = {}
    owner_rows = conn.execute(
        "SELECT sec.cluster_id, st.owner_faction, COUNT(*) AS cnt "
        "FROM stations st "
        "JOIN s.sectors sec ON LOWER(sec.sector_id) = LOWER(st.sector_id) "
        "WHERE st.owner_faction IS NOT NULL "
        "GROUP BY sec.cluster_id, st.owner_faction "
        "ORDER BY cnt DESC"
    ).fetchall()
    seen: set[str] = set()
    for r in owner_rows:
        cid = r["cluster_id"]
        if cid not in seen:
            seen.add(cid)
            live_owner[cid] = r["owner_faction"]

    rows = conn.execute(
        "SELECT c.cluster_id, c.name AS macro_id, c.dlc, c.name_id AS name, c.description_id AS description, "
        "c.environment, c.sun_class, c.population_id, c.max_population, "
        "c.x, c.y, c.z, c.qx, c.qy, c.qz, c.qw "
        "FROM s.clusters c ORDER BY c.cluster_id LIMIT :limit OFFSET :offset",
        {"limit": limit, "offset": offset},
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["owner_faction"] = live_owner.get(d["cluster_id"])
        if owner_faction is not None and d.get("owner_faction") != owner_faction:
            continue
        out.append(ClusterSummary(**d))
    return out


@router.get("/map/sectors", response_model=list[SectorSummary])
def list_sectors(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    cluster_id: str | None = Query(None),
    owner_faction: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[SectorSummary]:
    has_sector_state = bool(conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sector_state'").fetchone())

    # Build sector ownership map from live stations (most-stations-wins per sector).
    live_owner: dict[str, str] = {}
    owner_rows = conn.execute(
        "SELECT LOWER(st.sector_id) AS sector_id, st.owner_faction, COUNT(*) AS cnt "
        "FROM stations st "
        "WHERE st.owner_faction IS NOT NULL AND st.sector_id IS NOT NULL "
        "GROUP BY LOWER(st.sector_id), st.owner_faction "
        "ORDER BY cnt DESC"
    ).fetchall()
    seen: set[str] = set()
    for r in owner_rows:
        sid = r["sector_id"]
        if sid not in seen:
            seen.add(sid)
            live_owner[sid] = r["owner_faction"]

    select_known = "COALESCE(ss.known_to_player, 0) AS known_to_player" if has_sector_state else "0 AS known_to_player"
    join_live = "LEFT JOIN sector_state ss ON ss.sector_id = LOWER(sec.sector_id) " if has_sector_state else ""

    sql = (
        f"SELECT sec.sector_id, sec.cluster_id, sec.name AS macro_id, sec.dlc, "
        f"sec.name_id AS name, sec.description_id AS description, sec.sunlight, sec.economy, sec.security, "
        f"sec.tags, sec.access_licence, sec.x, sec.y, sec.z, sec.qx, sec.qy, sec.qz, sec.qw, {select_known} "
        f"FROM s.sectors sec {join_live}WHERE 1=1"
    )

    params: dict[str, object] = {"limit": limit, "offset": offset}
    if cluster_id is not None:
        sql += " AND sec.cluster_id = :cluster_id"
        params["cluster_id"] = cluster_id
    sql += " ORDER BY sec.sector_id LIMIT :limit OFFSET :offset"

    rows = conn.execute(sql, params).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["owner_faction"] = live_owner.get(d["sector_id"].lower())
        if owner_faction is not None and d.get("owner_faction") != owner_faction:
            continue
        out.append(SectorSummary(**d))
    return out


@router.get("/map/sectors/{sector_id}", response_model=SectorSummary)
def get_sector(
    sector_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> SectorSummary:
    has_sector_state = bool(conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sector_state'").fetchone())
    select_known = "COALESCE(ss.known_to_player, 0) AS known_to_player" if has_sector_state else "0 AS known_to_player"
    join_live = "LEFT JOIN sector_state ss ON ss.sector_id = LOWER(sec.sector_id) " if has_sector_state else ""

    row = conn.execute(
        f"SELECT sec.sector_id, sec.cluster_id, sec.name AS macro_id, sec.dlc, "
        f"sec.name_id AS name, sec.description_id AS description, sec.sunlight, sec.economy, sec.security, "
        f"sec.tags, sec.access_licence, sec.x, sec.y, sec.z, sec.qx, sec.qy, sec.qz, sec.qw, {select_known} "
        f"FROM s.sectors sec {join_live}"
        f"WHERE sec.sector_id = :id",
        {"id": sector_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown sector_id: {sector_id}")
    d = dict(row)
    owner_row = conn.execute(
        "SELECT owner_faction, COUNT(*) AS cnt FROM stations "
        "WHERE LOWER(sector_id) = LOWER(:sid) AND owner_faction IS NOT NULL "
        "GROUP BY owner_faction ORDER BY cnt DESC LIMIT 1",
        {"sid": sector_id},
    ).fetchone()
    d["owner_faction"] = owner_row["owner_faction"] if owner_row else None
    return SectorSummary(**d)


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
    params: dict[str, object] = {"limit": limit, "offset": offset}
    sql = [
        "SELECT st.station_id, st.name, st.code, st.macro, st.owner_faction, "
        "st.sector_id, st.zone_id, "
        "(COALESCE(z.x, 0) + COALESCE(st.x, 0)) AS x, "
        "(COALESCE(z.y, 0) + COALESCE(st.y, 0)) AS y, "
        "(COALESCE(z.z, 0) + COALESCE(st.z, 0)) AS z, "
        "st.is_player_owned, st.is_under_construction, "
        "CASE WHEN p.hq_station_id IS NOT NULL AND p.hq_station_id = st.station_id THEN 1 ELSE 0 END AS is_hq, "
        "'live' AS source "
        "FROM stations st "
        "LEFT JOIN s.zones z ON LOWER(z.zone_id) = LOWER(st.zone_id) "
        "LEFT JOIN player p ON p.id = 1 "
        "WHERE 1=1"
    ]
    if sector_id is not None:
        sql.append("AND LOWER(st.sector_id) = LOWER(:sector_id)")
        params["sector_id"] = sector_id
    sql.append("ORDER BY st.station_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    out: list[MapStation] = []
    # ── resolve specific factory types from sell wares ──
    # 85% of live stations share a generic factory_base macro; their real function is
    # only visible through the wares they sell.  A single bulk query avoids N+1.
    factory_ids = [
        r["station_id"]
        for r in rows
        if _category_from_macro(r["macro"]) == "factory"
        and (r["macro"] or "").lower().endswith("factory_base_01_macro")
    ]
    # station_id → human-readable factory type (e.g. "Weapon Components")
    factory_type: dict[str, str] = {}
    if factory_ids:
        placeholders = ",".join("?" for _ in factory_ids)
        fr = conn.execute(
            f"SELECT so.station_id, w.name FROM station_offers so "
            f"JOIN s.wares w ON w.ware_id = so.ware_id "
            f"WHERE so.side = 'sell' AND so.station_id IN ({placeholders}) "
            f"ORDER BY so.quantity DESC",
            factory_ids,
        ).fetchall()
        seen: set[str] = set()
        for station_id, ware_name in fr:
            if station_id not in seen:
                seen.add(station_id)
                factory_type[station_id] = ware_name

    for r in rows:
        d = dict(r)
        category = _category_from_macro(d.get("macro"))
        if category == "factory":
            category = factory_type.get(d["station_id"], "Factory")
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


class ConflictFaction(PublicModel):
    faction_id: str
    faction_name: str
    fighter_count: int

class ConflictSide(PublicModel):
    factions: list[ConflictFaction]
    fighter_count: int

class ConflictEntry(PublicModel):
    sector_id: str
    fighter_count: int
    hostile_pair_count: int
    intensity: float  # 0.0–1.0 normalized across all sectors
    type: str  # 'battle', 'invasion', or 'skirmish'
    invader_name: str | None = None
    sector_owner_name: str | None = None
    factions: list[ConflictFaction]
    sides: list[ConflictSide]


def _live_sector_owners(conn: sqlite3.Connection) -> dict[str, tuple[str | None, str | None]]:
    """Return {lowercase_sector_id: (owner_faction, owner_name)} from live stations.

    Most-stations-wins per sector. Used to replace seed.sector_ownership lookups
    when a live save is loaded.
    """
    rows = conn.execute(
        "SELECT LOWER(st.sector_id) AS sid, st.owner_faction, f.name AS owner_name, COUNT(*) AS cnt "
        "FROM stations st "
        "LEFT JOIN s.factions f ON f.faction_id = st.owner_faction "
        "WHERE st.owner_faction IS NOT NULL AND st.sector_id IS NOT NULL "
        "GROUP BY LOWER(st.sector_id), st.owner_faction "
        "ORDER BY cnt DESC"
    ).fetchall()
    owners: dict[str, tuple[str | None, str | None]] = {}
    seen: set[str] = set()
    for r in rows:
        sid = r["sid"]
        if sid not in seen:
            seen.add(sid)
            owners[sid] = (r["owner_faction"], r["owner_name"])
    return owners


class ClusterResourceEntry(PublicModel):
    cluster_id: str
    ware: str
    yield_level: str  # low | medium | high | veryhigh (best yield present in the cluster)


class BorderTensionEntry(PublicModel):
    from_sector_id: str
    to_sector_id: str
    from_forces: list[ConflictFaction]
    to_forces: list[ConflictFaction]
    intensity: float

class SectorForceEntry(PublicModel):
    sector_id: str
    fighter_count: int
    factions: list[ConflictFaction]
    sides: list[ConflictSide] | None = None

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


@router.get("/map/forces", response_model=list[SectorForceEntry])
def list_forces(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[SectorForceEntry]:
    """Return total fighter counts per sector and breakdown by faction."""
    has_ships = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ships'"
    ).fetchone())
    if not has_ships:
        return []

    breakdown_rows = conn.execute("""
        SELECT sh.sector_id, sh.owner_faction, COUNT(*) AS cnt, f.name AS faction_name
        FROM ships sh
        JOIN s.ships c ON c.ship_id = sh.macro
        LEFT JOIN s.factions f ON f.faction_id = sh.owner_faction
        WHERE c.role = 'fight'
          AND sh.owner_faction IS NOT NULL
          AND sh.sector_id IS NOT NULL
          AND (sh.state IS NULL OR sh.state = '')
        GROUP BY sh.sector_id, sh.owner_faction
        ORDER BY sh.sector_id, cnt DESC
    """).fetchall()

    from collections import defaultdict
    conflict_name_map = _faction_name_map(conn)
    by_sector: dict[str, list[ConflictFaction]] = defaultdict(list)
    totals: dict[str, int] = defaultdict(int)

    for sector, faction, cnt, fname in breakdown_rows:
        sector_id = sector.lower()
        totals[sector_id] += cnt
        by_sector[sector_id].append(ConflictFaction(
            faction_id=faction, 
            faction_name=conflict_name_map.get(faction, fname or faction), 
            fighter_count=cnt
        ))

    hostile_rows = conn.execute("SELECT faction_id, other_faction_id FROM faction_relations_current WHERE relation < -0.1").fetchall()
    hostile_set = set()
    for row in hostile_rows:
        hostile_set.add((row[0], row[1]))
        hostile_set.add((row[1], row[0]))

    results = []
    for sector_id, f_count in totals.items():
        factions = by_sector[sector_id]
        
        # group into sides
        sides: list[list[ConflictFaction]] = []
        for cf in factions:
            placed = False
            for side in sides:
                is_hostile = False
                for existing_cf in side:
                    if (cf.faction_id, existing_cf.faction_id) in hostile_set:
                        is_hostile = True
                        break
                if not is_hostile:
                    side.append(cf)
                    placed = True
                    break
            if not placed:
                sides.append([cf])
        
        conflict_sides = []
        for side_factions in sides:
            side_fcnt = sum(f.fighter_count for f in side_factions)
            conflict_sides.append(ConflictSide(factions=side_factions, fighter_count=side_fcnt))
        conflict_sides.sort(key=lambda s: -s.fighter_count)

        results.append(SectorForceEntry(
            sector_id=sector_id,
            fighter_count=f_count,
            factions=factions,
            sides=conflict_sides
        ))
    
    return results


@router.get("/map/conflicts", response_model=list[ConflictEntry])
def list_conflicts(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[ConflictEntry]:
    """Sectors with active fighter presence from mutually-hostile factions.

    Returns one row per sector with a conflict score.  ``intensity`` is
    0.0–1.0 normalized across all sectors; ``fighter_count`` is the raw
    number of combat-class ships from the hostile factions in that sector.
    Returns [] until a save is ingested.
    """
    has_ships = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ships'"
    ).fetchone())
    has_rels = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='faction_relations_current'"
    ).fetchone())
    if not has_ships or not has_rels:
        return []

    # Per-sector faction breakdown for hostile sectors
    # We include sector owners even if they have 0 ships, so an invasion is correctly registered.
    breakdown_rows = conn.execute("""
        WITH hostile_pairs AS (
            SELECT r.faction_id AS a, r.other_faction_id AS b
            FROM faction_relations_current r
            WHERE r.relation < -0.1
        ),
        sector_fighters AS (
            SELECT sh.sector_id, sh.owner_faction, COUNT(*) AS cnt
            FROM ships sh
            JOIN s.ships c ON c.ship_id = sh.macro
            WHERE c.role = 'fight'
              AND sh.owner_faction IS NOT NULL
              AND sh.sector_id IS NOT NULL
              AND (sh.state IS NULL OR sh.state = '')
            GROUP BY sh.sector_id, sh.owner_faction
        ),
        sector_owners AS (
            SELECT LOWER(st.sector_id) AS sector_id, st.owner_faction
            FROM stations st
            WHERE st.owner_faction IS NOT NULL AND st.sector_id IS NOT NULL
            GROUP BY LOWER(st.sector_id)
        ),
        sector_factions AS (
            SELECT sector_id, owner_faction, cnt FROM sector_fighters
            UNION ALL
            SELECT sector_id, owner_faction, 0 AS cnt FROM sector_owners
        ),
        merged_factions AS (
            SELECT LOWER(sector_id) AS sector_id, owner_faction, SUM(cnt) AS cnt
            FROM sector_factions
            GROUP BY LOWER(sector_id), owner_faction
        ),
        hostile_sectors AS (
            SELECT DISTINCT sf.sector_id
            FROM merged_factions sf
            WHERE EXISTS (
                SELECT 1 FROM merged_factions sf2
                JOIN hostile_pairs h ON (h.a = sf.owner_faction AND h.b = sf2.owner_faction)
                WHERE sf2.sector_id = sf.sector_id
            )
        )
        SELECT sf.sector_id, sf.owner_faction, sf.cnt,
               COALESCE(f.name, sf.owner_faction) AS faction_name,
               NULL AS sector_owner_name,
               NULL AS sector_owner_id
        FROM merged_factions sf
        LEFT JOIN s.factions f ON f.faction_id = sf.owner_faction
        WHERE sf.sector_id IN (SELECT sector_id FROM hostile_sectors)
        ORDER BY sf.sector_id, sf.cnt DESC
    """).fetchall()

    if not breakdown_rows:
        return []

    from collections import defaultdict
    by_sector: dict[str, dict[str, tuple[int, str]]] = defaultdict(dict)
    totals: dict[str, int] = defaultdict(int)
    sector_owners_map: dict[str, tuple[str | None, str | None]] = {}
    
    for sector, faction, cnt, fname, so_name, so_id in breakdown_rows:
        by_sector[sector][faction] = (cnt, fname)
        totals[sector] += cnt
        if sector not in sector_owners_map:
            sector_owners_map[sector] = (so_id, so_name)

    hostile_rows = conn.execute("SELECT faction_id, other_faction_id FROM faction_relations_current WHERE relation < -0.1").fetchall()
    hostile_set = set()
    for row in hostile_rows:
        hostile_set.add((row[0], row[1]))
        hostile_set.add((row[1], row[0]))

    max_count = max(totals.values()) if totals else 0
    
    name_map = _faction_name_map(conn)

    results = []
    for sector, factions in sorted(by_sector.items(), key=lambda x: -(totals[x[0]])):
        sorted_facs = sorted(factions.items(), key=lambda x: -(x[1][0]))
        
        sides: list[list[ConflictFaction]] = []
        for fid, (fcnt, fname) in sorted_facs:
            display_name = name_map.get(fid, fname)
            cf = ConflictFaction(faction_id=fid, faction_name=display_name, fighter_count=fcnt)
            placed = False
            for side in sides:
                is_hostile = False
                for existing_cf in side:
                    if (fid, existing_cf.faction_id) in hostile_set:
                        is_hostile = True
                        break
                if not is_hostile:
                    side.append(cf)
                    placed = True
                    break
            if not placed:
                sides.append([cf])
        
        conflict_sides = []
        for side_factions in sides:
            side_fcnt = sum(f.fighter_count for f in side_factions)
            conflict_sides.append(ConflictSide(factions=side_factions, fighter_count=side_fcnt))
            
        conflict_sides.sort(key=lambda s: -s.fighter_count)
        
        largest_side = conflict_sides[0] if len(conflict_sides) > 0 else None
        second_largest_side = conflict_sides[1] if len(conflict_sides) > 1 else None
        
        largest = largest_side.fighter_count if largest_side else 0
        second_largest = second_largest_side.fighter_count if second_largest_side else 0
        total_fighters = sum(s.fighter_count for s in conflict_sides)

        so_id, so_name = sector_owners_map.get(sector, (None, None))
        is_neutral = so_id is None or so_id == "ownerless"
        
        ctype = "skirmish"
        invader_name = None
        
        is_invasion = False
        if not is_neutral and largest_side:
            for f in largest_side.factions:
                if (f.faction_id, so_id) in hostile_set:
                    is_invasion = True
                    break

        if second_largest < 5:
            # The secondary force (the attackers, or defenders if overwhelmed) is tiny.
            # This is only a notable conflict if the LARGEST force is actively invading the sector.
            if not is_invasion or largest < 5:
                continue
                
            ctype = "invasion"
            invader_faction = max(largest_side.factions, key=lambda x: x.fighter_count)
            invader_name = invader_faction.faction_name
        else:
            # A real fight with at least 5 ships on both sides.
            if largest >= 10 and second_largest >= 10:
                ctype = "battle"
            else:
                ctype = "skirmish"

        # Intensity scales depending on the type of conflict.
        # For battles, the second_largest force dictates how "massive" it really is.
        # For invasions, the largest force dictates how severe the invasion is.
        # For skirmishes, it's just low intensity.
        if ctype == "battle":
            intensity = min(1.0, second_largest / 40.0)
        elif ctype == "invasion":
            intensity = min(1.0, largest / 100.0)
        else:
            intensity = min(1.0, total_fighters / 20.0)

        # Scale intensity to make sure skirmishes are low, battles are high.
        if ctype == "skirmish":
            intensity = 0.1 + intensity * 0.3 # 0.1 to 0.4
        elif ctype == "invasion":
            intensity = 0.4 + intensity * 0.4 # 0.4 to 0.8
        elif ctype == "battle":
            intensity = 0.6 + intensity * 0.4 # 0.6 to 1.0

        results.append(
            ConflictEntry(
                sector_id=sector,
                fighter_count=totals[sector],
                hostile_pair_count=len(factions),
                intensity=round(intensity, 4),
                type=ctype,
                invader_name=invader_name,
                sector_owner_name=so_name,
                factions=[ConflictFaction(faction_id=f, faction_name=fn, fighter_count=fc) for f, (fc, fn) in sorted_facs],
                sides=conflict_sides,
            )
        )
    
    # Re-sort results by intensity
    results.sort(key=lambda x: -x.intensity)
    return results


@router.get("/map/tensions", response_model=list[BorderTensionEntry])
def list_tensions(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[BorderTensionEntry]:
    """Sectors with amassing hostile forces on adjacent borders."""
    has_ships = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ships'"
    ).fetchone())
    has_rels = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='faction_relations_current'"
    ).fetchone())
    if not has_ships or not has_rels:
        return []

    breakdown_rows = conn.execute("""
        WITH sector_fighters AS (
            SELECT sh.sector_id, sh.owner_faction, COUNT(*) AS cnt
            FROM ships sh
            JOIN s.ships c ON c.ship_id = sh.macro
            WHERE c.role = 'fight'
              AND sh.owner_faction IS NOT NULL
              AND sh.sector_id IS NOT NULL
              AND (sh.state IS NULL OR sh.state = '')
            GROUP BY sh.sector_id, sh.owner_faction
        ),
        sector_owners AS (
            SELECT LOWER(st.sector_id) AS sector_id, st.owner_faction
            FROM stations st
            WHERE st.owner_faction IS NOT NULL AND st.sector_id IS NOT NULL
            GROUP BY LOWER(st.sector_id)
        ),
        sector_factions AS (
            SELECT sector_id, owner_faction, cnt FROM sector_fighters
            UNION ALL
            SELECT sector_id, owner_faction, 0 AS cnt FROM sector_owners
        ),
        merged_factions AS (
            SELECT LOWER(sector_id) AS sector_id, owner_faction, SUM(cnt) AS cnt
            FROM sector_factions
            GROUP BY LOWER(sector_id), owner_faction
        )
        SELECT mf.sector_id, mf.owner_faction, mf.cnt,
               COALESCE(f.name, mf.owner_faction) AS faction_name,
               NULL AS sector_owner_id
        FROM merged_factions mf
        LEFT JOIN s.factions f ON f.faction_id = mf.owner_faction
    """).fetchall()

    from collections import defaultdict
    forces_name_map = _faction_name_map(conn)
    sector_forces: dict[str, list[dict]] = defaultdict(list)
    sector_owners_map: dict[str, str | None] = {}
    
    for sector, faction, cnt, fname, so_id in breakdown_rows:
        sector_forces[sector].append({
            "faction_id": faction,
            "faction_name": forces_name_map.get(faction, fname),
            "cnt": cnt,
        })
        if sector not in sector_owners_map:
            sector_owners_map[sector] = so_id

    connections = conn.execute("""
        SELECT DISTINCT
            CASE WHEN z1.sector_id < z2.sector_id THEN z1.sector_id ELSE z2.sector_id END AS from_sector_id,
            CASE WHEN z1.sector_id < z2.sector_id THEN z2.sector_id ELSE z1.sector_id END AS to_sector_id
        FROM s.gates g
        JOIN s.zones z1 ON z1.zone_id = g.from_zone_id
        JOIN s.zones z2 ON z2.zone_id = g.to_zone_id
        WHERE z1.sector_id != z2.sector_id
        UNION
        SELECT DISTINCT
            CASE WHEN z1.sector_id < z2.sector_id THEN z1.sector_id ELSE z2.sector_id END AS from_sector_id,
            CASE WHEN z1.sector_id < z2.sector_id THEN z2.sector_id ELSE z1.sector_id END AS to_sector_id
        FROM s.superhighways sh
        JOIN s.zones z1 ON z1.zone_id = sh.from_zone_id
        JOIN s.zones z2 ON z2.zone_id = sh.to_zone_id
        WHERE z1.sector_id != z2.sector_id
    """).fetchall()

    hostile_rows = conn.execute("SELECT faction_id, other_faction_id FROM faction_relations_current WHERE relation < -0.1").fetchall()
    hostile_set = set()
    for f1, f2 in hostile_rows:
        hostile_set.add((f1, f2))
        hostile_set.add((f2, f1))

    results = []

    for c_from, c_to in connections:
        c_from = c_from.lower()
        c_to = c_to.lower()
        
        forces_a = sector_forces.get(c_from, [])
        forces_b = sector_forces.get(c_to, [])
        
        if not forces_a or not forces_b:
            continue

        owner_a = sector_owners_map.get(c_from)
        owner_b = sector_owners_map.get(c_to)

        hostile_in_a = set()
        hostile_in_b = set()
        
        for fa in forces_a:
            for fb in forces_b:
                if (fa["faction_id"], fb["faction_id"]) in hostile_set:
                    # Condition 1: Mutual standoff. Both sides have 10+ ships.
                    mutual_standoff = fa["cnt"] >= 10 and fb["cnt"] >= 10
                    
                    # Condition 2: Invasion threat. One side has 20+ ships and is hostile to the other side's SECTOR OWNER.
                    a_invading_b = fa["cnt"] >= 20 and owner_b and (fa["faction_id"], owner_b) in hostile_set
                    b_invading_a = fb["cnt"] >= 20 and owner_a and (fb["faction_id"], owner_a) in hostile_set
                    
                    if mutual_standoff or a_invading_b or b_invading_a:
                        hostile_in_a.add(fa["faction_id"])
                        hostile_in_b.add(fb["faction_id"])
                        
        if hostile_in_a and hostile_in_b:
            a_involved = [fa for fa in forces_a if fa["faction_id"] in hostile_in_a]
            b_involved = [fb for fb in forces_b if fb["faction_id"] in hostile_in_b]
            
            total_fighters = sum(fa["cnt"] for fa in a_involved) + sum(fb["cnt"] for fb in b_involved)
            intensity = min(1.0, total_fighters / 150.0)
            
            from_forces = [ConflictFaction(faction_id=f["faction_id"], faction_name=f["faction_name"], fighter_count=f["cnt"]) for f in a_involved]
            to_forces = [ConflictFaction(faction_id=f["faction_id"], faction_name=f["faction_name"], fighter_count=f["cnt"]) for f in b_involved]
            
            from_forces.sort(key=lambda x: -x.fighter_count)
            to_forces.sort(key=lambda x: -x.fighter_count)
            
            results.append(BorderTensionEntry(
                from_sector_id=c_from,
                to_sector_id=c_to,
                from_forces=from_forces,
                to_forces=to_forces,
                intensity=round(intensity, 4)
            ))
            
    results.sort(key=lambda x: -x.intensity)
    return results
