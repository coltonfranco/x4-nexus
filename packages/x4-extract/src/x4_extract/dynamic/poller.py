"""Background poller: keep the active save's dynamic DB fresh.

The dashboard is meant to track a live game on a second monitor, so we re-resolve the
active save each tick (it rotates as the game autosaves) and call the pipeline, which
is a near-no-op when the save file is unchanged. The tiered refresh inside the pipeline
keeps the per-tick cost down when only volatile data moved.

Reporting (typer.echo) stays in the CLI; this module surfaces results via a callback so
the loop logic stays headless and testable.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from x4_extract.config import ExtractSettings
from x4_extract.dynamic import pipeline
from x4_extract.dynamic.catalog import db_is_current, resolve_active_save


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

    was_current = db_is_current(settings, save)
    db = pipeline.run(settings, save)
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
