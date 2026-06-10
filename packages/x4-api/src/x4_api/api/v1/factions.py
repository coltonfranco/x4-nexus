"""REST endpoints for game factions."""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from x4_api.api.deps import get_db
from x4_api.api.icons import get_icon_url
from x4_api.api.schemas import PublicModel

router = APIRouter()


class FactionSummary(PublicModel):
    faction_id: str
    name: str
    color_hex: str | None
    short_name: str | None = None
    prefix_name: str | None = None
    space_name: str | None = None
    home_space_name: str | None = None
    police_faction: str | None = None
    icon_active: str | None = None
    icon_inactive: str | None = None
    icon_banner: str | None = None
    icon_url: str | None = None


class FactionDetail(FactionSummary):
    primary_race: str | None
    description: str | None = None
    behaviour_set: str | None = None
    tags: str | None = None


class FactionRelation(PublicModel):
    other_faction_id: str
    initial_relation: float
    current_relation: float | None = None  # from the active save; None until ingested


class AllFactionRelation(PublicModel):
    faction_id: str
    other_faction_id: str
    initial_relation: float
    current_relation: float | None = None  # from the active save; None until ingested


class FactionLicence(PublicModel):
    licence_type: str
    faction_id: str
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    precursor: str | None = None
    price: int | None = None
    min_relation: float | None = None


