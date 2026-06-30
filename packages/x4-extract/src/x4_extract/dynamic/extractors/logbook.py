"""Extract player logbook entries from a streamed save.

Structure (probed from save_001.xml.gz):

    savegame(1) → log(2) → entry(3)

Each <entry> has time and title (required), text (usually present, empty string when missing), plus a variable set of optional
attributes: category, faction, entity, money, interact, component, and others.
Known fields get explicit columns; everything else lands in extra_json so no
data is discarded.

Classification: entries are classified at extraction time using pattern-matching
rules from ``logbook_rules.json``.  The resolved semantic category and subcategory
overwrite the game's native ``category`` attribute (which is preserved in
``extra_json.game_category``).  Rules are loaded once at module level.

Tier: VOLATILE — log entries accumulate continuously during play.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field
from importlib import resources
from typing import Any

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

_ENTRY_DEPTH = 3  # savegame(1) → log(2) → entry(3)

# Attributes that get their own column; everything else → extra_json.
_MAPPED_ATTRS = frozenset({"time", "title", "text", "category", "faction"})


def _load_rules() -> dict[str, Any]:
    """Load the classification rules once at module level."""
    try:
        raw = resources.files("x4_extract.data").joinpath("logbook_rules.json").read_text()
    except (FileNotFoundError, ModuleNotFoundError):
        return {}
    return json.loads(raw)


def _build_matchers(rules: dict[str, Any]) -> list[tuple[str, str, list[str] | None, str]]:
    """Flatten rules into ordered (category, subcategory, native_exclude, pattern) tuples."""
    matchers: list[tuple[str, str, list[str] | None, str]] = []
    for cat_key, cat in rules.get("categories", {}).items():
        for sub_key, sub in cat.get("subcategories", {}).items():
            native_exclude = sub.get("native_exclude")
            for pattern in sub.get("patterns", []):
                matchers.append((cat_key, sub_key, native_exclude, pattern.lower()))
    return matchers


# Module-level: loaded once on first import.
_RULES: dict[str, Any] = {}
_MATCHERS: list[tuple[str, str, list[str] | None, str]] = []
_NATIVE_FALLBACK: dict[str, list[str]] = {}


def _init_classifier() -> None:
    global _RULES, _MATCHERS, _NATIVE_FALLBACK
    if _MATCHERS:
        return  # already initialised
    _RULES = _load_rules()
    _MATCHERS = _build_matchers(_RULES)
    _NATIVE_FALLBACK = {
        k.lower(): v for k, v in _RULES.get("native_fallback", {}).items()
    }


def classify_entry(title: str, native_category: str | None) -> tuple[str, str]:
    """Resolve semantic (category, subcategory) for a logbook entry.

    Pattern matching on the lowercased title takes priority.  Falls back to
    ``native_fallback`` when the game assigned a recognised category, otherwise
    returns ``("other", "other")``.
    """
    _init_classifier()
    tlower = title.lower()
    native_lower = native_category.lower() if native_category else None
    for cat_key, sub_key, native_exclude, pattern in _MATCHERS:
        # Skip this rule if the native category is in the exclude list
        if native_exclude and native_lower and native_lower in native_exclude:
            continue
        if pattern in tlower:
            return cat_key, sub_key

    # No pattern matched — try the game's native category
    if native_category:
        nf = _NATIVE_FALLBACK.get(native_category.lower())
        if nf:
            return nf[0], nf[1]

    return "other", "other"


@dataclass(slots=True)
class LogbookEntry:
    time: float
    title: str
    text: str
    category: str
    subcategory: str
    faction: str | None
    extra_json: str | None


@dataclass(slots=True)
class LogbookCollector:
    rows: list[LogbookEntry] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="entry", depth=_ENTRY_DEPTH, parent_tag="log"),
                visitor=self._on_entry,
            ),
        ]

    def _on_entry(self, elem: etree._Element) -> None:
        time_raw = elem.get("time")
        title = elem.get("title")
        if time_raw is None or title is None:
            return
        text = elem.get("text") or ""

        native_category = elem.get("category")
        faction = elem.get("faction")

        # Resolve semantic category + subcategory from classification rules.
        resolved_cat, resolved_sub = classify_entry(title, native_category)

        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_ATTRS}
        # Preserve the game's original category for debugging / future re-runs.
        if native_category:
            extra["game_category"] = native_category
        self.rows.append(
            LogbookEntry(
                time=float(time_raw),
                title=title,
                text=text,
                category=resolved_cat,
                subcategory=resolved_sub,
                faction=faction,
                extra_json=json.dumps(extra, sort_keys=True) if extra else None,
            )
        )

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier):
        """Logbook entries are append-only and immutable, so each is identified by its
        (time, title) — new entries surface as 'added', the source of combat alerts."""
        if tier is not Tier.VOLATILE:
            return
        for r in self.rows:
            yield "logbook", f"{r.time}|{r.title}", dataclasses.asdict(r)

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("logbook",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self.rows:
            return
        conn.executemany(
            """
            INSERT INTO logbook (time, title, text, category, subcategory, faction, extra_json)
            VALUES (:time, :title, :text, :category, :subcategory, :faction, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
