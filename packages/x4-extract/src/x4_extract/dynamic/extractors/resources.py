"""Extract live mineable resources per sector from a streamed X4 save file.

Resources live directly under each sector component (probed against a real save,
quicksave.xml.gz, 2026-06-11):

    component[sector] → resourceareas → area →
        wares  → ware(ware=...) → recharge(max, current, time)
        yields → ware(ware=...) → yield(name)

`recharge current/max` is the depleting/regenerating stockpile the player mines — the
data static extraction cannot provide. A sector can have several `<area>` elements; we
aggregate per (sector, ware), summing current/max so the row reflects the whole sector.

We target the **leaf** elements (`<recharge>`, `<yield>`) and walk up, because the
streaming dispatcher clears child subtrees as it goes — a container element's children
are already gone by the time its own end-event fires (see savefile/dispatch.py). The
`resourceareas` ancestor guard keeps us from matching unrelated `<recharge>` elements
(e.g. shield regen on ships/stations).

Tier: VOLATILE — `current` changes every tick as fields are mined and recharge.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target


def _int(v: str | None) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return None


@dataclass(slots=True)
class SectorResourceRow:
    sector_id: str
    ware: str
    current: int | None
    max: int | None
    yield_tier: str | None
    recharge_time: int | None


@dataclass(slots=True)
class ResourceAreasCollector:
    """Accumulates per-sector mineable resource levels in one streaming pass."""

    rows_by_key: dict[tuple[str, str], SectorResourceRow] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            Registration(target=Target(tag="recharge"), visitor=self._on_recharge),
            Registration(target=Target(tag="yield"), visitor=self._on_yield),
        ]

    def _on_recharge(self, elem: etree._Element) -> None:
        ware_el = elem.getparent()
        if ware_el is None or ware_el.tag != "ware":
            return
        ware = ware_el.get("ware")
        sector_id = self._sector_via_resourceareas(ware_el)
        if not ware or not sector_id:
            return
        row = self._row(sector_id, ware)
        row.current = (row.current or 0) + (_int(elem.get("current")) or 0)
        row.max = (row.max or 0) + (_int(elem.get("max")) or 0)
        time = _int(elem.get("time"))
        if time is not None:
            row.recharge_time = time

    def _on_yield(self, elem: etree._Element) -> None:
        ware_el = elem.getparent()
        if ware_el is None or ware_el.tag != "ware":
            return
        ware = ware_el.get("ware")
        sector_id = self._sector_via_resourceareas(ware_el)
        if not ware or not sector_id:
            return
        row = self._row(sector_id, ware)
        if row.yield_tier is None:
            row.yield_tier = elem.get("name")

    # Walk up from a <ware>: only attribute when a <resourceareas> ancestor is present,
    # and return the enclosing sector's macro id.
    def _sector_via_resourceareas(self, ware_el: etree._Element) -> str | None:
        seen_resourceareas = False
        node: etree._Element | None = ware_el
        for _ in range(6):
            node = node.getparent() if node is not None else None
            if node is None:
                break
            if node.tag == "resourceareas":
                seen_resourceareas = True
            if node.get("class") == "sector":
                return node.get("macro") if seen_resourceareas else None
        return None

    def _row(self, sector_id: str, ware: str) -> SectorResourceRow:
        key = (sector_id, ware)
        row = self.rows_by_key.get(key)
        if row is None:
            row = SectorResourceRow(sector_id, ware, None, None, None, None)
            self.rows_by_key[key] = row
        return row

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("sector_resources",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows_by_key.values())

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE):
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO sector_resources
                (sector_id, ware, current, max, yield_tier, recharge_time)
            VALUES
                (:sector_id, :ware, :current, :max, :yield_tier, :recharge_time)
            """,
            [dataclasses.asdict(r) for r in self.rows_by_key.values()],
        )
