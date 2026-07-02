"""Extract live ship instances (the fleet) from a streamed save.

Probed structure (autosave_02.xml.gz): ships are `<component class="ship_*">` carrying
id/code/macro/owner/level/state + a rich combat/AI tail. Unlike stations they nest at
*variable* depth — 9763 sit directly under a `<connection>` (flying / docked at a
station) and 996 under a `<ship>` (a carrier's squadron), so we match by class at ANY
depth (depth=None) rather than a fixed one.

The enclosing sector/zone is found by walking ancestors (a docked ship inherits its
host's sector). Cargo and trade orders live deep under each ship's `<connections>`
subtree and are a deliberate fast-follow — this collector captures the roster + state.

Tier: VOLATILE — positions and combat state change every tick.
"""

from __future__ import annotations

import dataclasses
import sqlite3
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, fingerprint_for_tier, tables_for_tier
from x4_extract.dynamic.extractors.common import (
    component_class_registrations,
    element_attrs,
    enclosing_sector_zone,
    extra_json_from_attrs,
    walk_ancestors,
)
from x4_extract.dynamic.extractors.positions import (
    position_cache,
    register_offset_handler,
    register_position_handler,
)
from x4_extract.parsing import str_float
from x4_extract.savefile.dispatch import Registration, Target

_SHIP_CLASSES = ("ship_xs", "ship_s", "ship_m", "ship_l", "ship_xl")
_MAPPED_SHIP_ATTRS = frozenset({"id", "code", "name", "macro", "owner", "class", "state", "level", "thruster"})


@dataclass(slots=True)
class ShipRow:
    ship_id: str
    code: str | None
    name: str | None
    macro: str | None
    owner_faction: str | None
    class_id: str | None
    sector_id: str | None
    zone_id: str | None
    x: float | None
    y: float | None
    z: float | None
    commander_id: str | None
    state: str | None
    level: float | None
    thruster: str | None
    is_player_owned: int
    extra_json: str | None


@dataclass(slots=True)
class ShipsCollector:
    rows: list[ShipRow] = field(default_factory=list)
    _ship_orders: dict[str, str] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            *component_class_registrations(_SHIP_CLASSES, self._on_ship),
            Registration(
                target=Target(tag="order", depth=None, parent_tag="orders"),
                visitor=self._on_order,
            ),
            register_position_handler(),
            register_offset_handler(),
        ]

    def _on_order(self, elem: etree._Element) -> None:
        parent = elem.getparent()
        if parent is None:
            return
        ship = parent.getparent()
        if ship is None or not ship.get("class", "").startswith("ship_"):
            return
        ship_id = ship.get("id")
        if not ship_id:
            return

        # Only keep the first order encountered per ship (usually the active one)
        if ship_id not in self._ship_orders:
            order_val = elem.get("order")
            if order_val:
                self._ship_orders[ship_id] = order_val

    def _resolve_position(
        self, elem: etree._Element, ship_id: str
    ) -> tuple[float | None, float | None, float | None]:
        """Find the ship's position: own <offset><position> first (docked ships),
        then walk ancestors looking for the nearest component with a stored offset
        (flying ships inherit the zone/sector position)."""
        own = position_cache.get(ship_id)
        if own is not None:
            return own

        # Walk ancestors: the first component with a stored offset is the ship's
        # position in space (the enclosing zone or sector).
        for ancestor in walk_ancestors(elem):
            if ancestor.tag == "component":
                aid = ancestor.get("id")
                if aid:
                    pos = position_cache.get(aid)
                    if pos is not None:
                        return pos
        return (None, None, None)

    def _on_ship(self, elem: etree._Element) -> None:
        ship_id = elem.get("id")
        if not ship_id:
            return

        sector_id, zone_id = enclosing_sector_zone(elem)
        owner = elem.get("owner")
        ox, oy, oz = self._resolve_position(elem, ship_id)
        
        current_order = self._ship_orders.pop(ship_id, None)
        extra = {"current_order": current_order} if current_order else None

        self.rows.append(
            ShipRow(
                ship_id=ship_id,
                code=elem.get("code"),
                name=elem.get("name"),
                macro=elem.get("macro"),
                owner_faction=owner,
                class_id=elem.get("class"),
                sector_id=sector_id,
                zone_id=zone_id,
                x=ox,
                y=oy,
                z=oz,
                commander_id=None,
                state=elem.get("state"),
                level=str_float(elem.get("level")),
                thruster=elem.get("thruster"),
                is_player_owned=int(owner == "player"),
                extra_json=extra_json_from_attrs(element_attrs(elem), _MAPPED_SHIP_ATTRS, extra),
            )
        )

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier) -> Iterable[tuple[str, str, Mapping[str, object]]]:
        """Keyed by ship_id. Content is the identity + state/location subset (not the
        noisy 3D fields) so a destroyed/sold ship surfaces as 'removed', a new ship as
        'added', and a state/sector move as 'changed'. Add hull here later to alert on
        damage — the delta engine needs no changes for that."""
        if tier is not Tier.VOLATILE:
            return
        for r in self.rows:
            yield "ship", r.ship_id, {
                "ship_id": r.ship_id,
                "name": r.name,
                "owner_faction": r.owner_faction,
                "class_id": r.class_id,
                "sector_id": r.sector_id,
                "state": r.state,
                "is_player_owned": r.is_player_owned,
            }

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return tables_for_tier(tier, Tier.VOLATILE, ("ships",))

    def fingerprint(self, tier: Tier) -> str:
        return fingerprint_for_tier(tier, Tier.VOLATILE, (dataclasses.asdict(r) for r in self.rows))

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO ships
                (ship_id, code, name, macro, owner_faction, class_id, sector_id, zone_id,
                 x, y, z, commander_id, state, level, thruster, is_player_owned, extra_json)
            VALUES
                (:ship_id, :code, :name, :macro, :owner_faction, :class_id, :sector_id, :zone_id,
                 :x, :y, :z, :commander_id, :state, :level, :thruster, :is_player_owned, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
