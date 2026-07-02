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
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.db_utils import fetch_one_or_404, table_exists
from x4_api.api.deps import get_db
from x4_api.api.icons import get_ware_icon_url
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

# Fix for ambiguous columns when joining ware_groups
_CAT_SQL = (
    CATEGORY_SQL.replace("group_id", "w.group_id")
    .replace("transport", "w.transport")
    .replace("tags", "w.tags")
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
    market_min: int | None = None
    market_avg: int | None = None
    market_max: int | None = None
    sell_qty: int | None = None
    buy_qty: int | None = None
    net_demand: int | None = None
    tags: str | None
    icon_url: str | None
    has_production: bool
    has_drops: bool
    shortname: str | None = None
    description: str | None = None
    sortorder: int | None = None
    dismantlefactor: float | None = None
    research_time: int | None = None
    tier: int | None = None


class ProductionInput(PublicModel):
    ware_id: str
    amount: int


class ProductionMethod(PublicModel):
    method: str
    time_sec: float
    amount: int
    workforce: int | None
    inputs: list[ProductionInput]


class WareUse(PublicModel):
    type: str
    id: str
    name: str
    icon_url: str | None = None


class WareDetail(WareSummary):
    storage_class: str | None
    restriction_licence: str | None = None
    use_threshold: float | None = None
    owners: list[str]
    illegal_factions: list[str]
    used_for: list[WareUse]
    production: list[ProductionMethod]
    exclusive_race: str | None = None


# ── Live price enrichment (from dynamic station_offers, when available) ─────────


def _market_price_sql(conn: sqlite3.Connection) -> tuple[str, bool]:
    """Return (sql_fragment, has_live_data) for enriching static prices with market data.

    When the active save has been ingested, station_offers carries real buy/sell prices
    from every station.  We LEFT JOIN per-ware MIN/AVG/MAX so the catalog reflects the
    live economy.  When no save is active (or the table doesn't exist yet) the static
    reference prices are used as-is.
    """
    if not table_exists(conn, "station_offers"):
        return (
            "w.price_min, w.price_avg, w.price_max, "
            "NULL AS market_min, NULL AS market_avg, NULL AS market_max, "
            "NULL AS sell_qty, NULL AS buy_qty, NULL AS net_demand",
            False,
        )

    return (
        "w.price_min, w.price_avg, w.price_max, "
        "m.market_min, m.market_avg, m.market_max, "
        "m.sell_qty, m.buy_qty, m.net_demand",
        True,
    )


def _market_join_sql() -> str:
    """Subquery that computes live price ranges per ware from station trade offers."""
    return (
        "LEFT JOIN ("
        "  SELECT ware_id,"
        "         CAST(MIN(price) AS INTEGER) AS market_min,"
        "         CAST(AVG(price) AS INTEGER) AS market_avg,"
        "         CAST(MAX(price) AS INTEGER) AS market_max,"
        "         SUM(CASE WHEN side='sell' THEN quantity ELSE 0 END) AS sell_qty,"
        "         SUM(CASE WHEN side='buy' THEN quantity ELSE 0 END) AS buy_qty,"
        "         SUM(CASE WHEN side='buy' THEN quantity ELSE 0 END) - SUM(CASE WHEN side='sell' THEN quantity ELSE 0 END) AS net_demand"
        "  FROM station_offers"
        "  GROUP BY ware_id"
        ") m ON w.ware_id = m.ware_id"
    )


def _ware_fields(r: sqlite3.Row) -> dict[str, Any]:
    """Common WareSummary/WareDetail field prep shared by list_wares and get_ware."""
    d = dict(r)
    icon_path = d.pop("icon_path", None)
    d["icon_url"] = get_ware_icon_url(d["ware_id"], icon_path, d.get("tags"))
    d["has_production"] = bool(d["has_production"])
    d["has_drops"] = bool(d["has_drops"])
    return d


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
        f"       ({_CAT_SQL}) AS category, w.transport, w.volume,",
        f"       {price_sql},",
        "       w.tags, w.icon_path,",
        "       w.sortorder, w.dismantlefactor, w.research_time,",
        f"       {_FLAGS_SQL}, w.tier",
        "FROM s.wares w",
        "LEFT JOIN s.ware_groups g ON w.group_id = g.group_id",
    ]
    if has_live:
        sql.append(_market_join_sql())
    sql.append("WHERE w.name NOT LIKE '(TEMP)%'")

    params: dict[str, object] = {"limit": limit, "offset": offset}
    if group is not None:
        sql.append("AND w.group_id = :group")
        params["group"] = group
    if transport is not None:
        sql.append("AND w.transport = :transport")
        params["transport"] = transport
    if category is not None:
        sql.append(f"AND ({_CAT_SQL}) = :category")
        params["category"] = category
    sql.append("ORDER BY w.ware_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [WareSummary(**_ware_fields(r)) for r in rows]


@router.get("/wares/{ware_id}", response_model=WareDetail)
def get_ware(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> WareDetail:
    price_sql, has_live = _market_price_sql(conn)
    join_clause = _market_join_sql() if has_live else ""

    row = fetch_one_or_404(
        conn,
        f"""
        SELECT w.ware_id, w.name, w.shortname, w.description, w.group_id,
               ({_CAT_SQL}) AS category, w.transport, w.volume,
               {price_sql}, w.storage_class,
               w.tags, w.restriction_licence, w.use_threshold, w.icon_path,
               w.sortorder, w.dismantlefactor, w.research_time,
               {_FLAGS_SQL}, w.tier
        FROM s.wares w
        LEFT JOIN s.ware_groups g ON w.group_id = g.group_id
        {join_clause}
        WHERE w.ware_id = :id
        """,
        {"id": ware_id},
        f"Unknown ware_id: {ware_id}",
    )

    owner_rows = conn.execute(
        "SELECT faction_id FROM s.ware_owners WHERE ware_id = :id ORDER BY faction_id",
        {"id": ware_id},
    ).fetchall()

    unique_races = conn.execute(
        "SELECT DISTINCT makerrace FROM s.modules WHERE produces_ware_id = :id AND kind IN ('production', 'processingmodule') AND makerrace IS NOT NULL",
        {"id": ware_id},
    ).fetchall()
    exclusive_race = unique_races[0]["makerrace"] if len(unique_races) == 1 else None

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
    used_for_rows = conn.execute(
        """
        SELECT u.use_type, u.use_value, w.name, w.icon_path, w.tags
        FROM s.ware_uses u
        LEFT JOIN s.wares w ON u.use_type = 'ware' AND u.use_value = w.ware_id
        WHERE u.ware_id = :id
        ORDER BY u.use_type ASC, u.use_value ASC
        """,
        {"id": ware_id},
    ).fetchall()

    used_for_list = []
    for r in used_for_rows:
        if r["use_type"] == "category":
            used_for_list.append(WareUse(type="category", id=r["use_value"], name=r["use_value"]))
        else:
            icon = (
                get_ware_icon_url(r["use_value"], r["icon_path"], r["tags"])
                if r["icon_path"]
                else None
            )
            used_for_list.append(
                WareUse(type="ware", id=r["use_value"], name=r["name"], icon_url=icon)
            )

    inputs_by_method: dict[str, list[ProductionInput]] = {}
    for ir in input_rows:
        inputs_by_method.setdefault(ir["method"], []).append(
            ProductionInput(ware_id=ir["input_ware_id"], amount=ir["amount"])
        )

    return WareDetail(
        **_ware_fields(row),
        owners=[r["faction_id"] for r in owner_rows],
        illegal_factions=[r["faction_id"] for r in illegal_rows],
        used_for=used_for_list,
        exclusive_race=exclusive_race,
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
