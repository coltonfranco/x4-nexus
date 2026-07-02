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

import sqlite3
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, fingerprint_for_tier, tables_for_tier
from x4_extract.dynamic.extractors.common import element_attrs, extra_json_from_attrs
from x4_extract.savefile.dispatch import Registration, Target

# Attributes promoted to typed columns. Anything else → extra_json.
_MAPPED_ATTRS = frozenset(
    {"id", "time", "title", "text", "source", "highpriority", "interact", "component", "read"}
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
        self.rows.append(element_attrs(elem))

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier) -> Iterable[tuple[str, str, Mapping[str, object]]]:
        """Keyed by message id; a flipped `read`/`highpriority` flag shows up as
        'changed', a brand-new inbox entry as 'added'."""
        if tier is not Tier.VOLATILE:
            return
        for r in self.rows:
            mid = r.get("id")
            if mid is None:
                continue
            yield "message", str(mid), r

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return tables_for_tier(tier, Tier.VOLATILE, ("player_messages",))

    def fingerprint(self, tier: Tier) -> str:
        return fingerprint_for_tier(tier, Tier.VOLATILE, self.rows)

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
        "extra_json": extra_json_from_attrs(attrs, _MAPPED_ATTRS),
    }
