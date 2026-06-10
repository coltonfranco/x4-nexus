"""REST endpoints for the multi-save catalog.

Saves are discovered by reading only each file's `<info>` header (cheap). The active
save drives which per-save dynamic DB the rest of the API reads; activating a save
selects it and builds its DB on the fly if needed.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from x4_extract.config import save_key
from x4_extract.dynamic import catalog, pipeline

from x4_api.api.deps import get_settings
from x4_api.api.schemas import PublicModel
from x4_api.config import Settings

router = APIRouter()


class SaveSummary(PublicModel):
    key: str
    save_name: str | None
    in_game_time_sec: int | None
    real_time_iso: str | None
    game_version: str | None
    player_name: str | None
    player_credits: int | None
    size_bytes: int
    mtime: float
    db_built: bool
    db_current: bool
    is_active: bool


def _to_summary(info: catalog.SaveInfo, active_key: str) -> SaveSummary:
    return SaveSummary(
        key=info.key,
        save_name=info.save_name,
        in_game_time_sec=info.in_game_time_sec,
        real_time_iso=info.real_time_iso,
        game_version=info.game_version,
        player_name=info.player_name,
        player_credits=info.player_credits,
        size_bytes=info.size_bytes,
        mtime=info.mtime,
        db_built=info.db_built,
        db_current=info.db_current,
        is_active=info.key == active_key,
    )


def _active_key(settings: Settings) -> str:
    """Selected key, else the newest save's key, else "" when the folder is empty."""
    selected = catalog.get_active_key(settings)
    if selected is not None:
        return selected
    try:
        newest = catalog.resolve_active_save(settings)
    except FileNotFoundError:
        return ""
    return save_key(newest) if newest is not None else ""


@router.get("/saves", response_model=list[SaveSummary])
def list_saves(settings: Annotated[Settings, Depends(get_settings)]) -> list[SaveSummary]:
    """All saves in the configured folder, newest first. Empty list when none/unset."""
    try:
        infos = catalog.list_saves(settings)
    except FileNotFoundError:
        return []
    active = _active_key(settings)
    return [_to_summary(i, active) for i in infos]


@router.get("/saves/active", response_model=SaveSummary)
def get_active_save(settings: Annotated[Settings, Depends(get_settings)]) -> SaveSummary:
    """The currently active save. 404 when no saves are available."""
    try:
        infos = catalog.list_saves(settings)
    except FileNotFoundError:
        infos = []
    active = _active_key(settings)
    for info in infos:
        if info.key == active:
            return _to_summary(info, active)
    raise HTTPException(status_code=404, detail="No active save — none found in the save folder.")


@router.post("/saves/{key}/activate", response_model=SaveSummary)
def activate_save(key: str, settings: Annotated[Settings, Depends(get_settings)]) -> SaveSummary:
    """Select a save as active and (re)build its dynamic DB. 404 on unknown key."""
    save = catalog.save_path_for_key(settings, key)
    if save is None:
        raise HTTPException(status_code=404, detail=f"Unknown save key: {key}")
    catalog.set_active_key(settings, key)
    pipeline.run(settings, save)
    for info in catalog.list_saves(settings):
        if info.key == key:
            return _to_summary(info, key)
    raise HTTPException(status_code=404, detail=f"Unknown save key: {key}")
