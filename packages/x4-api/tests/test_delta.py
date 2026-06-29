"""Delta engine + alert classification — isolated from the full pipeline.

Drives `delta.compute_and_record` with a fake DeltaSource against an in-memory DB so the
add/change/remove/baseline logic and the alert rules are tested without parsing a save.
"""

from __future__ import annotations

import sqlite3

from x4_extract.dynamic import alerts, delta
from x4_extract.dynamic.collector import Tier


class FakeSource:
    """Minimal DeltaSource: yields a fixed set of (entity_type, key, content) rows."""

    def __init__(self, rows: list[tuple[str, str, dict]]) -> None:
        self._rows = rows

    def keyed_rows(self, tier: Tier):
        if tier is Tier.VOLATILE:
            yield from self._rows


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE row_state (
            entity_type TEXT, entity_key TEXT, row_hash TEXT, updated_at TEXT,
            PRIMARY KEY (entity_type, entity_key)
        );
        CREATE TABLE events (
            id INTEGER PRIMARY KEY AUTOINCREMENT, game_time REAL, real_time TEXT,
            entity_type TEXT, entity_key TEXT, change_kind TEXT, priority TEXT,
            category TEXT, title TEXT, text TEXT, payload_json TEXT
        );
        """
    )
    return conn


def _events(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return conn.execute("SELECT * FROM events ORDER BY id").fetchall()


def _run(conn, rows):
    with conn:
        return delta.compute_and_record(conn, [FakeSource(rows)], Tier.VOLATILE, game_time=1.0)


# ── delta engine ──────────────────────────────────────────────────────────────

def test_first_run_is_silent_baseline() -> None:
    conn = _db()
    n = _run(conn, [("ship", "s1", {"state": "normal"}), ("ship", "s2", {"state": "normal"})])
    assert n == 0  # baseline: no flood of "added" for the whole universe
    assert _events(conn) == []
    assert conn.execute("SELECT COUNT(*) FROM row_state").fetchone()[0] == 2


def test_added_changed_removed() -> None:
    conn = _db()
    _run(conn, [("ship", "s1", {"state": "normal"}), ("ship", "s2", {"state": "normal"})])

    # s1 unchanged, s2 changed (state), s3 added, ... s2 also still present.
    n = _run(conn, [
        ("ship", "s1", {"state": "normal"}),
        ("ship", "s2", {"state": "attacking"}),
        ("ship", "s3", {"state": "normal"}),
    ])
    kinds = {(e["entity_key"], e["change_kind"]) for e in _events(conn)}
    assert n == 2
    assert ("s2", "changed") in kinds
    assert ("s3", "added") in kinds
    assert ("s1", "changed") not in kinds  # unchanged row emits nothing

    # Now drop s2 → 'removed'; nothing else moves.
    conn.execute("DELETE FROM events")
    n = _run(conn, [("ship", "s1", {"state": "normal"}), ("ship", "s3", {"state": "normal"})])
    rows = _events(conn)
    assert [(r["entity_key"], r["change_kind"]) for r in rows] == [("s2", "removed")]
    assert n == 1
    assert conn.execute(
        "SELECT COUNT(*) FROM row_state WHERE entity_key='s2'"
    ).fetchone()[0] == 0  # removed rows are pruned from state


def test_idempotent_no_events_on_identical_reingest() -> None:
    conn = _db()
    rows = [("message", "1", {"id": 1, "title": "Hi", "text": "x"})]
    _run(conn, rows)
    conn.execute("DELETE FROM events")
    n = _run(conn, rows)
    assert n == 0
    assert _events(conn) == []


def test_silent_types_track_state_without_events() -> None:
    conn = _db()
    silent = frozenset({"stat"})

    def run(rows):
        with conn:
            return delta.compute_and_record(
                conn, [FakeSource(rows)], Tier.VOLATILE, game_time=1.0, silent_types=silent
            )

    run([("stat", "kills", {"value": 1}), ("ship", "s1", {"state": "ok"})])
    # Change the silent stat AND the loud ship.
    n = run([("stat", "kills", {"value": 5}), ("ship", "s1", {"state": "hurt"})])
    rows = _events(conn)
    assert n == 1  # only the ship change emitted
    assert [r["entity_type"] for r in rows] == ["ship"]
    # …but the stat's new value is still tracked in row_state.
    h = conn.execute("SELECT row_hash FROM row_state WHERE entity_type='stat'").fetchone()[0]
    assert h == delta.row_hash({"value": 5})


def test_new_entity_type_baselines_independently() -> None:
    """A delta collector added later must not dump its whole population as 'added'."""
    conn = _db()
    _run(conn, [("ship", "s1", {"state": "normal"})])
    conn.execute("DELETE FROM events")
    # 'message' is seen for the first time → silent baseline even though 'ship' is old.
    n = _run(conn, [
        ("ship", "s1", {"state": "normal"}),
        ("message", "1", {"id": 1, "title": "Hi"}),
    ])
    assert n == 0
    assert conn.execute(
        "SELECT COUNT(*) FROM row_state WHERE entity_type='message'"
    ).fetchone()[0] == 1


# ── alert classification ──────────────────────────────────────────────────────

def test_combat_logbook_is_alert() -> None:
    c = alerts.classify("logbook", "added", {"title": "Ship under attack", "text": ""})
    assert c.priority == alerts.ALERT
    assert c.category == "combat"


def test_logbook_alerts_category_is_alert() -> None:
    c = alerts.classify("logbook", "added", {"title": "Notice", "category": "alerts"})
    assert c.priority == alerts.ALERT


def test_routine_logbook_is_info() -> None:
    c = alerts.classify("logbook", "added", {"title": "Trade completed", "category": "news"})
    assert c.priority == alerts.INFO
    assert c.category == "log"


def test_highpriority_message_is_alert() -> None:
    c = alerts.classify("message", "added", {"title": "Memo", "highpriority": 1})
    assert c.priority == alerts.ALERT


def test_hostile_relation_is_warn() -> None:
    c = alerts.classify("faction_relation", "changed",
                        {"faction_id": "argon", "other_faction_id": "player", "relation": -0.8})
    assert c.priority == alerts.WARN
    assert c.category == "diplomacy"


def test_player_ship_loss_is_warn() -> None:
    c = alerts.classify("ship", "removed", {"name": "Bertha", "is_player_owned": 1})
    assert c.priority == alerts.WARN
    assert c.category == "fleet"


def test_npc_ship_loss_is_info() -> None:
    c = alerts.classify("ship", "removed", {"name": "Drone", "is_player_owned": 0})
    assert c.priority == alerts.INFO
