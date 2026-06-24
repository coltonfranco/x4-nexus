"""Orchestrator: parse one save → write its per-save dynamic.db → materialize routes.

One streaming pass feeds every collector; persistence is tiered. A tier (and its
derived artifacts) is only cleared + rewritten when its combined content fingerprint
differs from the last successful run. The whole pass is skipped when the save file's
source fingerprint is unchanged — the common case while the game is paused between
autosaves.

See dynamic/extractors/meta.py for the collector exemplar and dynamic/collector.py for
the tiered contract.
"""

from __future__ import annotations

import hashlib
import logging
import os
import sqlite3
import time
from datetime import UTC, datetime
from pathlib import Path

from x4_extract.config import ExtractSettings, save_key
from x4_extract.db import apply_schema, open_db
from x4_extract.dynamic import delta
from x4_extract.dynamic.collector import TIERS, Collector, Tier, combined_fingerprint
from x4_extract.dynamic.distance import build_sector_distance
from x4_extract.dynamic.extractors.deployables import DeployablesCollector
from x4_extract.dynamic.extractors.factions import FactionsCollector
from x4_extract.dynamic.extractors.loadouts import ShipLoadoutCollector
from x4_extract.dynamic.extractors.logbook import LogbookCollector
from x4_extract.dynamic.extractors.messages import MessagesCollector
from x4_extract.dynamic.extractors.meta import MetaCollector, StatsCollector
from x4_extract.dynamic.extractors.missions import MissionsCollector
from x4_extract.dynamic.extractors.npcs import NPCsCollector
from x4_extract.dynamic.extractors.player import PlayerCollector
from x4_extract.dynamic.extractors.resources import ResourceAreasCollector
from x4_extract.dynamic.extractors.sectors import SectorsCollector
from x4_extract.dynamic.extractors.positions import load_static_zones
from x4_extract.dynamic.extractors.ships import ShipsCollector
from x4_extract.dynamic.extractors.stations import StationsCollector
from x4_extract.dynamic.materialize import compute_top_routes
from x4_extract.savefile.dispatch import stream_save

log = logging.getLogger("x4_extract.pipeline")

_FINGERPRINT_BLOCK = 1 << 16  # 64 KiB head+tail sample is enough to detect a rewrite

# Bump whenever the set of collectors or the dynamic schema changes. A stored version
# that differs forces a full re-ingest even when the save file itself is unchanged —
# otherwise a newly-added table (e.g. sector_resources) would never be populated for
# saves already ingested under the old pipeline.
_PIPELINE_VERSION = "17"

# Delta entity types tracked in row_state but kept out of the events feed — high-churn,
# low-signal data (player stats tick constantly and aren't worth alerting on).
_SILENT_DELTA_TYPES = frozenset({"stat"})


def dynamic_db_path(settings: ExtractSettings, save_path: Path) -> Path:
    """Per-save dynamic DB location: <data_dir>/dynamic/<save_key>.db."""
    return settings.dynamic_dir / f"{save_key(save_path)}.db"


def build_collectors(settings: ExtractSettings, save_path: Path) -> list[Collector]:
    """Construct the full collector set for one ingest.

    Factored out so the profiler (and any future tooling) streams a save through the
    exact same collectors the pipeline uses, instead of duplicating the list.
    """
    from x4_extract.i18n import Localizer

    with sqlite3.connect(settings.data_dir / "raw.db") as raw_conn:
        localizer = Localizer(raw_conn, "044")

    return [
        MetaCollector(save_path=save_path),
        StatsCollector(),
        MissionsCollector(),
        StationsCollector(localizer=localizer),
        FactionsCollector(),
        LogbookCollector(),
        MessagesCollector(),
        NPCsCollector(),
        ShipLoadoutCollector(),
        DeployablesCollector(),
        PlayerCollector(),
        SectorsCollector(),
        ShipsCollector(),
        ResourceAreasCollector(),
    ]


