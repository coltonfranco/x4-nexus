"""REST endpoint for the player logbook.

Reads the active save's dynamic DB. Entries are sorted newest-first by default.
Optional `category` and `q` (title/text search) filters narrow the list.
Faction references like {20203,3001} are resolved via the game's text database.
"""

from __future__ import annotations

import sqlite3
from functools import lru_cache
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from x4_extract.i18n import Localizer

from x4_api.api.deps import get_db, get_settings
from x4_api.api.schemas import PublicModel
from x4_api.config import Settings

router = APIRouter()


class LogbookEntry(PublicModel):
    id: int
    time: float
    title: str
    text: str
    category: str | None
    faction: str | None
    faction_name: str | None
    faction_color: str | None
    extra_json: str | None


class LogbookPage(PublicModel):
    entries: list[LogbookEntry]
    total: int


@lru_cache(maxsize=1)
def _cached_faction_map(data_dir: str) -> dict[str, tuple[str, str]]:
    """Build name → (faction_id, color_hex) lookup from static factions. Cached once."""
    static_path = f"{data_dir}/static.db"
    try:
        conn = sqlite3.connect(f"file:{static_path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return {}
    try:
        rows = conn.execute(
            "SELECT faction_id, name, color_hex FROM factions"
        ).fetchall()
        return {r[1].lower(): (r[0], r[2]) for r in rows if r[1]}
    finally:
        conn.close()


@lru_cache(maxsize=1)
def _cached_localizer(data_dir: str) -> Localizer | None:
    """Load the text database once per process. Returns None if unavailable."""
    raw_path = f"{data_dir}/raw.db"
    try:
        conn = sqlite3.connect(f"file:{raw_path}?mode=ro", uri=True)
    except sqlite3.OperationalError:
        return None
    try:
        loc = Localizer(conn, "044")
        return loc if loc._map else None
    finally:
        conn.close()


def _build_clause(
    category: str | None, q: str | None
) -> tuple[str, list[str | int]]:
    where: list[str] = []
    params: list[str | int] = []
    if category:
        where.append("category = ?")
        params.append(category)
    if q:
        where.append("(title LIKE ? OR text LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    return clause, params


@router.get("/logbook", response_model=LogbookPage)
def list_logbook(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    category: Annotated[str | None, Query(description="Filter by category")] = None,
    q: Annotated[str | None, Query(description="Search in title and text")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Max entries")] = 200,
    offset: Annotated[int, Query(ge=0, description="Skip first N")] = 0,
) -> LogbookPage:
    """Player logbook entries, newest first, with total count for pagination.
    Faction references like {20203,3001} are resolved to readable names."""
    has_logbook = bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='logbook'"
        ).fetchone()
    )
    if not has_logbook:
        return LogbookPage(entries=[], total=0)

    localizer = _cached_localizer(str(settings.data_dir))
    faction_map = _cached_faction_map(str(settings.data_dir))

    clause, params = _build_clause(category, q)

    total = conn.execute(
        f"SELECT COUNT(*) FROM logbook {clause}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"""
        SELECT id, time, title, text, category, faction, extra_json
        FROM logbook
        {clause}
        ORDER BY time DESC
        LIMIT ? OFFSET ?
        """,
        [*params, limit, offset],
    ).fetchall()

    entries: list[LogbookEntry] = []
    for r in rows:
        d = dict(r)
        faction_ref = d.get("faction")
        faction_name = localizer.resolve(faction_ref) if localizer and faction_ref else None
        faction_color = faction_map.get(faction_name.lower(), (None, None))[1] if faction_name else None
        entries.append(LogbookEntry(
            id=d["id"], time=d["time"], title=d["title"], text=d["text"],
            category=d["category"], faction=d["faction"],
            faction_name=faction_name,
            faction_color=faction_color,
            extra_json=d["extra_json"],
        ))

    return LogbookPage(entries=entries, total=total)


@router.get("/logbook/categories", response_model=list[str])
def logbook_categories(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> list[str]:
    """Distinct categories present in the logbook (for filter dropdowns)."""
    has_logbook = bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='logbook'"
        ).fetchone()
    )
    if not has_logbook:
        return []
    return [
        r[0]
        for r in conn.execute(
            "SELECT DISTINCT category FROM logbook WHERE category IS NOT NULL ORDER BY category"
        ).fetchall()
    ]
