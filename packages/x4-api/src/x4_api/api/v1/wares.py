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

from __future__ import annotations

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
    "EXISTS(SELECT 1 FROM s.ware_production p WHERE p.ware_id = wares.ware_id) AS has_production, "
    "EXISTS(SELECT 1 FROM s.drop_list_wares d WHERE d.ware_id = wares.ware_id) AS has_drops"
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


class ProductionMethod(PublicModel):
    method: str
    time_sec: float
    amount: int
    workforce: int | None
    inputs: list[ProductionInput]


class ProductionInput(PublicModel):
    ware_id: str
    amount: int


class WareDetail(WareSummary):
    storage_class: str | None
    restriction_licence: str | None = None
    use_threshold: float | None = None
    owners: list[str]
    illegal_factions: list[str]
    production: list[ProductionMethod]


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
    sql = [
        f"SELECT ware_id, name, group_id, ({CATEGORY_SQL}) AS category, transport, volume,",
        "       price_min, price_avg, price_max, tags, icon_path,",
        f"       {_FLAGS_SQL}",
        "FROM s.wares WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if group is not None:
        sql.append("AND group_id = :group")
        params["group"] = group
    if transport is not None:
        sql.append("AND transport = :transport")
        params["transport"] = transport
    if category is not None:
        sql.append(f"AND ({CATEGORY_SQL}) = :category")
        params["category"] = category
    sql.append("ORDER BY ware_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [
        WareSummary(
            ware_id=r["ware_id"],
            name=r["name"],
            group_id=r["group_id"],
            category=r["category"],
            transport=r["transport"],
            volume=r["volume"],
            price_min=r["price_min"],
            price_avg=r["price_avg"],
            price_max=r["price_max"],
            tags=r["tags"],
            icon_url=get_icon_url(r["icon_path"]),
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
    row = conn.execute(
        f"""
        SELECT ware_id, name, group_id, ({CATEGORY_SQL}) AS category, transport, volume,
               price_min, price_avg, price_max, storage_class,
               tags, restriction_licence, use_threshold, icon_path,
               {_FLAGS_SQL}
        FROM s.wares WHERE ware_id = :id
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