def run(settings: ExtractSettings, save_path: Path, *, force: bool = False) -> Path:
    """Ingest `save_path` into its per-save dynamic DB. Returns the DB path.

    No-op (returns early) when the save's source fingerprint matches the last run,
    unless `force=True` (used by explicit user activation to guarantee freshness).
    """
    db_path = dynamic_db_path(settings, save_path)
    # Idempotent: also brings pre-existing DBs up to date with newly-added tables.
    apply_schema(settings.data_dir, "dynamic", db_path=db_path)

    st = save_path.stat()
    conn = open_db(settings.data_dir, dynamic_db=db_path)
    try:
        state = _read_ingest_state(conn)
        version_ok = state.get("pipeline_version") == _PIPELINE_VERSION
        # Cheapest possible gate: a pure stat() (mtime + size) — no file open. The common
        # case while the game runs is "unchanged since last ingest", and bailing here means
        # a backstop poll never opens the save file, so it cannot collide with X4 writing it.
        if not force and version_ok and _stat_matches(state, st):
            return db_path

        # Stat moved (or first run): now it's worth opening the file for a content fingerprint.
        source_fp = source_fingerprint(save_path)
        if not force and version_ok and state.get("source") == source_fp:
            # Content is identical despite a touched mtime (rare — e.g. a copy/restore).
            # Record the new stat so the next tick short-circuits on stat alone, then bail.
            with conn:
                _write_stat(conn, st)
            return db_path  # nothing changed since the last successful ingest

        start = time.perf_counter()
        collectors = build_collectors(settings, save_path)
        registrations = [r for c in collectors for r in c.register()]
        load_static_zones(str(settings.data_dir / "static.db"))
        stream_save(save_path, registrations)

        game_time = _game_time_sec(collectors)
        rewritten = 0
        with conn:  # single transaction; WAL keeps API readers live
            # A brand-new save file (quicksave/autosave rotation) starts with an empty
            # row_state, which would make its first ingest a silent cold baseline. Seed it
            # from the most recent same-game predecessor DB so deltas/events continue across
            # the file switch — entity keys are stable within a game, and the full parse cost
            # is unchanged (we always re-stream the whole file regardless).
            if _row_state_is_empty(conn):
                seeded = _seed_row_state_from_predecessor(
                    conn, settings, save_path, _player_name(collectors)
                )
                if seeded:
                    log.info("seeded %d row_state entries from predecessor save", seeded)
            for tier in TIERS:
                new_fp = combined_fingerprint(collectors, tier)
                if version_ok and new_fp == state.get(tier):
                    continue  # this tier's content is unchanged — keep existing rows
                rewritten += 1
                _rewrite_tier(conn, collectors, tier)
                _run_derived(conn, tier)
                # Diff against the prior ingest → append change events. Only runs for a
                # tier that actually changed, so idle refreshes do no delta work.
                delta.compute_and_record(
                    conn, collectors, tier, game_time=game_time, silent_types=_SILENT_DELTA_TYPES
                )
                _write_ingest_state(conn, tier, new_fp)
            elapsed_ms = round((time.perf_counter() - start) * 1000)
            _write_ingest_state(conn, "source", source_fp)
            _write_stat(conn, st)
            _write_ingest_state(conn, "pipeline_version", _PIPELINE_VERSION)
            # Persist the wall-clock cost so the API/dashboard can surface refresh latency.
            _write_ingest_state(conn, "ingest_ms", str(elapsed_ms))
        log.info(
            "ingested %s in %dms (%d/%d tiers rewritten)",
            save_path.name, elapsed_ms, rewritten, len(TIERS),
        )
    finally:
        conn.close()
    return db_path


def _game_time_sec(collectors: list[Collector]) -> float | None:
    """Best-effort in-game time from the meta collector, to stamp delta events."""
    for c in collectors:
        if isinstance(c, MetaCollector):
            t = c.game_time_sec()
            return float(t) if t is not None else None
    return None


def _player_name(collectors: list[Collector]) -> str | None:
    for c in collectors:
        if isinstance(c, MetaCollector):
            return c.player_name()
    return None


