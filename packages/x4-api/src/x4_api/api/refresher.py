"""In-process background save watcher for the API server.

Runs `poller.watch_realtime` in a daemon thread so the active save's dynamic DB is
re-ingested automatically whenever X4 writes a save — no separate `x4c watch` process
needed. The pipeline's source fingerprint makes redundant wakeups cheap no-ops, and WAL
keeps API readers live during a rebuild. The client learns what changed by polling
`/api/v1/refresh-status` (see api/v1/refresh.py) and refetching only affected datasets.

The watchdog handles the live case; the periodic backstop poll only exists to catch a
missed filesystem event. Its cadence (and an on/off switch) is runtime-tunable via
`/api/v1/refresh-config` so the user can loosen or disable it — useful because even the
cheap freshness check briefly opens the save file, which on Windows can collide with X4's
own save write. Config is persisted to `<data_dir>/refresh_config.json` so it survives a
server restart.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict, dataclass

from x4_extract.dynamic import poller
from x4_extract.dynamic.poller import PollResult

from x4_api.config import Settings

log = logging.getLogger("x4_api.refresher")

# Floor on the backstop interval — a runaway-fast poll would reintroduce the very save
# collisions this is meant to avoid.
MIN_INTERVAL_SEC = 5


@dataclass(frozen=True, slots=True)
class RefreshConfig:
    interval_enabled: bool  # is the periodic backstop poll on? (watchdog runs regardless)
    interval_sec: int       # seconds between backstop polls when enabled


class BackgroundRefresher:
    """Owns the watcher thread, its stop/wake signals, and its runtime config."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._config = self._load_config()

    # --- config -------------------------------------------------------------------

    @property
    def _config_path(self):
        return self._settings.data_dir / "refresh_config.json"

    def _load_config(self) -> RefreshConfig:
        default = RefreshConfig(
            interval_enabled=self._settings.poll_interval_sec > 0,
            interval_sec=max(MIN_INTERVAL_SEC, self._settings.poll_interval_sec),
        )
        try:
            raw = json.loads(self._config_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return default
        try:
            return RefreshConfig(
                interval_enabled=bool(raw["interval_enabled"]),
                interval_sec=max(MIN_INTERVAL_SEC, int(raw["interval_sec"])),
            )
        except (KeyError, TypeError, ValueError):
            return default

    def _persist(self, cfg: RefreshConfig) -> None:
        try:
            self._settings.data_dir.mkdir(parents=True, exist_ok=True)
            self._config_path.write_text(json.dumps(asdict(cfg)), encoding="utf-8")
        except OSError:
            log.warning("could not persist refresh config", exc_info=True)

    def get_config(self) -> RefreshConfig:
        with self._lock:
            return self._config

    def set_config(
        self, *, interval_enabled: bool | None = None, interval_sec: int | None = None
    ) -> RefreshConfig:
        """Update the backstop cadence and apply it to the running loop immediately."""
        with self._lock:
            cur = self._config
            cfg = RefreshConfig(
                interval_enabled=cur.interval_enabled if interval_enabled is None
                else bool(interval_enabled),
                interval_sec=cur.interval_sec if interval_sec is None
                else max(MIN_INTERVAL_SEC, int(interval_sec)),
            )
            self._config = cfg
        self._persist(cfg)
        self._wake.set()  # break the current wait so the new cadence takes effect now
        return cfg

    def _interval(self) -> float | None:
        with self._lock:
            cfg = self._config
        return float(cfg.interval_sec) if cfg.interval_enabled else None

    # --- lifecycle ----------------------------------------------------------------

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run, name="x4-refresher", daemon=True)
        self._thread.start()
        log.info("background save refresher started")

    def _run(self) -> None:
        try:
            poller.watch_realtime(
                self._settings,
                self._on_tick,
                interval_provider=self._interval,
                stop=self._stop,
                wake=self._wake,
            )
        except Exception:  # a crashing daemon must not take the server down
            log.exception("background refresher stopped on error")

    def _on_tick(self, result: PollResult) -> None:
        if result.ingested:
            log.info("re-ingested %s", result.save_path.name if result.save_path else "?")

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        self._wake.set()  # break the wait immediately instead of waiting out the backstop
        if self._thread is not None:
            self._thread.join(timeout=timeout)
            self._thread = None
        log.info("background save refresher stopped")
