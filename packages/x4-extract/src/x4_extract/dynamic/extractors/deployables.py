"""Extract deployables (satellites, resource probes, nav beacons, mines, lockboxes)
from a streamed save.

Structure: <component class="satellite" connection="space" macro="..." owner="..." .../>
under zone → connections → satellites / resourceprobe / navbeacon / mines / lockboxes.

Tier: STRUCTURAL — deployables are placed/destroyed infrequently.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.dynamic.extractors.positions import position_cache
from x4_extract.savefile.dispatch import Registration, Target

_DEPLOYABLE_CLASSES = ("satellite", "resourceprobe", "navbeacon", "mine", "lockbox")
_ANCESTOR_WALK_LIMIT = 40


def _enclosing_sector_zone(elem: etree._Element) -> tuple[str | None, str | None]:
    """Walk ancestors to find the enclosing sector and zone macro names."""
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
            break
        ancestor = ancestor.getparent()
    return sector_id, zone_id


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
        return [
            Registration(
                target=Target(tag="component", depth=None, class_attr=cls),
                visitor=self._on_deployable,
            )
            for cls in _DEPLOYABLE_CLASSES
        ]

    @staticmethod
    def _resolve_position(
        elem: etree._Element, obj_id: str
    ) -> tuple[float | None, float | None, float | None]:
        """Find the deployable's position: own <offset><position> first, then walk
        ancestors looking for the nearest component with a stored offset."""
        own = position_cache.get(obj_id)
        if own is not None:
            return own

        ancestor: etree._Element | None = elem.getparent()
        for _ in range(_ANCESTOR_WALK_LIMIT):
            if ancestor is None:
                break
            if ancestor.tag == "component":
                aid = ancestor.get("id")
                if aid:
                    pos = position_cache.get(aid)
                    if pos is not None:
                        return pos
            ancestor = ancestor.getparent()
        return (None, None, None)

    def _on_deployable(self, elem: etree._Element) -> None:
        obj_id = elem.get("id")
        if not obj_id:
            return
        cls = elem.get("class", "")
        sector_id, zone_id = _enclosing_sector_zone(elem)
        known = 1 if elem.get("knownto") == "player" else 0
        ox, oy, oz = self._resolve_position(elem, obj_id)

        mapped = frozenset({"id", "class", "code", "macro", "owner", "connection", "knownto"})
        extra = {k: v for k, v in elem.attrib.items() if k not in mapped}

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
                extra_json=json.dumps(extra, sort_keys=True) if extra else None,
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("deployables",) if tier is Tier.STRUCTURAL else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.STRUCTURAL:
            return ""
        return hash_rows(dataclasses.asdict(r) for r in self.rows)

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
