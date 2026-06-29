"""REST endpoints for the loot drop system."""


import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class DropEntry(PublicModel):
    ware_id: str
    ware_name: str | None = None
    spawn_chance: int | None
    item_chance: float | None
    min_amount: int
    max_amount: int
    source_basket: str | None


class DropList(PublicModel):
    list_id: str
    category: str | None


class DropListDetail(DropList):
    wares: list[DropEntry]


class DropSource(PublicModel):
    list_id: str
    category: str | None
    spawn_chance: int | None
    item_chance: float | None
    min_amount: int
    max_amount: int
    source_basket: str | None


@router.get("/drops/lists", response_model=list[DropList])
def list_drop_lists(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    category: str | None = Query(None, description="ship | lockbox | asteroid | crystal | story | masstraffic | other"),
) -> list[DropList]:
    """List all named drop tables."""
    if category is not None:
        rows = conn.execute(
            "SELECT list_id, category FROM s.drop_lists WHERE category = :c ORDER BY list_id",
            {"c": category},
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT list_id, category FROM s.drop_lists ORDER BY category, list_id"
        ).fetchall()
    return [DropList(**dict(r)) for r in rows]


@router.get("/drops/lists/{list_id}", response_model=DropListDetail)
def get_drop_list(
    list_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> DropListDetail:
    """Get a specific drop table with all its resolved ware entries."""
    row = conn.execute(
        "SELECT list_id, category FROM s.drop_lists WHERE list_id = :id",
        {"id": list_id},
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown drop list: {list_id}")

    ware_rows = conn.execute(
        """SELECT d.ware_id, w.name AS ware_name, d.spawn_chance, d.item_chance, d.min_amount, d.max_amount, d.source_basket
           FROM s.drop_list_wares d
           LEFT JOIN s.wares w ON d.ware_id = w.ware_id OR d.ware_id = w.ware_id || '_macro'
           WHERE d.list_id = :id
           ORDER BY d.spawn_chance DESC, d.source_basket, d.item_chance DESC""",
        {"id": list_id},
    ).fetchall()

    return DropListDetail(
        list_id=row["list_id"],
        category=row["category"],
        wares=[DropEntry(**dict(r)) for r in ware_rows],
    )


@router.get("/drops/wares/{ware_id}", response_model=list[DropSource])
def get_ware_drop_sources(
    ware_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[DropSource]:
    """Find all drop tables that can yield a specific ware (reverse lookup)."""
    rows = conn.execute(
        """SELECT dlw.list_id, dl.category,
                  dlw.spawn_chance, dlw.item_chance, dlw.min_amount, dlw.max_amount, dlw.source_basket
           FROM s.drop_list_wares dlw
           JOIN s.drop_lists dl ON dl.list_id = dlw.list_id
           WHERE dlw.ware_id = :ware_id
           ORDER BY dl.category, dlw.list_id""",
        {"ware_id": ware_id},
    ).fetchall()
    return [DropSource(**dict(r)) for r in rows]
