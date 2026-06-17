"""Extract player logbook entries from a streamed save.

Structure (probed from save_001.xml.gz):

    savegame(1) → log(2) → entry(3)

Each <entry> has time and title (required), text (usually present, empty string when missing), plus a variable set of optional
attributes: category, faction, entity, money, interact, component, and others.
Known fields get explicit columns; everything else lands in extra_json so no
data is discarded.

Tier: VOLATILE — log entries accumulate continuously during play.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

_ENTRY_DEPTH = 3  # savegame(1) → log(2) → entry(3)

# Attributes that get their own column; everything else → extra_json.
_MAPPED_ATTRS = frozenset({"time", "title", "text", "category", "faction"})


@dataclass(slots=True)
class LogbookEntry:
    time: float
    title: str
    text: str
    category: str | None
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

        category = elem.get("category")
        faction = elem.get("faction")

        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_ATTRS}
        self.rows.append(
            LogbookEntry(
                time=float(time_raw),
                title=title,
                text=text,
                category=category,
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
            INSERT INTO logbook (time, title, text, category, faction, extra_json)
            VALUES (:time, :title, :text, :category, :faction, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