@router.get("/faction-relations", response_model=list[AllFactionRelation])
def list_all_faction_relations(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[AllFactionRelation]:
    """Every faction-to-faction relation: gamestart value + current (from the active save).

    `current_relation` is NULL until a save is ingested; the same -1..1 scale as
    `initial_relation`, so the UI can show drift or COALESCE to the effective value.
    """
    rows = conn.execute(
        "SELECT s.faction_id, s.other_faction_id, s.initial_relation, "
        "       d.relation AS current_relation "
        "FROM seed.faction_relations s "
        "LEFT JOIN faction_relations_current d "
        "  ON d.faction_id = s.faction_id AND d.other_faction_id = s.other_faction_id "
        "ORDER BY s.faction_id, s.other_faction_id"
    ).fetchall()
    return [AllFactionRelation(**dict(r)) for r in rows]


@router.get("/factions", response_model=list[FactionSummary])
def list_factions(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[FactionSummary]:
    """List all factions in the game catalog."""
    rows = conn.execute(
        "SELECT faction_id, name, color_hex, short_name, prefix_name, space_name, home_space_name, "
        "police_faction, icon_active, icon_inactive, icon_banner FROM s.factions ORDER BY faction_id"
    ).fetchall()

    out = []
    for r in rows:
        d = dict(r)
        d["icon_url"] = get_icon_url(d.get("icon_active"))
        out.append(FactionSummary(**d))
    return out


class FactionStrength(PublicModel):
    faction_id: str
    name: str
    color_hex: str | None
    # Normalized 0-100 scores (best faction in each category = 100)
    military_score: float
    economic_score: float
    diplomatic_score: float   # absolute: avg_relation mapped -1..1 → 0..100
    territory_score: float
    # Raw detail fields
    fight_ship_count: int
    trade_ship_count: int
    mine_ship_count: int
    military_station_count: int   # defence + shipyard + wharf
    economic_station_count: int   # trade stations, equipment docks, factories, etc.
    sector_count: int
    cluster_count: int            # distinct clusters with at least one owned sector
    avg_relation: float           # game-scale -30..30


_SKIP_FACTIONS = frozenset({"player", "visitor", "ownerless"})
_CLASS_MULT = {"s": 1, "m": 2, "l": 4, "xl": 8, "xs": 1}
_ECON_MULT  = {"s": 1, "m": 2, "l": 3, "xl": 4, "xs": 1}
# Tags that indicate a military installation; everything else is economic
_MIL_TAGS = ("defence", "shipyard", "wharf")


@router.get("/factions/strength", response_model=list[FactionStrength])
def faction_strength(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[FactionStrength]:
    """Relative strength metrics for all non-legacy factions, normalized 0-100."""
    factions_q = conn.execute(
        "SELECT faction_id, name, color_hex FROM s.factions WHERE is_legacy = 0 ORDER BY name"
    ).fetchall()

    # Military: combat ships weighted by class size
    mil_rows = conn.execute("""
        SELECT faction_id, class_id, COUNT(*) as cnt
        FROM s.ships WHERE role = 'fight' AND faction_id IS NOT NULL
        GROUP BY faction_id, class_id
    """).fetchall()

    # Economic: trade + mining ships weighted by class size
    econ_ship_rows = conn.execute("""
        SELECT faction_id, role, class_id, COUNT(*) as cnt
        FROM s.ships WHERE role IN ('trade', 'mine', 'build', 'auxiliary')
          AND faction_id IS NOT NULL
        GROUP BY faction_id, role, class_id
    """).fetchall()

    # Stations split by type: military (defence/shipyard/wharf) vs economic (everything else)
    # tags column is a JSON array e.g. '["defence"]' or '["shipyard","wharf"]'
    # NPC station placements + sector/cluster ownership are gamestart seed (seed.db).
    station_rows = conn.execute("""
        SELECT owner_faction,
            SUM(CASE WHEN tags LIKE '%defence%'
                       OR tags LIKE '%shipyard%'
                       OR tags LIKE '%wharf%'
                     THEN 1 ELSE 0 END) as mil_cnt,
            SUM(CASE WHEN NOT (tags LIKE '%defence%'
                               OR tags LIKE '%shipyard%'
                               OR tags LIKE '%wharf%')
                     THEN 1 ELSE 0 END) as econ_cnt
        FROM seed.npc_stations
        WHERE owner_faction IS NOT NULL
        GROUP BY owner_faction
    """).fetchall()

    sector_rows = conn.execute("""
        SELECT so.owner_faction, COUNT(*) as cnt,
               COALESCE(AVG(sec.economy), 0.5) as avg_econ
        FROM seed.sector_ownership so
        JOIN s.sectors sec ON sec.sector_id = so.sector_id
        GROUP BY so.owner_faction
    """).fetchall()

    cluster_rows = conn.execute("""
        SELECT owner_faction, COUNT(*) as cnt
        FROM seed.cluster_ownership
        GROUP BY owner_faction
    """).fetchall()

    relation_rows = conn.execute("""
        SELECT faction_id, AVG(initial_relation) as avg_rel
        FROM seed.faction_relations
        GROUP BY faction_id
    """).fetchall()

    # Build lookups
    mil_weighted: dict[str, float] = {}
    fight_counts: dict[str, int] = {}
    for r in mil_rows:
        mult = _CLASS_MULT.get(r["class_id"] or "", 1)
        fid = r["faction_id"]
        mil_weighted[fid] = mil_weighted.get(fid, 0.0) + r["cnt"] * mult
        fight_counts[fid] = fight_counts.get(fid, 0) + r["cnt"]

    econ_ship_weighted: dict[str, float] = {}
    trade_counts: dict[str, int] = {}
    mine_counts: dict[str, int] = {}
    for r in econ_ship_rows:
        mult = _ECON_MULT.get(r["class_id"] or "", 1)
        fid = r["faction_id"]
        econ_ship_weighted[fid] = econ_ship_weighted.get(fid, 0.0) + r["cnt"] * mult
        if r["role"] == "trade":
            trade_counts[fid] = trade_counts.get(fid, 0) + r["cnt"]
        elif r["role"] == "mine":
            mine_counts[fid] = mine_counts.get(fid, 0) + r["cnt"]

    mil_stations: dict[str, int]  = {r["owner_faction"]: int(r["mil_cnt"] or 0)  for r in station_rows}
    econ_stations: dict[str, int] = {r["owner_faction"]: int(r["econ_cnt"] or 0) for r in station_rows}
    sectors: dict[str, dict] = {r["owner_faction"]: dict(r) for r in sector_rows}
    clusters: dict[str, int] = {r["owner_faction"]: r["cnt"] for r in cluster_rows}
    relations: dict[str, float] = {r["faction_id"]: float(r["avg_rel"]) for r in relation_rows}

    rows: list[dict] = []
    for f in factions_q:
        fid = f["faction_id"]
        if fid in _SKIP_FACTIONS:
            continue

        sec = sectors.get(fid, {})
        sec_cnt: int = sec.get("cnt", 0)
        avg_rel = relations.get(fid, -1.0)

        # Military: combat ships (class-weighted) + military stations
        #   Ship weights: s=1, m=2, l=4, xl=8
        #   Military station ≈ 6 pts (a defence outpost ~= a large warship; shipyard/wharf bigger)
        mil_raw = mil_weighted.get(fid, 0.0) + mil_stations.get(fid, 0) * 6.0

        # Economic: trade/mine ships (class-weighted × 0.8) + economic stations (3 pts each)
        #   + sector economy rating (sector_count × avg_economy × 5)
        #   Ship weights: s=1, m=2, l=3, xl=4
        econ_raw = (
            econ_stations.get(fid, 0) * 3.0
            + sec_cnt * sec.get("avg_econ", 0.5) * 5.0
            + econ_ship_weighted.get(fid, 0.0) * 0.8
        )

        territory_raw = float(sec_cnt + clusters.get(fid, 0) * 2)
        # Diplomatic: map avg_relation [-1, 1] → [0, 100] (absolute scale, not normalized)
        diplo_score = round((avg_rel + 1.0) / 2.0 * 100.0, 1)

        rows.append({
            "faction_id": fid,
            "name": f["name"],
            "color_hex": f["color_hex"],
            "military_raw": mil_raw,
            "economic_raw": econ_raw,
            "territory_raw": territory_raw,
            "diplomatic_score": diplo_score,
            "fight_ship_count": fight_counts.get(fid, 0),
            "trade_ship_count": trade_counts.get(fid, 0),
            "mine_ship_count": mine_counts.get(fid, 0),
            "military_station_count": mil_stations.get(fid, 0),
            "economic_station_count": econ_stations.get(fid, 0),
            "sector_count": sec_cnt,
            "cluster_count": clusters.get(fid, 0),
            "avg_relation": round(avg_rel * 30.0, 1),  # game-scale -30..30
        })

    # Normalize military, economic, territory relative to the strongest faction
    for metric in ("military_raw", "economic_raw", "territory_raw"):
        max_val = max((r[metric] for r in rows), default=1.0) or 1.0
        score_key = metric.replace("_raw", "_score")
        for r in rows:
            r[score_key] = round(r[metric] / max_val * 100.0, 1)

    return [
        FactionStrength(**{k: v for k, v in r.items() if not k.endswith("_raw")})
        for r in rows
    ]


@router.get("/factions/{faction_id}", response_model=FactionDetail)
def get_faction(
    faction_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> FactionDetail:
    """Get detailed information for a specific faction."""
    row = conn.execute(
        "SELECT faction_id, name, color_hex, primary_race, short_name, prefix_name, "
        "space_name, home_space_name, police_faction, icon_active, icon_inactive, icon_banner, "
        "description, behaviour_set, tags "
        "FROM s.factions WHERE faction_id = :id",
        {"id": faction_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown faction_id: {faction_id}")
    
    d = dict(row)
    d["icon_url"] = get_icon_url(d.get("icon_active"))
    return FactionDetail(**d)


@router.get("/factions/{faction_id}/relations", response_model=list[FactionRelation])
def list_faction_relations(
    faction_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[FactionRelation]:
    """Diplomatic relations for a faction: gamestart value + current (from active save)."""
    row = conn.execute("SELECT 1 FROM s.factions WHERE faction_id = :id", {"id": faction_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown faction_id: {faction_id}")
    rows = conn.execute(
        "SELECT s.other_faction_id, s.initial_relation, d.relation AS current_relation "
        "FROM seed.faction_relations s "
        "LEFT JOIN faction_relations_current d "
        "  ON d.faction_id = s.faction_id AND d.other_faction_id = s.other_faction_id "
        "WHERE s.faction_id = :id ORDER BY s.other_faction_id",
        {"id": faction_id},
    ).fetchall()
    return [FactionRelation(**dict(r)) for r in rows]

@router.get("/licences", response_model=list[FactionLicence])
def list_licences(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    faction_id: str | None = None,
) -> list[FactionLicence]:
    """List all faction licences, optionally filtered by faction_id."""
    sql = ["SELECT licence_type, faction_id, name, description, icon, precursor, price, min_relation FROM s.faction_licences WHERE 1=1"]
    params: dict[str, object] = {}
    if faction_id is not None:
        sql.append("AND faction_id = :faction_id")
        params["faction_id"] = faction_id
    sql.append("ORDER BY faction_id, licence_type")
    
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [FactionLicence(**dict(r)) for r in rows]
