"""Freshness signals for the client's selective background refresh.

The in-process refresher (api/refresher.py) keeps the active save's dynamic DB current.
The client polls `/refresh-status` cheaply; when a dataset's marker advances it refetches
only that dataset (instead of the full invalidate the save-refresh button triggers). The
`/events` feed exposes the classified change log (combat alerts, ship losses, …).
"""

import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from x4_extract.dynamic import catalog

from x4_api.api.deps import get_db, get_settings
from x4_api.api.refresher import MIN_INTERVAL_SEC
from x4_api.api.schemas import PublicModel
from x4_api.api.v1.saves import _active_key
from x4_api.config import Settings

router = APIRouter()

# ingest_state rows that hold ingest bookkeeping rather than a real data-tier fingerprint.
_META_TIERS = frozenset({"source", "source_mtime", "source_size", "ingest_ms", "pipeline_version"})


class RefreshStatus(PublicModel):
    active_key: str
    following_latest: bool  # True when tracking the newest save (no pin), else pinned
    ingested_at: str | None  # most recent successful ingest (wall clock)
    source_fingerprint: str | None  # changes whenever the save file content changed
    last_ingest_ms: int | None  # wall-clock cost of that ingest, for perf visibility
    last_event_id: int
    # entity_type → highest event id seen for it. The client remembers the previous map
    # and refetches the datasets whose marker advanced.
    markers: dict[str, int]


class RefreshConfigOut(PublicModel):
    background_refresh: bool  # is the in-process watcher running at all (server-level switch)
    interval_enabled: bool  # is the periodic backstop poll on (watchdog runs regardless)
    interval_sec: int
    min_interval_sec: int  # floor the UI should enforce on interval_sec


class RefreshConfigIn(PublicModel):
    interval_enabled: bool | None = None
    interval_sec: int | None = None


class EventOut(PublicModel):
    id: int
    game_time: float | None
    real_time: str
    entity_type: str
    entity_key: str
    change_kind: str
    priority: str
    category: str | None
    title: str | None
    text: str | None


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
        is not None
    )


@router.get("/refresh-status", response_model=RefreshStatus)
def refresh_status(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RefreshStatus:
    """Cheap poll target: what changed in the active save since the client last looked."""
    ingested_at: str | None = None
    source_fp: str | None = None
    last_ingest_ms: int | None = None
    if _has_table(conn, "ingest_state"):
        rows = conn.execute("SELECT tier, fingerprint, ingested_at FROM ingest_state").fetchall()
        # Several pseudo-tiers carry ingest metadata, not real tier fingerprints; exclude
        # them so the "most recent real ingest" timestamp reflects actual data rewrites only.
        times = [
            r["ingested_at"] for r in rows if r["ingested_at"] and r["tier"] not in _META_TIERS
        ]
        ingested_at = max(times) if times else None
        source_fp = next((r["fingerprint"] for r in rows if r["tier"] == "source"), None)
        ms_raw = next((r["fingerprint"] for r in rows if r["tier"] == "ingest_ms"), None)
        if ms_raw is not None and ms_raw.isdigit():
            last_ingest_ms = int(ms_raw)

    markers: dict[str, int] = {}
    last_event_id = 0
    if _has_table(conn, "events"):
        last_event_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM events").fetchone()[0]
        markers = {
            r["entity_type"]: r["max_id"]
            for r in conn.execute(
                "SELECT entity_type, MAX(id) AS max_id FROM events GROUP BY entity_type"
            )
        }

    return RefreshStatus(
        active_key=_active_key(settings),
        following_latest=catalog.get_active_key(settings) is None,
        ingested_at=ingested_at,
        source_fingerprint=source_fp,
        last_ingest_ms=last_ingest_ms,
        last_event_id=last_event_id,
        markers=markers,
    )


@router.get("/refresh-config", response_model=RefreshConfigOut)
def get_refresh_config(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> RefreshConfigOut:
    """Current live-sync settings: whether the periodic backstop poll runs, and how often."""
    refresher = getattr(request.app.state, "refresher", None)
    if refresher is None:
        # Background refresh disabled at the server level — nothing to tune.
        return RefreshConfigOut(
            background_refresh=False,
            interval_enabled=False,
            interval_sec=max(MIN_INTERVAL_SEC, settings.poll_interval_sec),
            min_interval_sec=MIN_INTERVAL_SEC,
        )
    cfg = refresher.get_config()
    return RefreshConfigOut(
        background_refresh=True,
        interval_enabled=cfg.interval_enabled,
        interval_sec=cfg.interval_sec,
        min_interval_sec=MIN_INTERVAL_SEC,
    )


@router.put("/refresh-config", response_model=RefreshConfigOut)
def update_refresh_config(body: RefreshConfigIn, request: Request) -> RefreshConfigOut:
    """Enable/disable the backstop poll or change its interval; applied immediately."""
    refresher = getattr(request.app.state, "refresher", None)
    if refresher is None:
        raise HTTPException(
            status_code=409,
            detail="Background refresh is disabled on the server; nothing to configure.",
        )
    if body.interval_sec is not None and body.interval_sec < MIN_INTERVAL_SEC:
        raise HTTPException(
            status_code=422,
            detail=f"interval_sec must be at least {MIN_INTERVAL_SEC} seconds.",
        )
    cfg = refresher.set_config(
        interval_enabled=body.interval_enabled, interval_sec=body.interval_sec
    )
    return RefreshConfigOut(
        background_refresh=True,
        interval_enabled=cfg.interval_enabled,
        interval_sec=cfg.interval_sec,
        min_interval_sec=MIN_INTERVAL_SEC,
    )


@router.get("/events", response_model=list[EventOut])
def list_events(
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
    since: Annotated[int, Query(description="Return events with id greater than this.")] = 0,
    min_priority: Annotated[
        str | None, Query(description="Lowest priority to include: info | warn | alert.")
    ] = None,
    category: Annotated[str | None, Query(description="Filter to one category.")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> list[EventOut]:
    """Classified change feed, newest first. Use `since` to stream only new events."""
    if not _has_table(conn, "events"):
        return []

    clauses = ["id > ?"]
    params: list[object] = [since]
    if category is not None:
        clauses.append("category = ?")
        params.append(category)
    if min_priority is not None:
        # Priorities are ordered; include this rank and anything more severe.
        order = ["info", "warn", "alert"]
        if min_priority in order:
            allowed = order[order.index(min_priority) :]
            clauses.append(f"priority IN ({','.join('?' * len(allowed))})")
            params.extend(allowed)
    params.append(limit)

    sql = (
        "SELECT id, game_time, real_time, entity_type, entity_key, change_kind, "
        "priority, category, title, text FROM events "
        f"WHERE {' AND '.join(clauses)} ORDER BY id DESC LIMIT ?"
    )
    return [EventOut(**dict(r)) for r in conn.execute(sql, params)]
