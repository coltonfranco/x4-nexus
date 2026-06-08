"""FastAPI app factory.

All routes live under `/api/v1/` and are aggregated here. The dashboard's static
bundle (when built) is mounted at `/`; the icon PNG directory is mounted at
`/static/icons/`.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from x4_api import __version__
from x4_api.api.v1 import health, wares
from x4_api.config import settings


def app() -> FastAPI:
    """Factory — used by `uvicorn ... --factory`."""
    fast = FastAPI(
        title="x4-api",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    fast.include_router(health.router, prefix="/api/v1", tags=["health"])
    fast.include_router(wares.router, prefix="/api/v1", tags=["wares"])

    icons_dir = settings.data_dir / "icons"
    if icons_dir.exists():
        fast.mount("/static/icons", StaticFiles(directory=icons_dir), name="icons")

    dashboard_dist = _dashboard_dist()
    if dashboard_dist is not None:
        fast.mount("/", StaticFiles(directory=dashboard_dist, html=True), name="dashboard")

    return fast


def _dashboard_dist() -> Path | None:
    candidate = Path(__file__).resolve().parents[4] / "x4-dashboard" / "dist"
    return candidate if candidate.is_dir() else None
