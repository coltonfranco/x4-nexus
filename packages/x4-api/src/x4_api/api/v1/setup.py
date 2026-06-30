"""First-run setup: configure game folders and build the static database.

The main app requires a populated `static.db`; save data builds on top of it. A fresh
install has neither folders configured nor a static DB, so the server boots
unconfigured (``install_path`` is optional) and the dashboard's setup gate drives this
flow:

  1. GET  /setup/status          — what's configured / built; init progress.
  2. POST /setup/validate-path   — does this folder look like a game install / save dir?
  3. POST /setup/config          — persist the chosen folders (survives restart).
  4. POST /setup/initialize      — kick off the datalake → static → icons build.

Folder choices persist to app-data config.json AND mutate the live settings singleton,
so the running server (and its background refresher) pick them up without a restart.
"""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from x4_api import appdata
from x4_api.api.deps import get_settings
from x4_api.api.schemas import PublicModel
from x4_api.config import Settings, static_db_ready
from x4_api.init_job import job

router = APIRouter()


# ── Response models ──────────────────────────────────────────────────────────────


class InitStatus(PublicModel):
    stage: str
    label: str
    detail: str | None = None
    progress: float  # 0..1
    running: bool
    error: str | None


class SetupStatus(PublicModel):
    configured: bool          # is an install folder set?
    install_path: str | None
    save_path: str | None
    static_ready: bool        # is static.db populated? (the gate for the main app)
    needs_setup: bool         # should the wizard be shown?
    init: InitStatus


class PathValidation(PublicModel):
    ok: bool
    detail: str
    found: int  # count of relevant files discovered (.cat archives / save files)


# ── Request models ───────────────────────────────────────────────────────────────


class ValidatePathRequest(BaseModel):
    kind: Literal["install", "save"]
    path: str


class SetupConfigRequest(BaseModel):
    install_path: str
    save_path: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────────


def _init_status() -> InitStatus:
    s = job.state()
    return InitStatus(
        stage=s.stage, label=s.label, detail=s.detail, progress=s.progress, running=s.running, error=s.error
    )


def _status(settings: Settings) -> SetupStatus:
    ready = static_db_ready(settings)
    init_stat = _init_status()

    paths_valid = False
    if settings.install_path and settings.save_path:
        install_valid = settings.install_path.is_dir() and _count_cats(settings.install_path) > 0
        save_valid = settings.save_path.is_dir() and next(settings.save_path.glob("*.xml.gz"), None) is not None
        paths_valid = install_valid and save_valid

    return SetupStatus(
        configured=settings.install_path is not None,
        install_path=str(settings.install_path) if settings.install_path else None,
        save_path=str(settings.save_path) if settings.save_path else None,
        static_ready=ready,
        # The wizard is needed until the static DB exists AND the configured paths are still valid
        # AND there isn't a setup job currently running (like building icons) or failed.
        needs_setup=not ready or not paths_valid or init_stat.running or init_stat.error is not None,
        init=init_stat,
    )


def _count_cats(folder: Path) -> int:
    # Base archives sit at the root; DLC/workshop archives under extensions/.
    return len(list(folder.glob("*.cat"))) + len(list(folder.glob("extensions/*/ext_*.cat")))


# ── Endpoints ────────────────────────────────────────────────────────────────────


@router.get("/setup/status", response_model=SetupStatus)
def setup_status(settings: Annotated[Settings, Depends(get_settings)]) -> SetupStatus:
    return _status(settings)


@router.post("/setup/validate-path", response_model=PathValidation)
def validate_path(req: ValidatePathRequest) -> PathValidation:
    folder = Path(req.path).expanduser()
    if not folder.is_dir():
        return PathValidation(ok=False, detail="Folder does not exist.", found=0)

    if req.kind == "install":
        found = _count_cats(folder)
        if found == 0:
            return PathValidation(
                ok=False,
                detail="No .cat archives found here. Point at the folder containing X4.exe.",
                found=0,
            )
        return PathValidation(ok=True, detail=f"Found {found} game archive(s).", found=found)

    # save folder
    found = len(list(folder.glob("*.xml.gz")))
    if found == 0:
        return PathValidation(
            ok=False,
            detail="No *.xml.gz saves here. Point at the inner save/ folder.",
            found=0,
        )
    return PathValidation(ok=True, detail=f"Found {found} save file(s).", found=found)


@router.post("/setup/config", response_model=SetupStatus)
def set_config(
    req: SetupConfigRequest, settings: Annotated[Settings, Depends(get_settings)]
) -> SetupStatus:
    """Persist folder choices and apply them to the live settings immediately."""
    appdata.write_config(install_path=req.install_path, save_path=req.save_path)
    # Mutate the shared singleton in place so existing references (deps, refresher) see it.
    settings.install_path = Path(req.install_path).expanduser().resolve()
    settings.save_path = Path(req.save_path).expanduser().resolve() if req.save_path else None
    return _status(settings)


@router.post("/setup/initialize", response_model=SetupStatus)
def initialize(settings: Annotated[Settings, Depends(get_settings)]) -> SetupStatus:
    """Start the static build in the background. Idempotent while one is running."""
    job.start(settings)  # no-op if already running; status reflects the running stage
    return _status(settings)
