"""REST endpoints for game factions."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Any

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
    """Every faction-to-faction relation from the active save. Returns [] until a save is ingested."""
    rows = conn.execute(
        "SELECT c.faction_id, c.other_faction_id, c.relation AS initial_relation, "
        "       c.relation AS current_relation "
        "FROM faction_relations_current c "
        "ORDER BY c.faction_id, c.other_faction_id"
    ).fetchall()
    return [AllFactionRelation(**dict(r)) for r in rows]


@router.get("/factions", response_model=list[FactionSummary])
def list_factions(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[FactionSummary]:
    """List all factions in the game catalog."""
    rows = conn.execute(
        "SELECT faction_id, name, color_hex, short_name, prefix_name, space_name, home_space_name, "
        "police_faction, icon_active, icon_inactive, icon_banner FROM s.factions "
        "WHERE faction_id NOT IN ('ownerless', 'visitor') "
        "ORDER BY faction_id"
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


# Player is included so it ranks alongside AI factions; only structural placeholders skipped.
_SKIP_FACTIONS = frozenset({"visitor", "ownerless"})
_CLASS_MULT = {"s": 1, "m": 2, "l": 4, "xl": 8, "xs": 1}
_ECON_MULT  = {"s": 1, "m": 2, "l": 3, "xl": 4, "xs": 1}


@router.get("/factions/strength", response_model=list[FactionStrength])
def faction_strength(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[FactionStrength]:
    """Relative strength metrics, normalized 0-100, computed from LIVE save state.

    Everything here is the *current* universe (dynamic ships/stations/relations) so the
    standings reflect how the game has actually unfolded — seed/static is init state only
    and is not referenced once a save is loaded. The player is ranked alongside AI factions.
    """
    factions_q = conn.execute(
        "SELECT faction_id, name, color_hex FROM s.factions WHERE is_legacy = 0 ORDER BY name"
    ).fetchall()

    # Military: live combat ships, class-weighted (role/class come from the catalog via macro).
    mil_rows = conn.execute("""
        SELECT sh.owner_faction AS faction_id, c.class_id, COUNT(*) AS cnt
        FROM ships sh JOIN s.ships c ON c.ship_id = sh.macro
        WHERE c.role = 'fight' AND sh.owner_faction IS NOT NULL
        GROUP BY sh.owner_faction, c.class_id
    """).fetchall()

    # Economic ships: live trade/mine/build/auxiliary, class-weighted.
    econ_ship_rows = conn.execute("""
        SELECT sh.owner_faction AS faction_id, c.role, c.class_id, COUNT(*) AS cnt
        FROM ships sh JOIN s.ships c ON c.ship_id = sh.macro
        WHERE c.role IN ('trade','mine','build','auxiliary') AND sh.owner_faction IS NOT NULL
        GROUP BY sh.owner_faction, c.role, c.class_id
    """).fetchall()

    # Live stations owned + territory (distinct sectors/clusters with an owned station).
    territory_rows = conn.execute("""
        SELECT st.owner_faction AS faction_id,
               COUNT(*) AS stations,
               COUNT(DISTINCT st.sector_id) AS sectors,
               COUNT(DISTINCT sec.cluster_id) AS clusters,
               COALESCE(AVG(sec.economy), 0.5) AS avg_econ
        FROM stations st
        LEFT JOIN s.sectors sec ON LOWER(sec.sector_id) = LOWER(st.sector_id)
        WHERE st.owner_faction IS NOT NULL
        GROUP BY st.owner_faction
    """).fetchall()

    # Diplomatic: live current relations.
    relation_rows = conn.execute("""
        SELECT faction_id, AVG(relation) AS avg_rel
        FROM faction_relations_current GROUP BY faction_id
    """).fetchall()

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

    territory: dict[str, Any] = {r["faction_id"]: dict(r) for r in territory_rows}
    relations: dict[str, float] = {r["faction_id"]: float(r["avg_rel"]) for r in relation_rows}

    rows: list[dict[str, Any]] = []
    for f in factions_q:
        fid = f["faction_id"]
        if fid in _SKIP_FACTIONS:
            continue

        terr = territory.get(fid, {})
        sec_cnt = int(terr.get("sectors", 0) or 0)
        clus_cnt = int(terr.get("clusters", 0) or 0)
        station_cnt = int(terr.get("stations", 0) or 0)
        avg_econ = float(terr.get("avg_econ", 0.5) or 0.5)
        avg_rel = relations.get(fid, -1.0)

        # Military: live combat ships, class-weighted (s=1, m=2, l=4, xl=8).
        mil_raw = mil_weighted.get(fid, 0.0)
        # Economic: econ ships (x0.8) + live stations (3 pts) + sector economy rating.
        econ_raw = (
            station_cnt * 3.0
            + sec_cnt * avg_econ * 5.0
            + econ_ship_weighted.get(fid, 0.0) * 0.8
        )
        territory_raw = float(sec_cnt + clus_cnt * 2)
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
            "military_station_count": 0,  # live station type-classification is a fast-follow
            "economic_station_count": station_cnt,
            "sector_count": sec_cnt,
            "cluster_count": clus_cnt,
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


@router.get("/factions/known", response_model=dict[str, bool])
def list_known_factions(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> dict[str, bool]:
    """Return {faction_id: is_known} for every static faction."""
    all_factions = {
        r["faction_id"]
        for r in conn.execute("SELECT faction_id FROM s.factions WHERE faction_id NOT IN ('ownerless', 'visitor')").fetchall()
    }
    known: set[str] = {"player"}

    has_live = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='faction_relations_current'"
    ).fetchone())
    if has_live:
        known.update(
            r["other_faction_id"]
            for r in conn.execute(
                "SELECT other_faction_id FROM faction_relations_current WHERE faction_id = 'player'"
            ).fetchall()
        )

    has_stations = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='stations'"
    ).fetchone())
    if has_stations:
        known.update(
            r["owner_faction"]
            for r in conn.execute(
                "SELECT DISTINCT owner_faction FROM stations WHERE known_to_player = 1 AND owner_faction IS NOT NULL"
            ).fetchall()
        )

    has_ss = bool(conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='sector_state'"
    ).fetchone())
    if has_ss and has_stations:
        known.update(
            r["owner_faction"]
            for r in conn.execute(
                "SELECT DISTINCT st.owner_faction FROM stations st "
                "JOIN sector_state ss ON LOWER(ss.sector_id) = LOWER(st.sector_id) "
                "WHERE ss.known_to_player = 1 AND st.owner_faction IS NOT NULL"
            ).fetchall()
        )

    return {fid: fid in known for fid in sorted(all_factions)}


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
    """Diplomatic relations for a faction from the active save. Returns [] until a save is ingested."""
    row = conn.execute("SELECT 1 FROM s.factions WHERE faction_id = :id", {"id": faction_id}).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown faction_id: {faction_id}")
    rows = conn.execute(
        "SELECT c.other_faction_id, c.relation AS initial_relation, c.relation AS current_relation "
        "FROM faction_relations_current c "
        "WHERE c.faction_id = :id ORDER BY c.other_faction_id",
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
