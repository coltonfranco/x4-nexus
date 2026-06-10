"""Station modules endpoint."""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.icons import get_icon_url
from x4_api.api.schemas import PublicModel

router = APIRouter()

_LIST_COLS = (
    "module_id, name, dlc, kind, size, produces_ware_id, "
    "storage_capacity, storage_type, drone_capacity, workforce_capacity, icon_path"
)
_DETAIL_COLS = (
    _LIST_COLS + ", "
    "hull, explosiondamage, "
    "turrets_s, turrets_m, turrets_l, turrets_xl, "
    "shields_s, shields_m, shields_l, shields_xl"
)


class ModuleSummary(PublicModel):
    module_id: str
    name: str
    dlc: str | None
    kind: str | None
    size: str | None
    produces_ware_id: str | None
    storage_capacity: int | None
    storage_type: str | None
    drone_capacity: int | None
    workforce_capacity: int | None
    icon_url: str | None


class ModuleDetail(ModuleSummary):
    hull: int | None
    explosiondamage: int | None
    turrets_s: int
    turrets_m: int
    turrets_l: int
    turrets_xl: int
    shields_s: int
    shields_m: int
    shields_l: int
    shields_xl: int


def _row_to_summary(r: sqlite3.Row) -> ModuleSummary:
    d = dict(r)
    d["icon_url"] = get_icon_url(d.pop("icon_path"))
    return ModuleSummary(**d)


def _row_to_detail(r: sqlite3.Row) -> ModuleDetail:
    d = dict(r)
    d["icon_url"] = get_icon_url(d.pop("icon_path"))
    return ModuleDetail(**d)


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    kind: str | None = Query(None, description="Filter by kind: production, habitation, storage, dock, defence, connectionmodule"),
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
) -> list[ModuleSummary]:
    sql = [f"SELECT {_LIST_COLS} FROM s.modules WHERE 1=1"]
    params: dict[str, object] = {"limit": limit, "offset": offset}
    if kind is not None:
        sql.append("AND kind = :kind")
        params["kind"] = kind
    sql.append("ORDER BY module_id LIMIT :limit OFFSET :offset")
    rows = conn.execute(" ".join(sql), params).fetchall()
    return [_row_to_summary(r) for r in rows]


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(
    module_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> ModuleDetail:
    row = conn.execute(
        f"SELECT {_DETAIL_COLS} FROM s.modules WHERE module_id = :id",
        {"id": module_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown module_id: {module_id}")
    return _row_to_detail(row)
