"""Background first-run initialization job.

The static build (datalake crawl → transform → icons) takes minutes, so the setup
wizard can't block an HTTP request on it. This module runs it in a daemon thread and
exposes coarse progress (which stage, done/error) for the wizard to poll via
``/api/v1/setup/status``.

Only one init may run at a time. The job is a process-global singleton because there
is exactly one app and one data directory.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, replace
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

    def start(self, settings: Settings) -> bool:
        """Begin a rebuild in a daemon thread. Returns False if one is already running."""
        with self._lock:
            if self._state.running:
                return False
            self._state = InitState(stage="datalake")
            self._thread = threading.Thread(
                target=self._run, args=(settings,), name="x4-init", daemon=True
            )
            self._thread.start()
            return True

    def _run(self, settings: Settings) -> None:
        # Imported lazily — these pull in lxml/Pillow and are only needed during a build.
        from x4_extract.static.crawler import run_crawler
        from x4_extract.static.pipeline import run as run_static
        from x4_extract.static.icons import run as rebuild_icons
        from x4_extract.dynamic.pipeline import run as run_dynamic
        from x4_extract.config import resolve_save_path
        from x4_extract.dynamic.catalog import read_info_header

        def _on_progress(detail: str, prog: float) -> None:
            self._set(detail=detail, progress=prog)

        try:
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
                saves = sorted(folder.glob("*.xml.gz"), key=lambda p: p.stat().st_mtime, reverse=True)
                save_path = saves[0] if saves else None

                if save_path is not None:
                    try:
                        header = read_info_header(save_path)
                        save_name = header.get("save", {}).get("name")
                    except Exception:
                        save_name = None

                    self._set(stage="dynamic", detail="Ingesting newest save...", progress=0.0, save_name=save_name)
                    run_dynamic(settings, save_path, on_progress=_on_progress)
        except Exception as exc:  # surface any failure to the wizard rather than dying silently
            self._set(stage="error", error=f"{type(exc).__name__}: {exc}")
            return
        self._set(stage="done", progress=1.0, detail="Done")


# Process-global singleton.
job = InitJob()
