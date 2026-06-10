"""Extract current faction-to-faction relations from a streamed save.

Probed structure (autosave_02.xml.gz):

    savegame(1) → universe(2) → factions(3)
        → faction(4) id="argon"
            → relations(5) → relation(6) faction="teladi" relation="-0.3"
            → licences(5)  → licence(6)  type="capitalship" factions="argon player"
            → account(5)   amount="..."

`relation` is on a -1..1 scale, the same scale as static `s.faction_relations`, so the
API can COALESCE current over initial directly. The owning faction is the depth-4
`<faction id=>`; the related faction + value live on each `<relation>`.

Tier: VOLATILE — relations shift continuously during play.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

_RELATION_DEPTH = 6
_MAPPED_RELATION_ATTRS = frozenset({"faction", "relation"})


@dataclass(slots=True)
class RelationRow:
    faction_id: str
    other_faction_id: str
    relation: float
    extra_json: str | None


@dataclass(slots=True)
class FactionsCollector:
    rows: list[RelationRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="relation", depth=_RELATION_DEPTH, parent_tag="relations"),
                visitor=self._on_relation,
            ),
        ]

    def _on_relation(self, elem: etree._Element) -> None:
        other = elem.get("faction")
        value = elem.get("relation")
        if other is None or value is None:
            return

        # relation(6) → relations(5) → faction(4)
        relations = elem.getparent()
        faction = relations.getparent() if relations is not None else None
        owner = faction.get("id") if faction is not None else None
        if owner is None:
            return

        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_RELATION_ATTRS}
        self.rows.append(
            RelationRow(
                faction_id=owner,
                other_faction_id=other,
                relation=float(value),
                extra_json=json.dumps(extra, sort_keys=True) if extra else None,
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("faction_relations_current",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO faction_relations_current
                (faction_id, other_faction_id, relation, extra_json)
            VALUES (:faction_id, :other_faction_id, :relation, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
