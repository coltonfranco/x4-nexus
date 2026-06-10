"""Extract station and station_offer rows from a streamed X4 save file.

Actual depth found by probing a real save (autosave_02.xml.gz, 2026-06-08):

    savegame(1) → universe(2) → component[galaxy](3) → connections(4) →
    connection(5) → component[cluster](6) → connections(7) → connection(8) →
    component[sector](9) → connections(10) → connection(11) →
    component[zone](12) → connections(13) → connection(14) →
    component[station](15)

AGENTS.md §5.2 guesses depth=5. The actual depth is 15 because each level of
the universe hierarchy (galaxy→cluster→sector→zone→station) is wrapped in a
`<connections>/<connection>` pair, adding 2 levels per hop beyond the galaxy
root at depth 3.

Trade offers are NOT in the station's `<connections>` subtree as §5.2 suggests.
They live in `<trade>/<offers>/<production>/<trade>` directly under the station,
so offer elements are at depth 19. `<connections>` is empty for low-attention
(distant) stations; all offer data lives under the `<trade>` child.

Side is inferred from which of `buyer`/`seller` matches the station id.

Tiers: station rows are STRUCTURAL (layout changes rarely); offers are VOLATILE.
Module/construction/state extraction is pending a dedicated probe (see plan §4).
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from x4_extract.i18n import Localizer

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

# Depths confirmed against a real save; fragile only if Egosoft restructures the
# universe hierarchy or wraps stations in an extra container.
_STATION_DEPTH = 15
_OFFER_DEPTH = 19

# Station <component> attrs promoted to columns; the rest go to extra_json.
_MAPPED_STATION_ATTRS = frozenset({"id", "code", "name", "macro", "owner", "state"})


@dataclass(slots=True)
class StationRow:
    station_id: str
    code: str | None
    name: str | None
    macro: str | None
    owner_faction: str | None
    sector_id: str | None
    zone_id: str | None
    x: float | None
    y: float | None
    z: float | None
    state: str | None
    build_pct: float | None
    is_player_owned: int
    is_under_construction: int
    extra_json: str | None


@dataclass(slots=True)
class OfferRow:
    station_id: str
    ware_id: str
    side: str
    price: int
    quantity: int
    last_seen_tick: int | None


@dataclass(slots=True)
class StationsCollector:
    """Accumulates stations and their trade offers in a single streaming pass."""

    localizer: Localizer | None = None
    station_rows: list[StationRow] = field(default_factory=list)
    offer_rows: list[OfferRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(
                    depth=_STATION_DEPTH,
                    tag="component",
                    class_attr="station",
                    parent_tag="connection",
                ),
                visitor=self._on_station,
            ),
            Registration(
                target=Target(
                    depth=_OFFER_DEPTH,
                    tag="trade",
                    parent_tag="production",
                ),
                visitor=self._on_offer,
            ),
        ]

    def _on_station(self, elem: etree._Element) -> None:
        sector_id: str | None = None
        zone_id: str | None = None
        ancestor: etree._Element | None = elem
        for _ in range(9):
            ancestor = ancestor.getparent() if ancestor is not None else None
            if ancestor is None:
                break
            cls = ancestor.get("class", "")
            if cls == "zone":
                zone_id = ancestor.get("macro")
            elif cls == "sector":
                sector_id = ancestor.get("macro")
                break  # sector is the deepest we need

        name = elem.get("name")
        if name and self.localizer:
            name = self.localizer.resolve(name)

        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_STATION_ATTRS}
        self.station_rows.append(
            StationRow(
                station_id=elem.get("id") or "",
                code=elem.get("code"),
                name=name,
                macro=elem.get("macro"),
                owner_faction=elem.get("owner"),
                sector_id=sector_id,
                zone_id=zone_id,
                x=None,
                y=None,
                z=None,
                state=elem.get("state"),
                build_pct=None,
                is_player_owned=int(elem.get("owner") == "player"),
                is_under_construction=0,
                extra_json=json.dumps(extra, sort_keys=True) if extra else None,
            )
        )

    def _on_offer(self, elem: etree._Element) -> None:
        # Walk: trade(19)→production(18)→offers(17)→trade(16)→component[station](15)
        ancestor: etree._Element | None = elem
        for _ in range(4):
            if ancestor is None:
                return
            ancestor = ancestor.getparent()
        if ancestor is None or ancestor.get("class") != "station":
            return

        station_id = ancestor.get("id") or ""
        ware_id = elem.get("ware")
        if not ware_id:
            return

        buyer = elem.get("buyer")
        seller = elem.get("seller")
        if buyer == station_id:
            side = "buy"
        elif seller == station_id:
            side = "sell"
        else:
            return

        price_s = elem.get("price")
        amount_s = elem.get("amount")
        if price_s is None or amount_s is None:
            return

        self.offer_rows.append(
            OfferRow(
                station_id=station_id,
                ware_id=ware_id,
                side=side,
                # Saves store trade prices in centi-credits (ore 5092 = 50.92 cr); the
                # static ware catalog (price_avg) is in credits. Normalize to credits so
                # routes/economy compare apples to apples. See docs/save-structure.md.
                price=round(int(price_s) / 100),
                quantity=int(amount_s),
                last_seen_tick=None,
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        if tier is Tier.STRUCTURAL:
            return ("stations",)
        return ("station_offers",)

    def fingerprint(self, tier: Tier) -> str:
        rows = self.station_rows if tier is Tier.STRUCTURAL else self.offer_rows
        return hash_rows(dataclasses.asdict(r) for r in rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier in (None, Tier.STRUCTURAL):
            conn.executemany(
                """
                INSERT OR REPLACE INTO stations
                    (station_id, code, name, macro, owner_faction, sector_id, zone_id,
                     x, y, z, state, build_pct, is_player_owned, is_under_construction,
                     extra_json)
                VALUES
                    (:station_id, :code, :name, :macro, :owner_faction, :sector_id, :zone_id,
                     :x, :y, :z, :state, :build_pct, :is_player_owned, :is_under_construction,
                     :extra_json)
                """,
                [dataclasses.asdict(r) for r in self.station_rows],
            )
        if tier in (None, Tier.VOLATILE):
            conn.executemany(
                """
                INSERT OR REPLACE INTO station_offers
                    (station_id, ware_id, side, price, quantity, last_seen_tick)
                VALUES
                    (:station_id, :ware_id, :side, :price, :quantity, :last_seen_tick)
                """,
                [dataclasses.asdict(r) for r in self.offer_rows],
            )
