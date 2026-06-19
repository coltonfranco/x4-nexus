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

Stage = Literal["idle", "datalake", "static", "done", "error"]

# User-facing labels and a rough fraction-complete for each stage, so the wizard can
# render a determinate-ish progress bar without the pipeline reporting fine progress.
_STAGE_LABEL: dict[Stage, str] = {
    "idle": "Not started",
    "datalake": "Extracting game archives (1/2)…",
    "static": "Building static database + icons (2/2)…",
    "done": "Ready",
    "error": "Failed",
}
_STAGE_PROGRESS: dict[Stage, float] = {
    "idle": 0.0,
    "datalake": 0.1,
    "static": 0.55,
    "done": 1.0,
    "error": 0.0,
}


@dataclass(frozen=True, slots=True)
class InitState:
    stage: Stage = "idle"
    error: str | None = None

    @property
    def running(self) -> bool:
        return self.stage in ("datalake", "static")

    @property
    def label(self) -> str:
        return _STAGE_LABEL[self.stage]

    @property
    def progress(self) -> float:
        return _STAGE_PROGRESS[self.stage]


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

        try:
            run_crawler(settings)
            self._set(stage="static")
            run_static(settings)
        except Exception as exc:  # surface any failure to the wizard rather than dying silently
            self._set(stage="error", error=f"{type(exc).__name__}: {exc}")
            return
        self._set(stage="done")


# Process-global singleton.
job = InitJob()
