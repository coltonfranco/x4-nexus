"""Extract deployables (satellites, resource probes, nav beacons, mines, lockboxes)
from a streamed save.

Structure: <component class="satellite" connection="space" macro="..." owner="..." .../>
under zone → connections → satellites / resourceprobe / navbeacon / mines / lockboxes.

Tier: STRUCTURAL — deployables are placed/destroyed infrequently.
"""

from __future__ import annotations

import dataclasses
import sqlite3
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
from x4_extract.dynamic.extractors.positions import position_cache
from x4_extract.savefile.dispatch import Registration

_DEPLOYABLE_CLASSES = ("satellite", "resourceprobe", "navbeacon", "mine", "lockbox")
_MAPPED_DEPLOYABLE_ATTRS = frozenset(
    {"id", "class", "code", "macro", "owner", "connection", "knownto"}
)


@dataclass(slots=True)
class DeployableRow:
    id: str
    class_: str
    code: str | None
    macro: str | None
    owner_faction: str | None
    sector_id: str | None
    zone_id: str | None
    x: float | None
    y: float | None
    z: float | None
    known_to_player: int
    extra_json: str | None


@dataclass(slots=True)
class DeployablesCollector:
    rows: list[DeployableRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return component_class_registrations(_DEPLOYABLE_CLASSES, self._on_deployable)

    @staticmethod
    def _resolve_position(
        elem: etree._Element, obj_id: str
    ) -> tuple[float | None, float | None, float | None]:
        """Find the deployable's position: own <offset><position> first, then walk
        ancestors looking for the nearest component with a stored offset."""
        own = position_cache.get(obj_id)
        if own is not None:
            return own

        for ancestor in walk_ancestors(elem):
            if ancestor.tag == "component":
                aid = ancestor.get("id")
                if aid:
                    pos = position_cache.get(aid)
                    if pos is not None:
                        return pos
        return (None, None, None)

    def _on_deployable(self, elem: etree._Element) -> None:
        obj_id = elem.get("id")
        if not obj_id:
            return
        cls = elem.get("class", "")
        sector_id, zone_id = enclosing_sector_zone(elem)
        known = 1 if elem.get("knownto") == "player" else 0
        ox, oy, oz = self._resolve_position(elem, obj_id)

        self.rows.append(
            DeployableRow(
                id=obj_id,
                class_=cls,
                code=elem.get("code"),
                macro=elem.get("macro"),
                owner_faction=elem.get("owner"),
                sector_id=sector_id,
                zone_id=zone_id,
                x=ox,
                y=oy,
                z=oz,
                known_to_player=known,
                extra_json=extra_json_from_attrs(element_attrs(elem), _MAPPED_DEPLOYABLE_ATTRS),
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return tables_for_tier(tier, Tier.STRUCTURAL, ("deployables",))

    def fingerprint(self, tier: Tier) -> str:
        return fingerprint_for_tier(
            tier,
            Tier.STRUCTURAL,
            (dataclasses.asdict(r) for r in self.rows),
        )

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.STRUCTURAL) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO deployables
                (id, class, code, macro, owner_faction, sector_id, zone_id,
                 x, y, z, known_to_player, extra_json)
            VALUES
                (:id, :class_, :code, :macro, :owner_faction, :sector_id, :zone_id,
                 :x, :y, :z, :known_to_player, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