def _row_state_is_empty(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT 1 FROM row_state LIMIT 1").fetchone() is None


def _seed_row_state_from_predecessor(
    conn: sqlite3.Connection,
    settings: ExtractSettings,
    save_path: Path,
    player_name: str | None,
) -> int:
    """Copy row_state from the most recent same-game predecessor DB into `conn`.

    Returns the number of rows seeded (0 when no suitable predecessor exists). "Same game"
    is keyed on the player name — cheap and good enough; a mismatch simply falls back to the
    normal silent cold baseline rather than risking a spurious event flood from unrelated keys.
    """
    if not player_name:
        return 0
    own_db = dynamic_db_path(settings, save_path)
    candidates = sorted(
        (p for p in settings.dynamic_dir.glob("*.db") if p != own_db and p.is_file()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for cand in candidates[:5]:  # newest few only; older lineage adds nothing
        try:
            pred = sqlite3.connect(f"file:{cand}?mode=ro", uri=True)
            pred.row_factory = sqlite3.Row
        except sqlite3.Error:
            continue
        try:
            who = pred.execute("SELECT player_name FROM save_meta LIMIT 1").fetchone()
            if who is None or who["player_name"] != player_name:
                continue
            rows = pred.execute(
                "SELECT entity_type, entity_key, row_hash, updated_at FROM row_state"
            ).fetchall()
        except sqlite3.Error:
            continue  # predecessor predates these tables — skip it
        finally:
            pred.close()
        if not rows:
            continue
        conn.executemany(
            "INSERT OR IGNORE INTO row_state (entity_type, entity_key, row_hash, updated_at) "
            "VALUES (?, ?, ?, ?)",
            [(r["entity_type"], r["entity_key"], r["row_hash"], r["updated_at"]) for r in rows],
        )
        return len(rows)
    return 0


def _rewrite_tier(conn: sqlite3.Connection, collectors: list[Collector], tier: Tier) -> None:
    # Table names come from collector code constants, never user input.
    tables = {t for c in collectors for t in c.tables(tier)}
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
    for collector in collectors:
        collector.flush(conn, tier)


def _run_derived(conn: sqlite3.Connection, tier: Tier) -> None:
    if tier is Tier.STRUCTURAL:
        build_sector_distance(conn)
    else:
        compute_top_routes(conn)


def source_fingerprint(save_path: Path) -> str:
    """Cheap change detector: file size + head/tail bytes of the (raw) gz file.

    The .gz container is seekable at the byte level even though its decompressed stream
    is not, so sampling head+tail avoids reading the whole 200 MB+ file just to notice it
    is unchanged.
    """
    st = save_path.stat()
    h = hashlib.sha256()
    h.update(str(st.st_size).encode())
    with save_path.open("rb") as f:
        h.update(f.read(_FINGERPRINT_BLOCK))
        if st.st_size > _FINGERPRINT_BLOCK:
            f.seek(max(0, st.st_size - _FINGERPRINT_BLOCK))
            h.update(f.read(_FINGERPRINT_BLOCK))
    return h.hexdigest()


def _stat_token(st: os.stat_result) -> tuple[str, str]:
    """A cheap (mtime, size) identity for a save file — exact, no file open required."""
    return (str(st.st_mtime_ns), str(st.st_size))


def _stat_matches(state: dict[str, str], st: os.stat_result) -> bool:
    mtime, size = _stat_token(st)
    return state.get("source_mtime") == mtime and state.get("source_size") == size


def _write_stat(conn: sqlite3.Connection, st: os.stat_result) -> None:
    mtime, size = _stat_token(st)
    _write_ingest_state(conn, "source_mtime", mtime)
    _write_ingest_state(conn, "source_size", size)


def _read_ingest_state(conn: sqlite3.Connection) -> dict[str, str]:
    return {
        row["tier"]: row["fingerprint"]
        for row in conn.execute("SELECT tier, fingerprint FROM ingest_state")
    }


def _write_ingest_state(conn: sqlite3.Connection, tier: str, fingerprint: str) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO ingest_state (tier, fingerprint, ingested_at) VALUES (?, ?, ?)",
        (tier, fingerprint, datetime.now(UTC).isoformat()),
    )
