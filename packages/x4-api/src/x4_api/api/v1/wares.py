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
from x4_api.api.schemas import PublicModel

router = APIRouter()

ICON_BASE = "/static/icons"


class WareSummary(PublicModel):
    ware_id: str
    name: str
    group_id: str | None
    transport: str | None
    volume: float
    price_avg: int | None
    icon_url: str | None


class ProductionMethod(PublicModel):
    method: str
    time_sec: float
    amount: int
    workforce: int | None
    inputs: list["ProductionInput"]


class ProductionInput(PublicModel):
    ware_id: str
    amount: int


class WareDetail(WareSummary):
    price_min: int | None
    price_max: int | None
    storage_class: str | None
    production: list[ProductionMethod]


@router.get("/wares", response_model=list[WareSummary])
def list_wares(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    group: str | None = Query(None),
    transport: str | None = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[WareSummary]:
    sql = [
        "SELECT ware_id, name, group_id, transport, volume, price_avg, icon_path",
        "FROM s.wares WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if group is not None:
        sql.append("AND group_id = :group")
        params["group"] = group
    if transport is not None:
        sql.append("AND transport = :transport")
        params["transport"] = transport
    sql.append("ORDER BY ware_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [
        WareSummary(
            ware_id=r["ware_id"],
            name=r["name"],
            group_id=r["group_id"],
            transport=r["transport"],
            volume=r["volume"],
            price_avg=r["price_avg"],
            icon_url=_icon_url(r["icon_path"]),
        )
        for r in rows
    ]


@router.get("/wares/{ware_id}", response_model=WareDetail)
def get_ware(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> WareDetail:
    row = conn.execute(
        """
        SELECT ware_id, name, group_id, transport, volume,
               price_min, price_avg, price_max, storage_class, icon_path
        FROM s.wares WHERE ware_id = :id
        """,
        {"id": ware_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown ware_id: {ware_id}")

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
        transport=row["transport"],
        volume=row["volume"],
        price_min=row["price_min"],
        price_avg=row["price_avg"],
        price_max=row["price_max"],
        storage_class=row["storage_class"],
        icon_url=_icon_url(row["icon_path"]),
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


def _icon_url(icon_path: str | None) -> str | None:
    return f"{ICON_BASE}/{icon_path}.png" if icon_path else None
