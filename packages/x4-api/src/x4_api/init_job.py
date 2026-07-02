"""Background first-run initialization job.

The static build (datalake crawl → transform → icons) takes minutes, so the setup
wizard can't block an HTTP request on it. This module runs it in a daemon thread and
exposes coarse progress (which stage, done/error) for the wizard to poll via
``/api/v1/setup/status``.

Only one init may run at a time. The job is a process-global singleton because there
is exactly one app and one data directory.
"""

from __future__ import annotations

import gc
import shutil
import threading
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Literal

from x4_api.config import Settings

Stage = Literal["idle", "datalake", "static", "icons", "dynamic", "done", "error"]

# User-facing labels for each stage.  The frontend renders these in a stepper so
# the user always knows which of the four stages is active.  `progress` is now
# 0.0 → 1.0 *within* the current stage (not an overall percentage).
_STAGE_LABEL: dict[Stage, str] = {
    "idle": "Not started",
    "datalake": "Extracting game archives",
    "static": "Building static database",
    "icons": "Generating image assets",
    "dynamic": "Ingesting current save",
    "done": "Ready",
    "error": "Failed",
}

# Ordered list of the four build stages — frontend uses this for the stepper.
BUILD_STAGES: list[Stage] = ["datalake", "static", "icons", "dynamic"]


def _remove_path(path: Path) -> None:
    """Best-effort delete tolerant of transient Windows file locks.

    On Windows a sqlite handle that has gone out of scope but not yet been collected
    still holds a lock, so an immediate ``unlink`` can raise ``PermissionError``. Retry
    a few times, forcing a GC pass between attempts to release such handles; if the
    path is still stubborn, give up rather than aborting the whole rebuild (the crawler
    overwrites the DBs anyway).
    """
    for _ in range(5):
        try:
            if path.is_dir():
                shutil.rmtree(path)
            else:
                path.unlink(missing_ok=True)
            return
        except OSError:
            gc.collect()
            time.sleep(0.2)
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)


def wipe_game_data(settings: Settings) -> None:
    """Delete all game-derived data so a reset rebuilds from scratch.

    Schemas apply non-destructively (``CREATE … IF NOT EXISTS``), so re-running init
    alone would leave stale rows from an old patch. This selectively removes the
    derived DBs and asset dirs while preserving user-authored content: ``appdata.db``
    (Station Builder designs), ``refresh_config.json``, and the separate
    ``config.json`` in the app-data dir are never touched.
    """
    data_dir = settings.data_dir

    for subdir in ("dynamic", "icons"):
        _remove_path(data_dir / subdir)

    # Each SQLite DB plus its -wal/-shm sidecars.
    for db in ("raw.db", "static.db", "catalog.db"):
        for suffix in ("", "-wal", "-shm"):
            _remove_path(data_dir / f"{db}{suffix}")

    _remove_path(data_dir / "active_save.txt")


@dataclass(frozen=True, slots=True)
class InitState:
    stage: Stage = "idle"
    error: str | None = None
    detail: str | None = None
    progress: float = 0.0
    save_name: str | None = None

    @property
    def running(self) -> bool:
        return self.stage in ("datalake", "static", "icons", "dynamic")

    @property
    def label(self) -> str:
        if self.stage == "dynamic" and self.save_name:
            return f"Loading save: {self.save_name}..."
        return _STAGE_LABEL[self.stage]


class InitJob:
    """Thread-safe holder for the single in-flight (or finished) init run."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = InitState()
        self._thread: threading.Thread | None = None

    def state(self) -> InitState:
        with self._lock:
            return self._state

    def _set(self, **kw: object) -> None:
        with self._lock:
            self._state = replace(self._state, **kw)  # type: ignore[arg-type]

    def start(self, settings: Settings, *, reset: bool = False) -> bool:
        """Begin a rebuild in a daemon thread. Returns False if one is already running.

        When ``reset`` is true the existing game-derived data is wiped before the
        rebuild (see :func:`wipe_game_data`) so a stale patch/mod state is cleared.
        """
        with self._lock:
            if self._state.running:
                return False
            self._state = InitState(stage="datalake")
            self._thread = threading.Thread(
                target=self._run, args=(settings, reset), name="x4-init", daemon=True
            )
            self._thread.start()
            return True

    def _run(self, settings: Settings, reset: bool = False) -> None:
        # Imported lazily — these pull in lxml/Pillow and are only needed during a build.
        from x4_extract.config import resolve_save_path
        from x4_extract.dynamic.catalog import read_info_header
        from x4_extract.dynamic.pipeline import run as run_dynamic
        from x4_extract.static.crawler import run_crawler
        from x4_extract.static.icons import run as rebuild_icons
        from x4_extract.static.pipeline import run as run_static

        def _on_progress(detail: str, prog: float) -> None:
            self._set(detail=detail, progress=prog)

        try:
            if reset:
                # The job is already marked running, so the background refresher's
                # pause_provider has stopped the poller and the dashboard has unmounted
                # behind the full-screen progress gate. Settle briefly to let any
                # in-flight DB handle close, then clear the stale game-derived data.
                self._set(detail="Clearing existing game data...", progress=0.0)
                time.sleep(0.5)
                wipe_game_data(settings)

            # Crawler reports 0.0 → 0.4 internally (three sub-phases totalling 0.4).
            # Scale to 0.0 → 1.0 so the within-stage bar fills proportionally.
            run_crawler(
                settings,
                on_progress=lambda detail, frac: _on_progress(detail, frac / 0.4),
            )

            self._set(stage="static", detail="Preparing static build...", progress=0.0)
            run_static(settings, on_progress=_on_progress)

            self._set(stage="icons", detail="Preparing icons...", progress=0.0)
            rebuild_icons(settings, on_progress=_on_progress)

            if settings.save_path is not None:
                folder = resolve_save_path(settings.save_path)
                saves = sorted(
                    folder.glob("*.xml.gz"), key=lambda p: p.stat().st_mtime, reverse=True
                )
                save_path = saves[0] if saves else None

                if save_path is not None:
                    try:
                        header = read_info_header(save_path)
                        save_name = header.get("save", {}).get("name")
                    except Exception:
                        save_name = None

                    self._set(
                        stage="dynamic",
                        detail="Ingesting newest save...",
                        progress=0.0,
                        save_name=save_name,
                    )
                    run_dynamic(settings, save_path, on_progress=_on_progress)
        except Exception as exc:  # surface any failure to the wizard rather than dying silently
            self._set(stage="error", error=f"{type(exc).__name__}: {exc}")
            return
        self._set(stage="done", progress=1.0, detail="Done")


# Process-global singleton.
job = InitJob()
