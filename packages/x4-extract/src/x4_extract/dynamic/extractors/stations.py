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
# A station's position lives in <offset><position> (station→offset→position), zone-relative.
# It must be captured at the leaf <position> because the streaming dispatcher clears child
# subtrees before the station's own end event (see savefile/dispatch.py).
_STATION_POS_DEPTH = 17


def _f(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None

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
    seed_id: str | None
    dynamic_tags: str | None
    known_to_player: int
    basename: str | None
    nameindex: int | None
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
    # station id → (x, y, z) zone-relative offset, captured before the station row builds.
    station_offsets: dict[str, tuple[float | None, float | None, float | None]] = field(
        default_factory=dict
    )
    # station id -> seed_id from <source entry="...">
    station_sources: dict[str, str] = field(default_factory=dict)
    # station id -> list of module macros dynamically built on the station
    station_modules: dict[str, list[str]] = field(default_factory=dict)

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
            Registration(
                target=Target(depth=_STATION_POS_DEPTH, tag="position", parent_tag="offset"),
                visitor=self._on_station_offset,
            ),
            Registration(
                target=Target(depth=_STATION_DEPTH + 1, tag="source"),
                visitor=self._on_station_source,
            ),
            Registration(
                target=Target(depth=_STATION_DEPTH + 2, tag="component", parent_tag="connection"),
                visitor=self._on_module,
            ),
        ]

    def _on_station_source(self, elem: etree._Element) -> None:
        comp = elem.getparent()
        if comp is None or comp.get("class") != "station":
            return
        sid = comp.get("id")
        entry = elem.get("entry")
        if sid and entry:
            self.station_sources[sid] = entry

    def _on_module(self, elem: etree._Element) -> None:
        # Check if this component is under connection="modules"
        parent_conn = elem.getparent()
        if parent_conn is None or parent_conn.get("connection") != "modules":
            return
        # Go up to the station
        station = parent_conn.getparent()
        if station is None or station.get("class") != "station":
            return
        sid = station.get("id")
        macro = elem.get("macro")
        if sid and macro:
            self.station_modules.setdefault(sid, []).append(macro)

    def _on_station_offset(self, elem: etree._Element) -> None:
        offset = elem.getparent()
        if offset is None or offset.tag != "offset":
            return
        comp = offset.getparent()
        if comp is None or comp.get("class") != "station":
            return
        sid = comp.get("id")
        if sid:
            self.station_offsets[sid] = (_f(elem.get("x")), _f(elem.get("y")), _f(elem.get("z")))

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
        basename = elem.get("basename")
        
        # If there's no native name but there is a basename, use the basename as the 
        # default name so the localizer will translate it (e.g. {20102,2011} -> Headquarters).
        if not name and basename:
            name = basename

        if name and self.localizer:
            name = self.localizer.resolve(name)
            
        known_to_player = 1 if elem.get("knownto") == "player" else 0
        nameindex_str = elem.get("nameindex")
        nameindex = int(nameindex_str) if nameindex_str and nameindex_str.isdigit() else None

        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_STATION_ATTRS}
        ox, oy, oz = self.station_offsets.get(elem.get("id") or "", (None, None, None))
        sid = elem.get("id") or ""
        seed_id = self.station_sources.get(sid)
        
        dynamic_tags: list[str] = []
        if not seed_id:
            # For dynamic stations, infer tags from built modules.
            modules = self.station_modules.get(sid, [])
            for mod in modules:
                # X4 convention: buildmodule_ships_l_macro, buildmodule_gen_equip_l_macro etc.
                if "equip" in mod and "buildmodule" in mod:
                    if "equipmentdock" not in dynamic_tags:
                        dynamic_tags.append("equipmentdock")
                elif "buildmodule" in mod:
                    if "shipyard" not in dynamic_tags:
                        dynamic_tags.append("shipyard")

        self.station_rows.append(
            StationRow(
                station_id=sid,
                code=elem.get("code"),
                name=name,
                macro=elem.get("macro"),
                owner_faction=elem.get("owner"),
                sector_id=sector_id,
                zone_id=zone_id,
                x=ox,
                y=oy,
                z=oz,
                state=elem.get("state"),
                build_pct=None,
                is_player_owned=int(elem.get("owner") == "player"),
                is_under_construction=0,
                seed_id=seed_id,
                dynamic_tags=json.dumps(dynamic_tags) if dynamic_tags else None,
                known_to_player=known_to_player,
                basename=basename,
                nameindex=nameindex,
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

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier):
        """Trade offers (VOLATILE) keyed by station+ware+side; a moved price or quantity
        is a 'changed' economy event, a new/closed offer is 'added'/'removed'. Stations
        themselves are STRUCTURAL and not diffed here."""
        if tier is not Tier.VOLATILE:
            return
        for r in self.offer_rows:
            yield "station_offer", f"{r.station_id}|{r.ware_id}|{r.side}", {
                "station_id": r.station_id,
                "ware_id": r.ware_id,
                "side": r.side,
                "price": r.price,
                "quantity": r.quantity,
            }

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
                     seed_id, dynamic_tags, known_to_player, basename, nameindex, extra_json)
                VALUES
                    (:station_id, :code, :name, :macro, :owner_faction, :sector_id, :zone_id,
                     :x, :y, :z, :state, :build_pct, :is_player_owned, :is_under_construction,
                     :seed_id, :dynamic_tags, :known_to_player, :basename, :nameindex, :extra_json)
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
