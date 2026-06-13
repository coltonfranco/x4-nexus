"""Extract dynamic sector state (e.g. player knowledge) from a streamed save.

Sector components are found at depth 9:
    savegame(1) → universe(2) → component[galaxy](3) → connections(4) →
    connection(5) → component[cluster](6) → connections(7) → connection(8) →
    component[sector](9)

Tier: VOLATILE — player knowledge of sectors expands continuously during play.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

_SECTOR_DEPTH = 9


@dataclass(slots=True)
class SectorStateRow:
    sector_id: str
    known_to_player: int
    extra_json: str | None


@dataclass(slots=True)
class SectorsCollector:
    rows: list[SectorStateRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(
                    depth=_SECTOR_DEPTH,
                    tag="component",
                    class_attr="sector",
                    parent_tag="connection",
                ),
                visitor=self._on_sector,
            )
        ]

    def _on_sector(self, elem: etree._Element) -> None:
        sector_id = elem.get("macro")
        if not sector_id:
            return
            
        known_to_player = 1 if elem.get("knownto") == "player" else 0
        
        # We don't need to dump the rest of the attributes here since static map handles
        # sector layout, but we could put them in extra_json if needed. Let's just track knownto.
        
        self.rows.append(
            SectorStateRow(
                sector_id=sector_id,
                known_to_player=known_to_player,
                extra_json=None,
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("sector_state",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO sector_state
                (sector_id, known_to_player, extra_json)
            VALUES (:sector_id, :known_to_player, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
