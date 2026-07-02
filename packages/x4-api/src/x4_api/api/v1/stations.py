"""REST endpoints for live stations from the active save's dynamic DB.

Distinct from `/npc-stations` (static gamestart placements): these are the stations as
they exist right now in the player's save, including player-built ones and live trade
offers. Empty until a save is ingested.

The list endpoint carries a per-station rollup (modules, workforce, build status, account)
from `station_overview` so the "My Stations" overview renders without N+1 calls; the
`/modules` and `/construction` sub-endpoints serve the detail. Build-material delivery
progress is not persisted in the save, so `/construction` derives the bill of materials
from static module recipes (see docs/save-structure.md).
"""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from x4_api.api.db_utils import fetch_one_or_404
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel
from x4_api.api.v1.map import _category_from_macro

router = APIRouter()


class LiveStation(PublicModel):
    station_id: str
    code: str | None
    name: str | None
    macro: str | None
    owner_faction: str | None
    sector_id: str | None
    # Function category derived from the macro (factory/shipyard/wharf/tradestation/…).
    category: str | None = None
    is_player_owned: bool
    is_under_construction: bool
    # Rollup from station_overview (None until a save with composition is ingested).
    build_pct: float | None = None
    module_count: int | None = None
    planned_module_count: int | None = None
    account_amount: int | None = None
    workforce_current: int | None = None
    workforce_capacity: int | None = None
    workforce_bonus: float | None = None
    production_product: str | None = None
    seed_id: str | None = None
    dynamic_tags: str | None = None
    known_to_player: bool
    basename: str | None = None
    nameindex: int | None = None


class StationOffer(PublicModel):
    ware_id: str
    side: str
    price: int
    quantity: int


class StationModule(PublicModel):
    module_id: str
    macro: str | None
    name: str | None
    kind: str | None
    size: str | None
    produces_ware_id: str | None
    count: int
    construction_pct: float | None = None


class BuildMaterial(PublicModel):
    ware_id: str
    name: str | None
    amount: int
    price_avg: int | None
    total: int | None


class PlannedModule(PublicModel):
    module_id: str
    macro: str | None
    name: str | None
    kind: str | None
    count: int


class StationConstruction(PublicModel):
    station_id: str
    is_under_construction: bool
    build_pct: float | None
    module_count: int | None
    planned_module_count: int | None
    planned_modules: list[PlannedModule]
    bill_of_materials: list[BuildMaterial]


class StationLayoutEntry(PublicModel):
    """One placed module of a station's construction sequence, with its parent link and
    station-frame position — enough to reconstruct the station in the dashboard builder.
    `module_id` is the macro (joins s.modules); `name`/`kind` are convenience joins.
    `predecessor_index` references another entry's `entry_index` (None for the root)."""

    entry_id: str
    entry_index: int | None
    predecessor_index: int | None
    module_id: str | None
    name: str | None
    kind: str | None
    pos_x: float | None
    pos_y: float | None
    pos_z: float | None


_LIST_COLS = (
    "st.station_id, st.code, st.name, st.macro, st.owner_faction, st.sector_id, "
    "st.is_player_owned, st.is_under_construction, st.build_pct, "
    "st.seed_id, st.dynamic_tags, st.known_to_player, st.basename, st.nameindex, "
    "ov.module_count, ov.planned_module_count, ov.account_amount, "
    "ov.workforce_current, ov.workforce_bonus, ov.production_product, "
    # Capacity = sum of static workforce_capacity over installed modules (for utilisation %).
    "(SELECT SUM(m.workforce_capacity * sm.count) FROM station_modules sm "
    " JOIN s.modules m ON m.module_id = sm.module_id "
    " WHERE sm.station_id = st.station_id) AS workforce_capacity"
)


def _row_to_station(r: sqlite3.Row) -> LiveStation:
    d = dict(r)
    return LiveStation(category=_category_from_macro(d.get("macro")), **d)


