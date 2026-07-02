"""REST endpoint for the player logbook.

Reads the active save's dynamic DB. Entries are sorted newest-first by default.
Optional `category` and `q` (title/text search) filters narrow the list.
Faction references like {20203,3001} are resolved via the game's text database.
"""


import json
import sqlite3
from functools import lru_cache
from importlib import resources
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from x4_extract.i18n import Localizer

from x4_api.api.db_utils import table_exists
from x4_api.api.deps import get_db, get_settings
from x4_api.api.schemas import PublicModel
from x4_api.config import Settings

router = APIRouter()


class LogbookEntry(PublicModel):
    id: int
    time: float
    title: str
    text: str
    category: str
    subcategory: str
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


def _resolve_faction_display(
    faction_ref: str | None,
    localizer,
    faction_map: dict[str, tuple[str, str]],
) -> tuple[str | None, str | None]:
    """Resolve a faction reference to (display_name, color_hex).

    Returns (None, None) when ``faction_ref`` is None.

    Player faction handling:
      The game writes the player's organisation name as a raw string
      (e.g. "Franco Industries") rather than a {page, text} reference.
      Raw strings (no ``{``) are player factions.  The generic {20203,101}
      ("Player") reference is also treated as the player faction.
      Player factions get a green accent.
    """
    if not faction_ref:
        return None, None

    # Resolve {page_id, text_id} references via the localizer.
    name = localizer.resolve(faction_ref) if localizer else faction_ref

    # Is this the player faction?
    # 1. Raw string (no braces) — the game writes the player's org name directly.
    # 2. The generic "Player" reference ({20203,101} resolves to "Player").
    is_player = (
        (faction_ref and "{" not in str(faction_ref))  # raw string = player org
        or (name and name.lower() == "player")           # generic fallback
    )

    if is_player:
        display = name if name and name.lower() != "player" else "Player"
        return display, "#4ade80"  # green

    # Look up in static faction map for color.
    color = faction_map.get(name.lower(), (None, None))[1] if name else None
    return name, color



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
    category: list[str] | None, q: str | None, min_time: float | None
) -> tuple[str, list[str | int]]:
    """Build a WHERE clause for logbook filtering.

    Categories are now resolved at extraction time so filtering is a simple
    indexed column lookup — no title-pattern matching at query time.
    Each ``category`` string can be a top-level key (\"combat\") or a dotted
    path (\"combat.destroyed\") to filter by subcategory.  Multiple values are
    OR'ed together.
    """
    where: list[str] = []
    params: list[str | int] = []
    if category:
        clauses: list[str] = []
        for cat in category:
            if "." in cat:
                clauses.append("(category = ? AND subcategory = ?)")
                parts = cat.split(".", 1)
                params.extend([parts[0], parts[1]])
            else:
                clauses.append("category = ?")
                params.append(cat)
        if clauses:
            where.append(f"({' OR '.join(clauses)})")
    if min_time is not None:
        where.append("time >= ?")
        params.append(min_time)
    if q:
        where.append("(title LIKE ? OR text LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    return clause, params


@router.get("/logbook", response_model=LogbookPage)
def list_logbook(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
    category: Annotated[list[str] | None, Query(description="Filter by category (repeatable)")] = None,
    q: Annotated[str | None, Query(description="Search in title and text")] = None,
    min_time: Annotated[float | None, Query(description="Only entries at or after this in-game time (seconds)")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="Max entries")] = 200,
    offset: Annotated[int, Query(ge=0, description="Skip first N")] = 0,
) -> LogbookPage:
    """Player logbook entries, newest first, with total count for pagination.
    Faction references like {20203,3001} are resolved to readable names."""
    if not table_exists(conn, "logbook"):
        return LogbookPage(entries=[], total=0)

    localizer = _cached_localizer(str(settings.data_dir))
    faction_map = _cached_faction_map(str(settings.data_dir))

    clause, params = _build_clause(category, q, min_time)

    total = conn.execute(
        f"SELECT COUNT(*) FROM logbook {clause}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"""
        SELECT id, time, title, text, category, subcategory, faction, extra_json
        FROM logbook
        {clause}
        ORDER BY time DESC
        LIMIT ? OFFSET ?
        """,
        [*params, limit, offset],
    ).fetchall()

    components = set()
    for r in rows:
        ej_raw = r["extra_json"]
        if ej_raw:
            try:
                ej = json.loads(ej_raw)
                if "component" in ej:
                    components.add(ej["component"])
            except Exception:
                pass
                
    component_names = {}
    if components:
        placeholders = ",".join("?" * len(components))
        args = list(components)
        for row in conn.execute(f"SELECT station_id, name FROM stations WHERE station_id IN ({placeholders})", args).fetchall():
            if row[1]:
                component_names[row[0]] = row[1]
        for row in conn.execute(f"SELECT ship_id, name FROM ships WHERE ship_id IN ({placeholders})", args).fetchall():
            if row[1]:
                component_names[row[0]] = row[1]

    entries: list[LogbookEntry] = []
    for r in rows:
        d = dict(r)
        faction_ref = d.get("faction")
        faction_name, faction_color = _resolve_faction_display(
            faction_ref, localizer, faction_map
        )
        
        extra_json = d["extra_json"]
        if extra_json:
            try:
                ej = json.loads(extra_json)
                if "component" in ej and ej["component"] in component_names:
                    ej["component_name"] = component_names[ej["component"]]
                    extra_json = json.dumps(ej)
            except Exception:
                pass

        entries.append(LogbookEntry(
            id=d["id"], time=d["time"], title=d["title"], text=d["text"],
            category=d["category"] or "other",
            subcategory=d["subcategory"] or "other",
            faction=d["faction"],
            faction_name=faction_name,
            faction_color=faction_color,
            extra_json=extra_json,
        ))

    return LogbookPage(entries=entries, total=total)


class CategoryInfo(PublicModel):
    key: str
    label: str
    subcategories: list[dict[str, str]]  # [{key, label}, ...]


def _load_rules() -> dict:
    """Load the logbook classification rules JSON."""
    try:
        raw = resources.files("x4_extract.data").joinpath("logbook_rules.json").read_text()
    except (FileNotFoundError, ModuleNotFoundError):
        # Fallback: try x4_api's own copy
        try:
            raw = resources.files("x4_api.data").joinpath("logbook_rules.json").read_text()
        except (FileNotFoundError, ModuleNotFoundError):
            return {}
    return json.loads(raw)


@router.get("/logbook/categories", response_model=list[CategoryInfo])
def logbook_categories() -> list[CategoryInfo]:
    """All defined categories with subcategories, from the classification rules.
    Returns the full list even when the logbook is empty — the user can always
    filter by any defined category."""
    rules = _load_rules()

    cats: list[CategoryInfo] = []
    for cat_key, cat in rules.get("categories", {}).items():
        subs = [
            {"key": sub_key, "label": sub["label"]}
            for sub_key, sub in cat.get("subcategories", {}).items()
        ]
        cats.append(CategoryInfo(key=cat_key, label=cat["label"], subcategories=subs))
    return cats
