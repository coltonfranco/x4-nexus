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
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from x4_extract.config import ExtractSettings, save_key
from x4_extract.db import apply_schema, open_db
from x4_extract.dynamic.collector import TIERS, Collector, Tier, combined_fingerprint
from x4_extract.dynamic.distance import build_sector_distance
from x4_extract.dynamic.extractors.factions import FactionsCollector
from x4_extract.dynamic.extractors.meta import MetaCollector
from x4_extract.dynamic.extractors.player import PlayerCollector
from x4_extract.dynamic.extractors.resources import ResourceAreasCollector
from x4_extract.dynamic.extractors.ships import ShipsCollector
from x4_extract.dynamic.extractors.stations import StationsCollector
from x4_extract.dynamic.materialize import compute_top_routes
from x4_extract.savefile.dispatch import stream_save

_FINGERPRINT_BLOCK = 1 << 16  # 64 KiB head+tail sample is enough to detect a rewrite

# Bump whenever the set of collectors or the dynamic schema changes. A stored version
# that differs forces a full re-ingest even when the save file itself is unchanged —
# otherwise a newly-added table (e.g. sector_resources) would never be populated for
# saves already ingested under the old pipeline.
_PIPELINE_VERSION = "3"


def dynamic_db_path(settings: ExtractSettings, save_path: Path) -> Path:
    """Per-save dynamic DB location: <data_dir>/dynamic/<save_key>.db."""
    return settings.dynamic_dir / f"{save_key(save_path)}.db"


def run(settings: ExtractSettings, save_path: Path) -> Path:
    """Ingest `save_path` into its per-save dynamic DB. Returns the DB path.

    No-op (returns early) when the save's source fingerprint matches the last run.
    """
    db_path = dynamic_db_path(settings, save_path)
    # Idempotent: also brings pre-existing DBs up to date with newly-added tables.
    apply_schema(settings.data_dir, "dynamic", db_path=db_path)

    source_fp = source_fingerprint(save_path)
    conn = open_db(settings.data_dir, dynamic_db=db_path)
    try:
        state = _read_ingest_state(conn)
        version_ok = state.get("pipeline_version") == _PIPELINE_VERSION
        if version_ok and state.get("source") == source_fp:
            return db_path  # nothing changed since the last successful ingest

        collectors: list[Collector] = [
            MetaCollector(save_path=save_path),
            StationsCollector(),
            FactionsCollector(),
            PlayerCollector(),
            ShipsCollector(),
            ResourceAreasCollector(),
        ]
        registrations = [r for c in collectors for r in c.register()]
        stream_save(save_path, registrations)

        with conn:  # single transaction; WAL keeps API readers live
            for tier in TIERS:
                new_fp = combined_fingerprint(collectors, tier)
                if version_ok and new_fp == state.get(tier):
                    continue  # this tier's content is unchanged — keep existing rows
                _rewrite_tier(conn, collectors, tier)
                _run_derived(conn, tier)
                _write_ingest_state(conn, tier, new_fp)
            _write_ingest_state(conn, "source", source_fp)
            _write_ingest_state(conn, "pipeline_version", _PIPELINE_VERSION)
    finally:
        conn.close()
    return db_path


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
