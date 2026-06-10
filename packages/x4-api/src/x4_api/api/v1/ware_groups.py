"""REST endpoints for ware group catalog."""

from __future__ import annotations

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class WareGroup(PublicModel):
    group_id: str
    name: str | None
    tags: str | None
    factory_name: str | None
    icon: str | None
    factory_map_icon: str | None
    factory_hud_icon: str | None
    tier: int | None
    priority: int | None


@router.get("/ware-groups", response_model=list[WareGroup])
def list_ware_groups(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[WareGroup]:
    """List all ware groups with display metadata."""
    rows = conn.execute(
        """SELECT group_id, name, tags, factory_name, icon,
                  factory_map_icon, factory_hud_icon, tier, priority
           FROM s.ware_groups
           ORDER BY COALESCE(priority, 99), group_id"""
    ).fetchall()
    return [WareGroup(**dict(r)) for r in rows]


@router.get("/ware-groups/{group_id}", response_model=WareGroup)
def get_ware_group(
    group_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> WareGroup:
    row = conn.execute(
        """SELECT group_id, name, tags, factory_name, icon,
                  factory_map_icon, factory_hud_icon, tier, priority
           FROM s.ware_groups WHERE group_id = :id""",
        {"id": group_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown group_id: {group_id}")
    return WareGroup(**dict(row))
