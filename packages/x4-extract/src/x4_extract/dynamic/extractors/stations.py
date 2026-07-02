"""Extract station composition + trade offers from a streamed X4 save file.

Station depth (probed against a real save, see docs/save-structure.md):

    savegame(1) → universe(2) → component[galaxy](3) → … →
    component[sector](9) → … → component[zone](12) → … → component[station](15)

Composition (probed `quicksave.xml.gz`, game 8.00, 2026-06):
- **Modules** are NOT in `connections/connection[connection=modules]` (those are empty
  placeholder `<component/>` for player stations). The authoritative list is
  `station/construction/sequence/entry[@macro]` — present on every station.
- A station **under construction** carries `buildtasks[@build="<id>"]`; the matching
  in-progress `<build component="<station id>">` (under a global `buildtasks/inprogress`)
  holds the **full** module plan in its own `sequence` (the station's construction/sequence
  only holds the current build stage). We capture both: realized → `station_modules`,
  full plan → `station_build_plan`.
- **Workforce** (`workforces/workforce@amount` + `workforces/bonus@value`), **production**
  (`production@originalproduct`) and the station **account** (`account@amount`) roll up into
  `station_overview`.
- Build material *have/need* is NOT persisted in the save (confirmed absent on both the
  station and the build task) — the construction bill-of-materials is derived from static
  module recipes at query time, not extracted here.

Streaming caveat: the dispatcher clears an element's children before its own end event, so
a station's children (construction/workforces/account/…) must be captured at the *child's*
end event and stashed by station id; the station row is finalised in `flush()`, decoupled
from parse order (the global build tasks may stream before or after the stations).

Tiers: station rows + composition are STRUCTURAL; offers are VOLATILE.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from x4_extract.i18n import Localizer

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.dynamic.extractors.common import (
    element_attrs,
    enclosing_sector_zone,
    extra_json_from_attrs,
)
from x4_extract.savefile.dispatch import Registration, Target

# Depths confirmed against a real save; fragile only if Egosoft restructures the
# universe hierarchy or wraps stations in an extra container.
_STATION_DEPTH = 15
_OFFER_DEPTH = 19
# A station's position lives in <offset><position> (station→offset→position), zone-relative.
# It must be captured at the leaf <position> because the streaming dispatcher clears child
# subtrees before the station's own end event (see savefile/dispatch.py).
_STATION_POS_DEPTH = 17
# Direct children of the station component sit at station depth + 1.
_STATION_CHILD_DEPTH = _STATION_DEPTH + 1
# workforces/workforce + workforces/bonus sit at station depth + 2.
_STATION_GRANDCHILD_DEPTH = _STATION_DEPTH + 2
# Construction-sequence layout (probed against a real save, see docs/save-structure.md):
#   station(15)/construction(16)/sequence(17)/entry(18)/predecessor(19)
#   station(15)/construction(16)/sequence(17)/entry(18)/offset(19)/position(20)
# Fixed depths matter: a wildcard on <position> would fire on millions of elements.
_ENTRY_PRED_DEPTH = _STATION_DEPTH + 4   # 19
_ENTRY_POS_DEPTH = _STATION_DEPTH + 5    # 20


def _f(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _i(v: str | None) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
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
    """Accumulates stations, their composition and trade offers in one streaming pass."""

    localizer: Localizer | None = None
    station_rows: list[StationRow] = field(default_factory=list)
    offer_rows: list[OfferRow] = field(default_factory=list)
    # station id → (x, y, z) zone-relative offset, captured before the station row builds.
    station_offsets: dict[str, tuple[float | None, float | None, float | None]] = field(
        default_factory=dict
    )
    # station id -> seed_id from <source entry="...">
    station_sources: dict[str, str] = field(default_factory=dict)
    # station id -> Counter(macro -> count) of currently realized/in-progress modules
    # (from construction/sequence).
    current_modules: dict[str, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    # station id -> Counter(macro -> count) of the full planned module set (from the
    # in-progress build task's sequence). Only populated for stations under construction.
    planned_modules: dict[str, Counter[str]] = field(default_factory=lambda: defaultdict(Counter))
    # station ids with an active build task (under construction).
    building: set[str] = field(default_factory=set)
    # Per-module construction layout, keyed by the entry's save-unique id. Three streams
    # (entry meta, predecessor link, position) are stitched together in flush() — children
    # end before their parent <entry>, so they're captured separately and joined by id.
    # entry_id -> {station_id, entry_index, macro, connection}
    entry_meta: dict[str, dict[str, object]] = field(default_factory=dict)
    # entry_id -> (predecessor_index, predecessor_connection)
    entry_pred: dict[str, tuple[int | None, str | None]] = field(default_factory=dict)
    # entry_id -> (x, y, z) station-frame offset (any axis may be None)
    entry_pos: dict[str, tuple[float | None, float | None, float | None]] = field(
        default_factory=dict
    )
    # rollup scalars, keyed by station id
    workforce_current: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    workforce_bonus: dict[str, float] = field(default_factory=dict)
    production_product: dict[str, str] = field(default_factory=dict)
    account_amount: dict[str, int] = field(default_factory=dict)
    account_min: dict[str, int] = field(default_factory=dict)
    account_max: dict[str, int] = field(default_factory=dict)

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
                target=Target(depth=_OFFER_DEPTH, tag="trade", parent_tag="production"),
                visitor=self._on_offer,
            ),
            Registration(
                target=Target(depth=_STATION_POS_DEPTH, tag="position", parent_tag="offset"),
                visitor=self._on_station_offset,
            ),
            Registration(
                target=Target(depth=_STATION_CHILD_DEPTH, tag="source"),
                visitor=self._on_station_source,
            ),
            # Module composition: construction/sequence/entry (station plan) AND the
            # in-progress build task's sequence/entry (full plan). One visitor, branches on
            # the grandparent tag. Wildcard depth — build tasks stream at a different depth.
            Registration(
                target=Target(tag="entry", parent_tag="sequence"),
                visitor=self._on_seq_entry,
            ),
            # Construction layout: a placed module's parent link + position. Fixed depths
            # (19/20) scope these to a station's construction/sequence — build-task entries
            # sit elsewhere — and keep the hot <position> tag from matching universe-wide.
            Registration(
                target=Target(depth=_ENTRY_PRED_DEPTH, tag="predecessor", parent_tag="entry"),
                visitor=self._on_entry_predecessor,
            ),
            Registration(
                target=Target(depth=_ENTRY_POS_DEPTH, tag="position", parent_tag="offset"),
                visitor=self._on_entry_position,
            ),
            # Rollup: workforce headcount + productivity bonus, current product, account.
            Registration(
                target=Target(
                    depth=_STATION_GRANDCHILD_DEPTH, tag="workforce", parent_tag="workforces"
                ),
                visitor=self._on_workforce,
            ),
            Registration(
                target=Target(
                    depth=_STATION_GRANDCHILD_DEPTH, tag="bonus", parent_tag="workforces"
                ),
                visitor=self._on_workforce_bonus,
            ),
            Registration(
                target=Target(depth=_STATION_CHILD_DEPTH, tag="production", parent_tag="component"),
                visitor=self._on_production,
            ),
            Registration(
                target=Target(depth=_STATION_CHILD_DEPTH, tag="account", parent_tag="component"),
                visitor=self._on_account,
            ),
            Registration(
                target=Target(depth=_STATION_CHILD_DEPTH, tag="buildtasks", parent_tag="component"),
                visitor=self._on_buildtasks,
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

    def _on_seq_entry(self, elem: etree._Element) -> None:
        """An <entry> under a <sequence>. Two sources, distinguished by grandparent:

        - construction/sequence/entry  → realized/in-progress module of the parent station
        - build/sequence/entry         → planned module of build@component (full plan)

        (snapshot/entry has parent <snapshot>, so it never reaches here.)
        """
        macro = elem.get("macro")
        if not macro:
            return
        seq = elem.getparent()
        if seq is None:
            return
        gp = seq.getparent()
        if gp is None:
            return
        if gp.tag == "construction":
            station = gp.getparent()
            if station is not None and station.get("class") == "station":
                sid = station.get("id")
                if sid:
                    self.current_modules[sid][macro] += 1
                    # Record this placed module's identity for layout reconstruction. Its
                    # predecessor link + position arrive via separate visitors (children end
                    # before this <entry> does) and are joined by entry id in flush().
                    eid = elem.get("id")
                    if eid:
                        self.entry_meta[eid] = {
                            "station_id": sid,
                            "entry_index": _i(elem.get("index")),
                            "macro": macro,
                            "connection": elem.get("connection"),
                        }
        elif gp.tag == "build":
            sid = gp.get("component")
            if sid:
                self.planned_modules[sid][macro] += 1
                self.building.add(sid)

    def _on_entry_predecessor(self, elem: etree._Element) -> None:
        """<predecessor index=.. connection=..> under a construction <entry>. Records the
        parent link keyed by the entry's id (resolved from the still-attached parent)."""
        entry = elem.getparent()
        if entry is None or entry.tag != "entry":
            return
        eid = entry.get("id")
        if eid:
            self.entry_pred[eid] = (_i(elem.get("index")), elem.get("connection"))

    def _on_entry_position(self, elem: etree._Element) -> None:
        """<position> under a construction entry's <offset>. Guard on grandparent == entry
        so this never captures non-entry offsets that happen to share the depth."""
        offset = elem.getparent()
        if offset is None or offset.tag != "offset":
            return
        entry = offset.getparent()
        if entry is None or entry.tag != "entry":
            return
        eid = entry.get("id")
        if eid:
            self.entry_pos[eid] = (_f(elem.get("x")), _f(elem.get("y")), _f(elem.get("z")))

    def _station_id_via_parent(self, elem: etree._Element, parent_tag: str) -> str | None:
        """station id when `elem`'s parent is `parent_tag` and its grandparent is the station,
        or (for direct children) when `elem`'s parent is the station component itself."""
        parent = elem.getparent()
        if parent is None:
            return None
        if parent_tag == "component":
            return parent.get("id") if parent.get("class") == "station" else None
        if parent.tag != parent_tag:
            return None
        station = parent.getparent()
        if station is None or station.get("class") != "station":
            return None
        return station.get("id")

    def _on_workforce(self, elem: etree._Element) -> None:
        sid = self._station_id_via_parent(elem, "workforces")
        amount = _i(elem.get("amount"))
        if sid and amount is not None:
            self.workforce_current[sid] += amount

    def _on_workforce_bonus(self, elem: etree._Element) -> None:
        sid = self._station_id_via_parent(elem, "workforces")
        value = _f(elem.get("value"))
        if sid and value is not None:
            self.workforce_bonus[sid] = value

    def _on_production(self, elem: etree._Element) -> None:
        sid = self._station_id_via_parent(elem, "component")
        product = elem.get("originalproduct")
        if sid and product:
            self.production_product[sid] = product

    def _on_account(self, elem: etree._Element) -> None:
        sid = self._station_id_via_parent(elem, "component")
        if not sid:
            return
        amount = _i(elem.get("amount"))
        if amount is not None:
            self.account_amount[sid] = amount
        amin = _i(elem.get("min"))
        if amin is not None:
            self.account_min[sid] = amin
        amax = _i(elem.get("max"))
        if amax is not None:
            self.account_max[sid] = amax

    def _on_buildtasks(self, elem: etree._Element) -> None:
        sid = self._station_id_via_parent(elem, "component")
        if sid and elem.get("build"):
            self.building.add(sid)

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
        sector_id, zone_id = enclosing_sector_zone(elem, limit=9)

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

        ox, oy, oz = self.station_offsets.get(elem.get("id") or "", (None, None, None))
        sid = elem.get("id") or ""
        seed_id = self.station_sources.get(sid)

        # Base row. is_under_construction / build_pct are finalised in flush() because the
        # global build tasks may stream after this station; dynamic_tags is likewise deferred.
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
                dynamic_tags=None,
                known_to_player=known_to_player,
                basename=basename,
                nameindex=nameindex,
                extra_json=extra_json_from_attrs(element_attrs(elem), _MAPPED_STATION_ATTRS),
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

    # --- finalisation ----------------------------------------------------------
    @staticmethod
    def _infer_dynamic_tags(macros: Counter[str]) -> list[str]:
        """Best-effort station-function tags inferred from module macros (shipyards/docks)."""
        tags: list[str] = []
        for mod in macros:
            if "buildmodule" in mod and "equip" in mod:
                if "equipmentdock" not in tags:
                    tags.append("equipmentdock")
            elif "buildmodule" in mod and "shipyard" not in tags:
                tags.append("shipyard")
        return tags

    def _finalise_station_rows(self) -> None:
        """Fill is_under_construction / build_pct / dynamic_tags now that every child and the
        global build tasks have been streamed. Idempotent."""
        for r in self.station_rows:
            sid = r.station_id
            current = self.current_modules.get(sid, Counter())
            planned = self.planned_modules.get(sid)
            r.is_under_construction = int(sid in self.building)
            if r.is_under_construction and planned:
                built = sum(current.values())
                total = sum(planned.values())
                r.build_pct = round(built / total * 100, 1) if total else None
            tags = self._infer_dynamic_tags(current)
            r.dynamic_tags = json.dumps(tags) if tags else None

    def _overview_rows(self) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        for r in self.station_rows:
            sid = r.station_id
            current = self.current_modules.get(sid, Counter())
            planned = self.planned_modules.get(sid)
            rows.append(
                {
                    "station_id": sid,
                    "module_count": sum(current.values()),
                    "planned_module_count": sum(planned.values()) if planned else None,
                    "account_amount": self.account_amount.get(sid),
                    "account_min": self.account_min.get(sid),
                    "account_max": self.account_max.get(sid),
                    "workforce_current": self.workforce_current.get(sid),
                    "workforce_bonus": self.workforce_bonus.get(sid),
                    "production_product": self.production_product.get(sid),
                }
            )
        return rows

    @staticmethod
    def _module_rows(by_station: dict[str, Counter[str]]) -> list[dict[str, object]]:
        rows: list[dict[str, object]] = []
        for sid, macros in by_station.items():
            for macro, count in macros.items():
                rows.append(
                    {"station_id": sid, "module_id": macro, "macro": macro, "count": count}
                )
        return rows

    def _construction_entry_rows(self) -> list[dict[str, object]]:
        """One row per placed module of every station's construction sequence, stitching the
        three layout streams (meta + predecessor + position) together by entry id."""
        rows: list[dict[str, object]] = []
        for eid, meta in self.entry_meta.items():
            pred_index, pred_conn = self.entry_pred.get(eid, (None, None))
            px, py, pz = self.entry_pos.get(eid, (None, None, None))
            rows.append(
                {
                    "station_id": meta["station_id"],
                    "entry_id": eid,
                    "entry_index": meta["entry_index"],
                    "macro": meta["macro"],
                    "predecessor_index": pred_index,
                    "connection": meta["connection"],
                    "predecessor_connection": pred_conn,
                    "pos_x": px,
                    "pos_y": py,
                    "pos_z": pz,
                }
            )
        return rows

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier) -> Iterable[tuple[str, str, Mapping[str, object]]]:
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
            return (
                "stations",
                "station_modules",
                "station_build_plan",
                "station_overview",
                "station_construction_entries",
            )
        return ("station_offers",)

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.STRUCTURAL:
            return hash_rows(dataclasses.asdict(r) for r in self.offer_rows)
        self._finalise_station_rows()
        # Hash station rows + composition so any module/workforce/build change rewrites the tier.
        return hash_rows(
            [
                *(dataclasses.asdict(r) for r in self.station_rows),
                *self._module_rows(self.current_modules),
                *self._module_rows(self.planned_modules),
                *self._overview_rows(),
                *self._construction_entry_rows(),
            ]
        )

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier in (None, Tier.STRUCTURAL):
            self._finalise_station_rows()
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
            conn.executemany(
                "INSERT OR REPLACE INTO station_modules "
                "(station_id, module_id, macro, count) "
                "VALUES (:station_id, :module_id, :macro, :count)",
                self._module_rows(self.current_modules),
            )
            conn.executemany(
                "INSERT OR REPLACE INTO station_build_plan "
                "(station_id, module_id, macro, count) "
                "VALUES (:station_id, :module_id, :macro, :count)",
                self._module_rows(self.planned_modules),
            )
            conn.executemany(
                "INSERT OR REPLACE INTO station_overview "
                "(station_id, module_count, planned_module_count, account_amount, "
                " account_min, account_max, workforce_current, workforce_bonus, production_product) "
                "VALUES (:station_id, :module_count, :planned_module_count, :account_amount, "
                " :account_min, :account_max, :workforce_current, :workforce_bonus, :production_product)",
                self._overview_rows(),
            )
            conn.executemany(
                "INSERT OR REPLACE INTO station_construction_entries "
                "(station_id, entry_id, entry_index, macro, predecessor_index, connection, "
                " predecessor_connection, pos_x, pos_y, pos_z) "
                "VALUES (:station_id, :entry_id, :entry_index, :macro, :predecessor_index, "
                " :connection, :predecessor_connection, :pos_x, :pos_y, :pos_z)",
                self._construction_entry_rows(),
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
