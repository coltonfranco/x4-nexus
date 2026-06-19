"""Extract current faction-to-faction relations from a streamed save.

Probed structure (autosave_02.xml.gz):

    savegame(1) → universe(2) → factions(3)
        → faction(4) id="player"
            → relations(5)
                → relation(6) faction="terran" relation="0.01"
                → booster(6)  faction="terran" relation="0.188509" time="95046"

The `<relation>` element carries the gamestart baseline or reference value.
The `<booster>` element (when present) carries the *actual* current dynamic
relation — this is what the game displays in the HUD.  This collector captures
both and resolves booster over relation when both exist for the same pair.

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
_MAPPED_RELATION_ATTRS = frozenset({"faction", "relation", "time"})


@dataclass(slots=True)
class RelationRow:
    faction_id: str
    other_faction_id: str
    relation: float
    extra_json: str | None


@dataclass(slots=True)
class FactionsCollector:
    # Dict keyed by (faction_id, other_faction_id) — boosters overwrite relations
    # so the final value for a pair is always the booster when present.
    _rows: dict[tuple[str, str], RelationRow] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="relation", depth=_RELATION_DEPTH, parent_tag="relations"),
                visitor=self._on_relation,
            ),
            Registration(
                target=Target(tag="booster", depth=_RELATION_DEPTH, parent_tag="relations"),
                visitor=self._on_relation,  # same logic, booster overwrites
            ),
        ]

    def _on_relation(self, elem: etree._Element) -> None:
        other = elem.get("faction")
        value = elem.get("relation")
        if other is None or value is None:
            return

        # relation/booster(6) → relations(5) → faction(4)
        relations = elem.getparent()
        faction = relations.getparent() if relations is not None else None
        owner = faction.get("id") if faction is not None else None
        if owner is None:
            return

        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_RELATION_ATTRS}
        key = (owner, other)
        self._rows[key] = RelationRow(
            faction_id=owner,
            other_faction_id=other,
            relation=float(value),
            extra_json=json.dumps(extra, sort_keys=True) if extra else None,
        )

    @property
    def rows(self) -> list[RelationRow]:
        return list(self._rows.values())

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier):
        """Keyed by the ordered faction pair; a shifted relation value is a 'changed'
        diplomacy event (turning hostile is flagged WARN by the alert rules)."""
        if tier is not Tier.VOLATILE:
            return
        for r in self.rows:
            yield "faction_relation", f"{r.faction_id}>{r.other_faction_id}", {
                "faction_id": r.faction_id,
                "other_faction_id": r.other_faction_id,
                "relation": r.relation,
            }

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("faction_relations_current",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self._rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO faction_relations_current
                (faction_id, other_faction_id, relation, extra_json)
            VALUES (:faction_id, :other_faction_id, :relation, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self._rows.values()],
        )
