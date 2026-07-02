"""Classify a delta event into a priority + category for the telemetry feed.

Pure rules, no I/O — given (entity_type, change_kind, content) the delta engine asks
this module how to present the event. Combat-critical signals (a logbook entry about an
attack, a high-priority message, a lost ship) become `alert`; routine churn is `info`.

Extensible by design: add an entity type by extending the dispatch in `classify`, or
broaden combat detection by adding to `_COMBAT_KEYWORDS` / `_COMBAT_LOG_CATEGORIES`.
The X4 logbook tags danger entries with category "alerts" and titles like "Under
attack"/"... destroyed", so we match on both category and keywords for robustness.
"""

from __future__ import annotations

import contextlib
from collections.abc import Mapping
from dataclasses import dataclass

# Priorities, most severe last. Consumers filter the feed with these.
INFO = "info"
WARN = "warn"
ALERT = "alert"

_COMBAT_KEYWORDS = (
    "attack",
    "under fire",
    "destroyed",
    "killed",
    "boarding",
    "boarded",
    "bail",
    "distress",
    "hull critical",
    "lost",
)
_COMBAT_LOG_CATEGORIES = frozenset({"alerts"})
# Below this relation a faction is effectively hostile (X4 scale is -1..1).
_HOSTILE_RELATION = -0.25


@dataclass(frozen=True, slots=True)
class Classification:
    priority: str
    category: str
    title: str | None
    text: str | None


def _looks_combat(*parts: object) -> bool:
    blob = " ".join(str(p) for p in parts if p).lower()
    return any(kw in blob for kw in _COMBAT_KEYWORDS)


def classify(entity_type: str, change_kind: str, content: Mapping[str, object]) -> Classification:
    """Map a single delta event to its presentation. `content` is None-safe via .get()."""
    if entity_type == "logbook":
        title = _s(content.get("title"))
        text = _s(content.get("text"))
        category = _s(content.get("category"))
        if category in _COMBAT_LOG_CATEGORIES or _looks_combat(title, text, category):
            return Classification(ALERT, "combat", title, text)
        return Classification(INFO, "log", title, text)

    if entity_type == "message":
        title = _s(content.get("title"))
        text = _s(content.get("text"))
        if change_kind == "added":
            if _looks_combat(title, text):
                return Classification(ALERT, "combat", title, text)
            if _truthy(content.get("highpriority")):
                return Classification(ALERT, "message", title, text)
            return Classification(INFO, "message", title, text)
        return Classification(INFO, "message", title, text)  # e.g. marked read

    if entity_type == "ship":
        name = _s(content.get("name")) or _s(content.get("ship_id"))
        player = _truthy(content.get("is_player_owned"))
        if change_kind == "removed":
            # A player ship vanishing is almost always a loss; NPC churn is noise.
            return Classification(WARN if player else INFO, "fleet", f"Ship lost: {name}", None)
        if change_kind == "added":
            return Classification(INFO, "fleet", f"New ship: {name}", None)
        return Classification(INFO, "fleet", f"Ship updated: {name}", _s(content.get("state")))

    if entity_type == "faction_relation":
        rel = _f(content.get("relation"))
        a = _s(content.get("faction_id"))
        b = _s(content.get("other_faction_id"))
        hostile = rel is not None and rel <= _HOSTILE_RELATION
        return Classification(
            WARN if hostile else INFO,
            "diplomacy",
            f"Relation {a} → {b}",
            f"now {rel}" if rel is not None else None,
        )

    if entity_type == "player":
        credits = content.get("credits")
        return Classification(INFO, "economy", "Account updated", f"credits {credits}")

    if entity_type == "mission":
        name = _s(content.get("name"))
        verb = {"added": "New mission", "removed": "Mission ended"}.get(
            change_kind, "Mission updated"
        )
        return Classification(INFO, "mission", f"{verb}: {name}", _s(content.get("faction")))

    if entity_type == "mission_offer":
        return Classification(INFO, "mission", f"Mission offer: {_s(content.get('name'))}", None)

    if entity_type == "stat":
        return Classification(INFO, "stat", _s(content.get("stat_id")), _s(content.get("value")))

    if entity_type == "station_offer":
        side = _s(content.get("side"))
        ware = _s(content.get("ware_id"))
        verb = {"added": "New", "removed": "Closed"}.get(change_kind, "Updated")
        return Classification(
            INFO,
            "economy",
            f"{verb} {side} offer: {ware}",
            f"{content.get('quantity')} @ {content.get('price')}",
        )

    return Classification(INFO, entity_type, None, None)


def _s(v: object) -> str | None:
    return None if v is None else str(v)


def _f(v: object) -> float | None:
    try:
        return float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _truthy(v: object) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, int | float | str | bytes | bytearray):
        with contextlib.suppress(ValueError):
            return int(v) != 0
    try:
        return bool(v)
    except TypeError:
        return bool(v)
