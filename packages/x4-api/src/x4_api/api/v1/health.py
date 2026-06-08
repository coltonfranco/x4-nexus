"""Liveness + freshness for the dashboard's status bar.

EXEMPLAR endpoint: response model defined locally for stability, dependency-injected
DB connection, no business logic in the handler (delegated to a query).
"""

from __future__ import annotations

import sqlite3
import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from x4_api import __version__
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()


class HealthResponse(PublicModel):
    ok: bool
    api_version: str
    save_age_sec: float | None
    game_version: str | None


@router.get("/health", response_model=HealthResponse)
def health(conn: sqlite3.Connection = Depends(get_db)) -> HealthResponse:
    save_age, game_version = _latest_save_info(conn)
    return HealthResponse(
        ok=True,
        api_version=__version__,
        save_age_sec=save_age,
        game_version=game_version,
    )


def _latest_save_info(conn: sqlite3.Connection) -> tuple[float | None, str | None]:
    row = conn.execute(
        "SELECT parsed_at, game_version FROM save_meta ORDER BY parsed_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return None, None
    parsed = datetime.fromisoformat(row["parsed_at"])
    age = time.time() - parsed.replace(tzinfo=UTC).timestamp()
    return age, row["game_version"]
