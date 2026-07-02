"""Row-level change detection between two save parses.

The save is re-streamed in full every refresh (gzip isn't seekable), so "stream only
what changed" is delivered here, at the output: each ingest's keyed rows are diffed
against the last run's stored hashes to derive added / changed / removed events, which
are appended to the `events` feed and classified for priority by `alerts.classify`.

Only collectors implementing the `DeltaSource` protocol participate, and the pipeline
calls this only for a tier whose combined fingerprint actually changed — an idle refresh
does no diff work. Per entity type, the first time it is seen establishes a silent
baseline (we record state without flooding the feed with the whole universe as "added");
that also makes newly-added delta collectors backfill cleanly on the next ingest.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime

from x4_extract.dynamic import alerts
from x4_extract.dynamic.collector import Collector, DeltaSource, Tier, row_hash


def compute_and_record(
    conn: sqlite3.Connection,
    collectors: Iterable[Collector],
    tier: Tier,
    *,
    game_time: float | None = None,
    silent_types: frozenset[str] = frozenset(),
) -> int:
    """Diff this run's keyed rows for `tier` against `row_state`; append events.

    Returns the number of events recorded. Must run inside the caller's transaction,
    after the tier's tables have been rewritten.

    `silent_types` are tracked in `row_state` (so their current values are known and a
    future un-silencing won't backfill the whole population) but never emit `events` —
    for high-churn, low-signal data like player stats that shouldn't fill the feed.
    """
    current: dict[tuple[str, str], Mapping[str, object]] = {}
    hashes: dict[tuple[str, str], str] = {}
    entity_types: set[str] = set()
    for collector in collectors:
        if not isinstance(collector, DeltaSource):
            continue
        for entity_type, key, content in collector.keyed_rows(tier):
            ck = (entity_type, key)
            current[ck] = content
            hashes[ck] = row_hash(content)
            entity_types.add(entity_type)

    if not entity_types:
        return 0

    stored = _load_stored(conn, entity_types)
    # An entity type with no stored rows is being seen for the first time → baseline only.
    baseline_types = entity_types - {etype for etype, _ in stored}

    now = datetime.now(UTC).isoformat()
    events: list[tuple[object, ...]] = []

    for ck, content in current.items():
        entity_type, key = ck
        if entity_type in baseline_types or entity_type in silent_types:
            continue  # baseline / silent: state still written below, no event
        old = stored.get(ck)
        if old is None:
            kind = "added"
        elif old != hashes[ck]:
            kind = "changed"
        else:
            continue
        events.append(_event_row(entity_type, key, kind, content, game_time, now))

    for ck in stored.keys() - current.keys():
        entity_type, key = ck
        if entity_type in silent_types:
            continue
        events.append(_event_row(entity_type, key, "removed", None, game_time, now))

    if events:
        conn.executemany(
            """
            INSERT INTO events
                (game_time, real_time, entity_type, entity_key, change_kind,
                 priority, category, title, text, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            events,
        )

    _write_state(conn, hashes, stored.keys() - current.keys(), now)
    return len(events)


def _load_stored(conn: sqlite3.Connection, entity_types: set[str]) -> dict[tuple[str, str], str]:
    placeholders = ",".join("?" * len(entity_types))
    rows = conn.execute(
        "SELECT entity_type, entity_key, row_hash FROM row_state "
        f"WHERE entity_type IN ({placeholders})",
        tuple(entity_types),
    )
    return {(r["entity_type"], r["entity_key"]): r["row_hash"] for r in rows}


def _event_row(
    entity_type: str,
    key: str,
    kind: str,
    content: Mapping[str, object] | None,
    game_time: float | None,
    now: str,
) -> tuple[object, ...]:
    cls = alerts.classify(entity_type, kind, content or {})
    payload = json.dumps(content, sort_keys=True, default=str) if content is not None else None
    return (
        game_time,
        now,
        entity_type,
        key,
        kind,
        cls.priority,
        cls.category,
        cls.title,
        cls.text,
        payload,
    )


def _write_state(
    conn: sqlite3.Connection,
    hashes: Mapping[tuple[str, str], str],
    removed: set[tuple[str, str]],
    now: str,
) -> None:
    conn.executemany(
        """
        INSERT INTO row_state (entity_type, entity_key, row_hash, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(entity_type, entity_key) DO UPDATE SET
            row_hash = excluded.row_hash,
            updated_at = excluded.updated_at
        WHERE row_state.row_hash != excluded.row_hash
        """,
        [(etype, key, h, now) for (etype, key), h in hashes.items()],
    )
    if removed:
        conn.executemany(
            "DELETE FROM row_state WHERE entity_type = ? AND entity_key = ?",
            list(removed),
        )
