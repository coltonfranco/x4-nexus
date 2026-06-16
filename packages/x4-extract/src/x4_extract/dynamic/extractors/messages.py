"""Extract player message inbox from a streamed save.

Probed structure (save_001.xml.gz, game 9.00):

    savegame(1) → messages(2) → entry(3) id="1" time="1440.156" title="..."
        source="Rachael Liang" text="Dear Sir,..." highpriority="1"
        interact="guidance" component="[0x2e752]" read="1"

All attributes are optional except `id`, `time`, `title`, `text`, and `source`.
The collector captures every attribute verbatim; known fields get typed columns,
everything else goes into `extra_json`.

Tier: VOLATILE — new messages can arrive during play.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

# Attributes promoted to typed columns. Anything else → extra_json.
_MAPPED_ATTRS = frozenset(
    {"id", "time", "title", "text", "source",
     "highpriority", "interact", "component", "read"}
)


@dataclass(slots=True)
class MessagesCollector:
    rows: list[dict[str, str]] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="entry", depth=None, parent_tag="messages"),
                visitor=self._on_entry,
            ),
        ]

    def _on_entry(self, elem: etree._Element) -> None:
        self.rows.append(dict(elem.attrib))

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("player_messages",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE or not self.rows:
            return ""
        return hash_rows(self.rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO player_messages
                (id, time, title, text, source,
                 highpriority, interact, component, read, extra_json)
            VALUES (:id, :time, :title, :text, :source,
                    :highpriority, :interact, :component, :read, :extra_json)
            """,
            [_row_with_extra(r) for r in self.rows],
        )


def _row_with_extra(attrs: dict[str, str]) -> dict[str, object]:
    extra = {k: v for k, v in attrs.items() if k not in _MAPPED_ATTRS}
    return {
        "id": int(attrs.get("id", 0)),
        "time": float(attrs.get("time", 0)),
        "title": attrs.get("title"),
        "text": attrs.get("text"),
        "source": attrs.get("source"),
        "highpriority": int(attrs["highpriority"]) if "highpriority" in attrs else None,
        "interact": attrs.get("interact"),
        "component": attrs.get("component"),
        "read": int(attrs["read"]) if "read" in attrs else None,
        "extra_json": json.dumps(extra, sort_keys=True) if extra else None,
    }
