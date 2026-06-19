"""FastAPI app factory.

All routes live under `/api/v1/` and are aggregated here. The dashboard's static
bundle (when built) is mounted at `/`; the icon PNG directory is mounted at
`/static/icons/`.
"""

from __future__ import annotations

import contextlib
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from x4_api import __version__
from x4_api.api.refresher import BackgroundRefresher
from x4_api.api.v1 import (
    deployables,
    diplomacy,
    drops,
    economy,
    equip_mods,
    equipment,
    factions,
    fleet,
    health,
    loadouts,
    logbook,
    map,
    mission_groups,
    missions,
    modules,
    npc_stations,
    npcs,
    player,
    races,
    refresh,
    routes,
    saves,
    setup,
    ships,
    stations,
    terraform,
    ware_groups,
    wares,
)
from x4_api.config import settings


@contextlib.asynccontextmanager
async def _lifespan(fast: FastAPI) -> AsyncIterator[None]:
    """Start/stop the in-process background save refresher around the server's lifetime."""
    refresher = BackgroundRefresher(settings) if settings.background_refresh else None
    # Exposed on app state so /api/v1/refresh-config can retune it at runtime (None when
    # background refresh is disabled at the server level).
    fast.state.refresher = refresher
    if refresher is not None:
        refresher.start()
    try:
        yield
    finally:
        if refresher is not None:
            refresher.stop()


def app() -> FastAPI:
    """Factory — used by `uvicorn ... --factory`."""
    fast = FastAPI(
        title="x4-api",
        version=__version__,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        lifespan=_lifespan,
        separate_input_output_schemas=False,
    )

    fast.include_router(health.router, prefix="/api/v1", tags=["health"])
    fast.include_router(setup.router, prefix="/api/v1", tags=["setup"])
    fast.include_router(wares.router, prefix="/api/v1", tags=["wares"])
    fast.include_router(equipment.router, prefix="/api/v1", tags=["equipment"])
    fast.include_router(factions.router, prefix="/api/v1", tags=["factions"])
    fast.include_router(races.router, prefix="/api/v1", tags=["races"])
    fast.include_router(map.router, prefix="/api/v1", tags=["map"])
    fast.include_router(modules.router, prefix="/api/v1", tags=["modules"])
    fast.include_router(ships.router, prefix="/api/v1", tags=["ships"])
    fast.include_router(npc_stations.router, prefix="/api/v1", tags=["npc-stations"])
    fast.include_router(loadouts.router, prefix="/api/v1", tags=["loadouts"])
    fast.include_router(equip_mods.router, prefix="/api/v1", tags=["equipment-mods"])
    fast.include_router(terraform.router, prefix="/api/v1", tags=["terraform"])
    fast.include_router(ware_groups.router, prefix="/api/v1", tags=["ware-groups"])
    fast.include_router(mission_groups.router, prefix="/api/v1", tags=["mission-groups"])
    fast.include_router(missions.router, prefix="/api/v1", tags=["missions"])
    fast.include_router(diplomacy.router, prefix="/api/v1", tags=["diplomacy"])
    fast.include_router(drops.router, prefix="/api/v1", tags=["drops"])
    # Dynamic (save-state) endpoints — read the active save's per-save DB.
    fast.include_router(saves.router, prefix="/api/v1", tags=["saves"])
    fast.include_router(refresh.router, prefix="/api/v1", tags=["refresh"])
    fast.include_router(player.router, prefix="/api/v1", tags=["player"])
    fast.include_router(stations.router, prefix="/api/v1", tags=["stations"])
    fast.include_router(fleet.router, prefix="/api/v1", tags=["fleet"])
    fast.include_router(routes.router, prefix="/api/v1", tags=["routes"])
    fast.include_router(logbook.router, prefix="/api/v1", tags=["logbook"])
    fast.include_router(npcs.router, prefix="/api/v1", tags=["npcs"])
    fast.include_router(deployables.router, prefix="/api/v1", tags=["deployables"])
    fast.include_router(economy.router, prefix="/api/v1", tags=["economy"])

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
