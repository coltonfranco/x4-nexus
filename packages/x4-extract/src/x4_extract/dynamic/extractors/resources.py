"""Extract live mineable resources per sector from a streamed X4 save file.

Game version 9 (June 2026) changed the resource format.  Old saves used nested
``<ware>/<recharge>`` and ``<ware>/<yield>`` elements; v9 stores everything as
attributes on ``<area>`` elements directly:

    <resourceareas>
      <area id="…" yieldid="sphere_large_ore_high_slow" yield="284305" starttime="…">
        <fields/>
      </area>

``yieldid`` encodes the ware and yield tier:
``{shape}_{size}_{ware}_{yield_tier}_{recharge_speed}``.

Tier: VOLATILE — yield values change as fields are mined.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, fingerprint_for_tier, tables_for_tier
from x4_extract.savefile.dispatch import Registration, Target


def _parse_yieldid(yieldid: str) -> tuple[str, str | None] | None:
    """Parse 'sphere_large_ore_high_slow' → ('ore', 'high').  Returns None if unparseable."""
    parts = yieldid.split("_")
    # Known ware names to scan for (longest first to avoid partial matches)
    WARES = [
        "rawscrap",
        "nividium",
        "silicon",
        "hydrogen",
        "methane",
        "helium",
        "ore",
        "ice",
    ]
    for ware in WARES:
        try:
            idx = parts.index(ware)
            # The tier is the next token after the ware
            tier = parts[idx + 1] if idx + 1 < len(parts) else None
            return (ware, tier)
        except ValueError:
            continue
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
    rows_by_key: dict[tuple[str, str], SectorResourceRow] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            Registration(target=Target(tag="area"), visitor=self._on_area),
        ]

    def _on_area(self, elem: etree._Element) -> None:
        parent = elem.getparent()
        if parent is None or parent.tag != "resourceareas":
            return

        yieldid = elem.get("yieldid")
        if not yieldid:
            return

        parsed = _parse_yieldid(yieldid)
        if parsed is None:
            return
        ware, tier = parsed

        yield_val = elem.get("yield")
        current = int(yield_val) if yield_val and yield_val.isdigit() else None

        # Walk up to find the enclosing sector
        sector_id = None
        node = parent.getparent() if parent is not None else None
        for _ in range(6):
            if node is None:
                break
            if node.get("class") == "sector":
                sector_id = node.get("macro")
                break
            node = node.getparent()

        if not sector_id:
            return

        key = (sector_id, ware)
        row = self.rows_by_key.get(key)
        if row is None:
            row = SectorResourceRow(sector_id, ware, 0, None, tier, None)
            self.rows_by_key[key] = row

        if current is not None:
            row.current = (row.current or 0) + current
        if row.yield_tier is None:
            row.yield_tier = tier

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return tables_for_tier(tier, Tier.VOLATILE, ("sector_resources",))

    def fingerprint(self, tier: Tier) -> str:
        return fingerprint_for_tier(
            tier,
            Tier.VOLATILE,
            (dataclasses.asdict(r) for r in self.rows_by_key.values()),
        )

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
