"""Map topology endpoints.

Exposes clusters, sectors, and gates.
"""

from __future__ import annotations

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


@router.get("/map/clusters", response_model=list[ClusterSummary])
def list_clusters(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner_faction: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ClusterSummary]:
    sql = [
        "SELECT cluster_id, name AS macro_id, dlc, name_id AS name, description_id AS description, owner_faction, environment, sun_class, population_id, max_population, x, y, z, qx, qy, qz, qw",
        "FROM s.clusters WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if owner_faction is not None:
        sql.append("AND owner_faction = :owner_faction")
        params["owner_faction"] = owner_faction
    sql.append("ORDER BY cluster_id LIMIT :limit OFFSET :offset")

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
    sql = [
        "SELECT sector_id, cluster_id, name AS macro_id, owner_faction, dlc, name_id AS name, description_id AS description, sunlight, economy, security, tags, access_licence, x, y, z, qx, qy, qz, qw "
        "FROM s.sectors WHERE 1=1"
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if cluster_id is not None:
        sql.append("AND cluster_id = :cluster_id")
        params["cluster_id"] = cluster_id
    if owner_faction is not None:
        sql.append("AND owner_faction = :owner_faction")
        params["owner_faction"] = owner_faction
    sql.append("ORDER BY sector_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [SectorSummary(**dict(r)) for r in rows]


@router.get("/map/sectors/{sector_id}", response_model=SectorSummary)
def get_sector(
    sector_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> SectorSummary:
    row = conn.execute(
        "SELECT sector_id, cluster_id, name AS macro_id, owner_faction, dlc, name_id AS name, description_id AS description, sunlight, economy, security, tags, access_licence, x, y, z, qx, qy, qz, qw "
        "FROM s.sectors WHERE sector_id = :id",
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
        "SELECT from_zone_id, to_zone_id FROM s.superhighways ORDER BY from_zone_id, to_zone_id LIMIT :limit OFFSET :offset",
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
            'highway' AS kind
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
            'highway' AS kind
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
