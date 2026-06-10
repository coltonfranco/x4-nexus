"""Equipment mod endpoints."""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class EquipModSummary(PublicModel):
    ware_id: str
    name: str | None
    shortname: str | None
    category: str | None
    stat: str | None
    quality: int | None
    min_factor: float | None
    max_factor: float | None
    price_avg: int | None


class EquipModDetail(EquipModSummary):
    description: str | None
    price_min: int | None
    price_max: int | None
    production_time: float | None


@router.get("/equipment-mods", response_model=list[EquipModSummary])
def list_equip_mods(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    category: str | None = Query(None, description="Filter by category: weapon, engine, shield, ship"),
    stat: str | None = Query(None, description="Filter by stat type e.g. damage, cooling"),
    quality: int | None = Query(None, description="Filter by quality tier 1–3"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[EquipModSummary]:
    sql = [
        "SELECT ware_id, name, shortname, category, stat, quality, min_factor, max_factor, price_avg",
        "FROM s.equip_mods WHERE 1=1",
    ]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if category is not None:
        sql.append("AND category = :category")
        params["category"] = category
    if stat is not None:
        sql.append("AND stat = :stat")
        params["stat"] = stat
    if quality is not None:
        sql.append("AND quality = :quality")
        params["quality"] = quality
    sql.append("ORDER BY category, stat, quality, ware_id LIMIT :limit OFFSET :offset")

    rows = conn.execute(" ".join(sql), params).fetchall()
    return [EquipModSummary(**dict(r)) for r in rows]


@router.get("/equipment-mods/{ware_id}", response_model=EquipModDetail)
def get_equip_mod(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> EquipModDetail:
    row = conn.execute(
        "SELECT ware_id, name, shortname, description, category, stat, quality, "
        "min_factor, max_factor, price_min, price_avg, price_max, production_time "
        "FROM s.equip_mods WHERE ware_id = :id",
        {"id": ware_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown ware_id: {ware_id}")
    return EquipModDetail(**dict(row))
