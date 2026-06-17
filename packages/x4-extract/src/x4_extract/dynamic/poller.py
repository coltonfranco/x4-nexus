"""Background poller: keep the active save's dynamic DB fresh.

The dashboard is meant to track a live game on a second monitor, so we re-resolve the
active save each tick (it rotates as the game autosaves) and call the pipeline, which
is a near-no-op when the save file is unchanged. The tiered refresh inside the pipeline
keeps the per-tick cost down when only volatile data moved.

Reporting (typer.echo) stays in the CLI; this module surfaces results via a callback so
the loop logic stays headless and testable.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from lxml.etree import XMLSyntaxError

from x4_extract.config import ExtractSettings, resolve_save_path
from x4_extract.dynamic import pipeline
from x4_extract.dynamic.catalog import db_is_current, resolve_active_save

log = logging.getLogger("x4_extract.poller")

_SAVE_SUFFIXES = (".xml.gz", ".gz", ".xml")

# Raised when we read a save file X4 is still writing: a locked/partial file (OSError), a
# truncated gzip stream (EOFError), or XML that ends mid-element (XMLSyntaxError). All mean
# "try again once the write finishes" — never a reason to crash the watcher.
_INCOMPLETE_READ = (OSError, EOFError, XMLSyntaxError)


@dataclass(frozen=True, slots=True)
class PollResult:
    save_path: Path | None
    db_path: Path | None
    ingested: bool  # True when this tick actually (re)built the DB


def poll_once(settings: ExtractSettings) -> PollResult:
    """Resolve the active save and ensure its DB is current. Returns what happened."""
    try:
        save = resolve_active_save(settings)
    except FileNotFoundError:
        return PollResult(None, None, False)
    if save is None:
        return PollResult(None, None, False)

    try:
        was_current = db_is_current(settings, save)
        db = pipeline.run(settings, save)
    except _INCOMPLETE_READ as exc:
        # The save file is still being written (locked, truncated, or mid-element). Skip this
        # tick without touching the DB; the next watchdog wake or backstop poll picks it up
        # once the write completes. A partial read must never ingest stale/garbage or crash
        # the loop — meanwhile the API keeps serving the last fully-ingested save.
        log.debug("save read skipped (%s); will retry next tick", exc)
        return PollResult(save, None, False)
    return PollResult(save, db, not was_current)


def watch(
    settings: ExtractSettings,
    on_tick: Callable[[PollResult], None],
    *,
    interval: int | None = None,
    iterations: int | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Poll forever (or `iterations` times), invoking `on_tick` with each result.

    `iterations` and `sleep` are injectable so tests can run a bounded loop without
    real delays.
    """
    every = interval if interval is not None else settings.poll_interval_sec
    count = 0
    while iterations is None or count < iterations:
        on_tick(poll_once(settings))
        count += 1
        if iterations is not None and count >= iterations:
            break
        sleep(every)


def watch_realtime(
    settings: ExtractSettings,
    on_tick: Callable[[PollResult], None],
    *,
    fallback_interval: int | None = None,
    interval_provider: Callable[[], float | None] | None = None,
    stop: threading.Event | None = None,
    wake: threading.Event | None = None,
) -> None:
    """Event-driven watch: react to save-file writes within ~1s via the OS, with a
    periodic safety poll as a backstop.

    Uses `watchdog` to wake on filesystem events in the save folder; the per-save source
    fingerprint inside `pipeline.run` debounces the burst of events X4 emits per write, so
    a redundant wake is a cheap no-op. When watchdog is missing or the save folder can't be
    resolved yet (e.g. first launch before any save exists), it degrades to a plain interval
    poll — the loop must survive a folder that appears later.

    The backstop cadence is read every iteration via `interval_provider` (so a host can
    retune or disable it at runtime). Returning `None` disables the periodic poll entirely —
    the loop then waits indefinitely for a watchdog event (or `wake`). Without a provider it
    falls back to the static `fallback_interval`/`poll_interval_sec`.

    `stop`/`wake` let a host process (the API's background thread) shut the loop down
    promptly: set `stop` then `wake` to break out of the wait without waiting for the
    backstop interval.
    """
    static_every = fallback_interval if fallback_interval is not None else settings.poll_interval_sec

    def _timeout() -> float | None:
        return interval_provider() if interval_provider is not None else static_every

    stop = stop or threading.Event()
    wake = wake or threading.Event()

    observer = None
    try:
        from watchdog.events import FileSystemEventHandler  # noqa: PLC0415 — optional dep
        from watchdog.observers import Observer  # noqa: PLC0415

        folder = resolve_save_path(settings.save_path)

        class _Handler(FileSystemEventHandler):
            def on_any_event(self, event: object) -> None:
                paths = (getattr(event, "src_path", ""), getattr(event, "dest_path", ""))
                if any(str(p).endswith(_SAVE_SUFFIXES) for p in paths):
                    wake.set()

        observer = Observer()
        observer.schedule(_Handler(), str(folder), recursive=False)
        observer.start()
    except (ImportError, FileNotFoundError):
        observer = None  # interval-only: `wake` simply times out every `every` seconds

    try:
        on_tick(poll_once(settings))  # ingest current state immediately on startup
        while not stop.is_set():
            # `None` waits indefinitely (watchdog-only); else poll when the interval elapses.
            wake.wait(timeout=_timeout())  # returns early on a save write (or stop), else polls
            wake.clear()
            if stop.is_set():
                break
            on_tick(poll_once(settings))
    finally:
        if observer is not None:
            observer.stop()
            observer.join()