@router.get("/stations", response_model=list[LiveStation])
def list_stations(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    owner: str | None = Query(None, description="Filter by owning faction id"),
    sector: str | None = Query(None, description="Filter by sector macro id"),
    player_only: bool = Query(False, description="Only player-owned stations"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[LiveStation]:
    """Live stations, newest snapshot. Returns [] until a save is ingested."""
    sql = [
        f"SELECT {_LIST_COLS} FROM stations st "
        "LEFT JOIN station_overview ov ON ov.station_id = st.station_id WHERE 1=1"
    ]
    params: dict[str, object] = {}
    if owner is not None:
        sql.append("AND st.owner_faction = :owner")
        params["owner"] = owner
    if sector is not None:
        sql.append("AND st.sector_id = :sector")
        params["sector"] = sector
    if player_only:
        sql.append("AND st.is_player_owned = 1")
    sql.append("ORDER BY st.station_id LIMIT :limit OFFSET :offset")
    params["limit"] = limit
    params["offset"] = offset
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [_row_to_station(r) for r in rows]


def _require_station(conn: sqlite3.Connection, station_id: str) -> sqlite3.Row:
    return fetch_one_or_404(
        conn,
        "SELECT station_id, is_under_construction, build_pct FROM stations WHERE station_id = :id",
        {"id": station_id},
        f"Unknown station_id: {station_id}",
    )


@router.get("/stations/{station_id}/offers", response_model=list[StationOffer])
def station_offers(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[StationOffer]:
    """Current buy/sell offers at a station. 404 if the station is not in the save."""
    _require_station(conn, station_id)
    rows = conn.execute(
        "SELECT ware_id, side, price, quantity FROM station_offers "
        "WHERE station_id = :id ORDER BY side, ware_id",
        {"id": station_id},
    ).fetchall()
    return [StationOffer(**dict(r)) for r in rows]


@router.get("/stations/{station_id}/modules", response_model=list[StationModule])
def station_modules(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[StationModule]:
    """Installed modules at a station, with static name/kind/size joined. 404 if unknown."""
    _require_station(conn, station_id)
    rows = conn.execute(
        """
        SELECT sm.module_id, sm.macro, sm.count, sm.construction_pct,
               m.name, m.kind, m.size, m.produces_ware_id
        FROM station_modules sm
        LEFT JOIN s.modules m ON m.module_id = sm.module_id
        WHERE sm.station_id = :id
        ORDER BY m.kind, m.name, sm.macro
        """,
        {"id": station_id},
    ).fetchall()
    return [StationModule(**dict(r)) for r in rows]


@router.get("/stations/{station_id}/construction", response_model=StationConstruction)
def station_construction(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> StationConstruction:
    """Build status + planned modules + bill of materials (from static recipes).

    The save does not persist build-material delivery progress, so the bill of materials is
    the total resource cost of the planned modules (no live "delivered" figure).
    """
    st = _require_station(conn, station_id)
    ov = conn.execute(
        "SELECT module_count, planned_module_count FROM station_overview WHERE station_id = :id",
        {"id": station_id},
    ).fetchone()

    planned = conn.execute(
        """
        SELECT bp.module_id, bp.macro, bp.count, m.name, m.kind
        FROM station_build_plan bp
        LEFT JOIN s.modules m ON m.module_id = bp.module_id
        WHERE bp.station_id = :id
        ORDER BY bp.count DESC, m.name
        """,
        {"id": station_id},
    ).fetchall()

    # Bill of materials: sum each planned module's construction inputs x its count. Module
    # build recipes hang off the module's ware via wares.component_ref → ware_inputs.
    bom = conn.execute(
        """
        SELECT wi.input_ware_id AS ware_id, wr.name,
               SUM(wi.amount * bp.count) AS amount,
               wr.price_avg,
               SUM(wi.amount * bp.count * wr.price_avg) AS total
        FROM station_build_plan bp
        JOIN s.wares w ON w.component_ref = bp.module_id
        JOIN s.ware_inputs wi ON wi.ware_id = w.ware_id
        JOIN s.wares wr ON wr.ware_id = wi.input_ware_id
        WHERE bp.station_id = :id
        GROUP BY wi.input_ware_id, wr.name, wr.price_avg
        ORDER BY total DESC
        """,
        {"id": station_id},
    ).fetchall()

    return StationConstruction(
        station_id=station_id,
        is_under_construction=bool(st["is_under_construction"]),
        build_pct=st["build_pct"],
        module_count=ov["module_count"] if ov else None,
        planned_module_count=ov["planned_module_count"] if ov else None,
        planned_modules=[PlannedModule(**dict(r)) for r in planned],
        bill_of_materials=[BuildMaterial(**dict(r)) for r in bom],
    )


@router.get("/stations/{station_id}/layout", response_model=list[StationLayoutEntry])
def station_layout(
    station_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[StationLayoutEntry]:
    """The placed-module graph (identity + parent link + position) of a station's construction
    sequence — the source for importing an existing station into the builder. Empty list if the
    station has no captured layout (e.g. ingested before this data existed); 404 if unknown.
    """
    _require_station(conn, station_id)
    rows = conn.execute(
        """
        SELECT ce.entry_id, ce.entry_index, ce.predecessor_index, ce.macro AS module_id,
               ce.pos_x, ce.pos_y, ce.pos_z, m.name, m.kind
        FROM station_construction_entries ce
        LEFT JOIN s.modules m ON m.module_id = ce.macro
        WHERE ce.station_id = :id
        ORDER BY ce.entry_index
        """,
        {"id": station_id},
    ).fetchall()
    return [StationLayoutEntry(**dict(r)) for r in rows]
