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
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

_SHIP_CLASSES = ("ship_xs", "ship_s", "ship_m", "ship_l", "ship_xl")
_MAPPED_SHIP_ATTRS = frozenset({"id", "code", "name", "macro", "owner", "class", "state"})
_ANCESTOR_WALK_LIMIT = 40  # docked/subordinate ships nest deeply


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
    is_player_owned: int
    extra_json: str | None


@dataclass(slots=True)
class ShipsCollector:
    rows: list[ShipRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="component", depth=None, class_attr=cls),
                visitor=self._on_ship,
            )
            for cls in _SHIP_CLASSES
        ]

    def _on_ship(self, elem: etree._Element) -> None:
        ship_id = elem.get("id")
        if not ship_id:
            return

        sector_id, zone_id = self._enclosing_sector_zone(elem)
        owner = elem.get("owner")
        extra = {k: v for k, v in elem.attrib.items() if k not in _MAPPED_SHIP_ATTRS}
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
                x=None,
                y=None,
                z=None,
                commander_id=None,
                state=elem.get("state"),
                is_player_owned=int(owner == "player"),
                extra_json=json.dumps(extra, sort_keys=True) if extra else None,
            )
        )

    @staticmethod
    def _enclosing_sector_zone(elem: etree._Element) -> tuple[str | None, str | None]:
        sector_id: str | None = None
        zone_id: str | None = None
        ancestor: etree._Element | None = elem.getparent()
        for _ in range(_ANCESTOR_WALK_LIMIT):
            if ancestor is None:
                break
            cls = ancestor.get("class", "")
            if cls == "zone" and zone_id is None:
                zone_id = ancestor.get("macro")
            elif cls == "sector":
                sector_id = ancestor.get("macro")
                break  # sector is the deepest containment we need
            ancestor = ancestor.getparent()
        return sector_id, zone_id

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("ships",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows)

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO ships
                (ship_id, code, name, macro, owner_faction, class_id, sector_id, zone_id,
                 x, y, z, commander_id, state, is_player_owned, extra_json)
            VALUES
                (:ship_id, :code, :name, :macro, :owner_faction, :class_id, :sector_id, :zone_id,
                 :x, :y, :z, :commander_id, :state, :is_player_owned, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
