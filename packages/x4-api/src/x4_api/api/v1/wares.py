"""Ware catalog + production chain endpoints.

EXEMPLAR endpoint: response models for both list and detail, query parameters with
defaults, joins across `s.wares` (static) and `ware_inputs` (static). No save data
required — this endpoint works as soon as `rebuild-static` has run.

Add new public endpoints in the same shape:
    1. PublicModel subclasses at module top
    2. Router with a clear prefix-relative path
    3. SQL kept in the handler if simple, factored out to a helper if reused
    4. Empty result → empty list, never 404 for collection endpoints
"""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.icons import get_icon_url
from x4_api.api.schemas import PublicModel
from x4_api.domain.ware_class import CATEGORIES, CATEGORY_SQL

router = APIRouter()

ICON_BASE = "/static/icons"

# Whether a ware has any production method / can be obtained from a drop list.
# Drives which detail tabs the dashboard shows, so empty tabs never render.
_FLAGS_SQL = (
    "EXISTS(SELECT 1 FROM s.ware_production p WHERE p.ware_id = w.ware_id) AS has_production, "
    "EXISTS(SELECT 1 FROM s.drop_list_wares d WHERE d.ware_id = w.ware_id) AS has_drops"
)


class WareSummary(PublicModel):
    ware_id: str
    name: str
    group_id: str | None
    category: str
    transport: str | None
    volume: float
    price_min: int | None
    price_avg: int | None
    price_max: int | None
    tags: str | None
    icon_url: str | None
    has_production: bool
    has_drops: bool
    shortname: str | None = None
    description: str | None = None
    sortorder: int | None = None
    dismantlefactor: float | None = None
    research_time: int | None = None


class ProductionInput(PublicModel):
    ware_id: str
    amount: int


class ProductionMethod(PublicModel):
    method: str
    time_sec: float
    amount: int
    workforce: int | None
    inputs: list[ProductionInput]


class WareDetail(WareSummary):
    storage_class: str | None
    restriction_licence: str | None = None
    use_threshold: float | None = None
    owners: list[str]
    illegal_factions: list[str]
    production: list[ProductionMethod]


# ── Live price enrichment (from dynamic station_offers, when available) ─────────

def _market_price_sql(conn: sqlite3.Connection) -> tuple[str, bool]:
    """Return (sql_fragment, has_live_data) for enriching static prices with market data.

    When the active save has been ingested, station_offers carries real buy/sell prices
    from every station.  We LEFT JOIN per-ware MIN/AVG/MAX so the catalog reflects the
    live economy.  When no save is active (or the table doesn't exist yet) the static
    reference prices are used as-is.
    """
    has_offers = bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='station_offers'"
        ).fetchone()
    )
    if not has_offers:
        return ("price_min, price_avg, price_max", False)

    return (
        "COALESCE(m.market_min, w.price_min)  AS price_min, "
        "COALESCE(m.market_avg, w.price_avg)  AS price_avg, "
        "COALESCE(m.market_max, w.price_max)  AS price_max",
        True,
    )


def _market_join_sql() -> str:
    """Subquery that computes live price ranges per ware from station trade offers."""
    return (
        "LEFT JOIN ("
        "  SELECT ware_id,"
        "         CAST(MIN(price) AS INTEGER) AS market_min,"
        "         CAST(AVG(price) AS INTEGER) AS market_avg,"
        "         CAST(MAX(price) AS INTEGER) AS market_max"
        "  FROM station_offers"
        "  GROUP BY ware_id"
        ") m ON w.ware_id = m.ware_id"
    )


@router.get("/wares", response_model=list[WareSummary])
def list_wares(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    group: str | None = Query(None),
    transport: str | None = Query(None),
    category: str | None = Query(
        None, description=f"Filter by computed bucket: {', '.join(CATEGORIES)}"
    ),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[WareSummary]:
    if category is not None and category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Unknown category: {category}")

    price_sql, has_live = _market_price_sql(conn)

    sql = [
        f"SELECT w.ware_id, w.name, w.shortname, w.description, w.group_id,"
        f"       ({CATEGORY_SQL}) AS category, w.transport, w.volume,",
        f"       {price_sql},",
        "       w.tags, w.icon_path,",
        "       w.sortorder, w.dismantlefactor, w.research_time,",
        f"       {_FLAGS_SQL}",
        "FROM s.wares w",
    ]
    if has_live:
        sql.append(_market_join_sql())
    sql.append("WHERE 1=1")

    params: dict[str, object] = {"limit": limit, "offset": offset}
    if group is not None:
        sql.append("AND w.group_id = :group")
        params["group"] = group
    if transport is not None:
        sql.append("AND w.transport = :transport")
        params["transport"] = transport
    if category is not None:
        sql.append(f"AND ({CATEGORY_SQL}) = :category")
        params["category"] = category
    sql.append("ORDER BY w.ware_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [
        WareSummary(
            ware_id=r["ware_id"],
            name=r["name"],
            shortname=r["shortname"],
            description=r["description"],
            group_id=r["group_id"],
            category=r["category"],
            transport=r["transport"],
            volume=r["volume"],
            price_min=r["price_min"],
            price_avg=r["price_avg"],
            price_max=r["price_max"],
            tags=r["tags"],
            icon_url=get_icon_url(r["icon_path"]),
            sortorder=r["sortorder"],
            dismantlefactor=r["dismantlefactor"],
            research_time=r["research_time"],
            has_production=bool(r["has_production"]),
            has_drops=bool(r["has_drops"]),
        )
        for r in rows
    ]


@router.get("/wares/{ware_id}", response_model=WareDetail)
def get_ware(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> WareDetail:
    price_sql, has_live = _market_price_sql(conn)
    join_clause = _market_join_sql() if has_live else ""

    row = conn.execute(
        f"""
        SELECT w.ware_id, w.name, w.shortname, w.description, w.group_id,
               ({CATEGORY_SQL}) AS category, w.transport, w.volume,
               {price_sql}, w.storage_class,
               w.tags, w.restriction_licence, w.use_threshold, w.icon_path,
               w.sortorder, w.dismantlefactor, w.research_time,
               {_FLAGS_SQL}
        FROM s.wares w
        {join_clause}
        WHERE w.ware_id = :id
        """,
        {"id": ware_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown ware_id: {ware_id}")

    owner_rows = conn.execute(
        "SELECT faction_id FROM s.ware_owners WHERE ware_id = :id ORDER BY faction_id",
        {"id": ware_id},
    ).fetchall()
    illegal_rows = conn.execute(
        "SELECT faction_id FROM s.ware_illegal WHERE ware_id = :id ORDER BY faction_id",
        {"id": ware_id},
    ).fetchall()
    prod_rows = conn.execute(
        "SELECT method, time_sec, amount, workforce FROM s.ware_production WHERE ware_id = :id",
        {"id": ware_id},
    ).fetchall()
    input_rows = conn.execute(
        "SELECT method, input_ware_id, amount FROM s.ware_inputs WHERE ware_id = :id",
        {"id": ware_id},
    ).fetchall()

    inputs_by_method: dict[str, list[ProductionInput]] = {}
    for ir in input_rows:
        inputs_by_method.setdefault(ir["method"], []).append(
            ProductionInput(ware_id=ir["input_ware_id"], amount=ir["amount"])
        )

    return WareDetail(
        ware_id=row["ware_id"],
        name=row["name"],
        shortname=row["shortname"],
        description=row["description"],
        group_id=row["group_id"],
        category=row["category"],
        transport=row["transport"],
        volume=row["volume"],
        price_min=row["price_min"],
        price_avg=row["price_avg"],
        price_max=row["price_max"],
        storage_class=row["storage_class"],
        tags=row["tags"],
        restriction_licence=row["restriction_licence"],
        use_threshold=row["use_threshold"],
        owners=[r["faction_id"] for r in owner_rows],
        illegal_factions=[r["faction_id"] for r in illegal_rows],
        icon_url=get_icon_url(row["icon_path"]),
        sortorder=row["sortorder"],
        dismantlefactor=row["dismantlefactor"],
        research_time=row["research_time"],
        has_production=bool(row["has_production"]),
        has_drops=bool(row["has_drops"]),
        production=[
            ProductionMethod(
                method=pr["method"],
                time_sec=pr["time_sec"],
                amount=pr["amount"],
                workforce=pr["workforce"],
                inputs=inputs_by_method.get(pr["method"], []),
            )
            for pr in prod_rows
        ],
    )



