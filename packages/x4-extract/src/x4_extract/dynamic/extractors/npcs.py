"""Extract NPCs (crew, marines, station personnel) from a streamed save.

Structure: <component class="npc" id="..." name="..." macro="..." owner="...">
  <entity type="officer" post="aipilot"/>
  <npcseed seed="1234567890"/>
  <blackboard><value name="$HiringFee" type="money">...</value></blackboard>
</component>

NPC skills are NOT stored in the save — they're derived from `npcseed` + macro at
runtime. We capture the seed for future skill computation.

Children are cleared before the parent NPC's end event fires (dispatch design), so
this collector uses three registrations:
  1. <component class="npc">  — captures attrs + walks ancestors for location
  2. <entity>                 — walks up to parent NPC, stores role
  3. <npcseed>                — walks up to parent NPC, stores seed

Data is accumulated in a dict keyed by NPC id and flushed at the end.

Tier: STRUCTURAL — NPC assignments are rare (hire/fire/reassign), not per-tick.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

_ANCESTOR_WALK_LIMIT = 40


@dataclass(slots=True)
class NPCRow:
    id: str
    name: str | None
    code: str | None
    macro: str | None
    owner_faction: str | None
    entity_type: str | None
    entity_post: str | None
    seed: str | None
    location_ship_id: str | None
    location_station_id: str | None
    employment: str
    extra_json: str | None


@dataclass(slots=True)
class NPCsCollector:
    _by_id: dict[str, dict[str, object]] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(tag="component", depth=None, class_attr="npc"),
                visitor=self._on_npc,
            ),
            Registration(
                target=Target(tag="entity", depth=None),
                visitor=self._on_entity,
            ),
            Registration(
                target=Target(tag="npcseed", depth=None),
                visitor=self._on_npcseed,
            ),
        ]

    def _npc_parent(self, elem: etree._Element) -> etree._Element | None:
        """Walk up from a child element to the enclosing <component class='npc'>."""
        ancestor: etree._Element | None = elem.getparent()
        for _ in range(_ANCESTOR_WALK_LIMIT):
            if ancestor is None:
                return None
            if ancestor.tag == "component" and ancestor.get("class") == "npc":
                return ancestor
            ancestor = ancestor.getparent()
        return None

    def _enclosing_location(self, elem: etree._Element) -> tuple[str | None, str | None]:
        """Walk ancestors to find the enclosing ship and/or station component id."""
        ship_id: str | None = None
        station_id: str | None = None
        ancestor: etree._Element | None = elem.getparent()
        for _ in range(_ANCESTOR_WALK_LIMIT):
            if ancestor is None:
                break
            if ancestor.tag == "component":
                cls = ancestor.get("class", "")
                if cls in ("ship_s", "ship_m", "ship_l", "ship_xl", "ship_xs") and ship_id is None:
                    ship_id = ancestor.get("id")
                elif cls == "station" and station_id is None:
                    station_id = ancestor.get("id")
            if ship_id is not None and station_id is not None:
                break
            ancestor = ancestor.getparent()
        return ship_id, station_id

    def _ensure(self, npc_id: str) -> dict[str, object]:
        if npc_id not in self._by_id:
            self._by_id[npc_id] = {}
        return self._by_id[npc_id]

    def _on_npc(self, elem: etree._Element) -> None:
        npc_id = elem.get("id")
        if not npc_id:
            return
        data = self._ensure(npc_id)
        data["name"] = elem.get("name")
        data["code"] = elem.get("code")
        data["macro"] = elem.get("macro")
        data["owner_faction"] = elem.get("owner")
        ship_id, station_id = self._enclosing_location(elem)
        data["location_ship_id"] = ship_id
        data["location_station_id"] = station_id
        # Capture unmapped attributes
        mapped = frozenset({"id", "name", "code", "macro", "owner", "class", "connection"})
        extra = {k: v for k, v in elem.attrib.items() if k not in mapped}
        if extra:
            existing = data.get("_extra")
            if isinstance(existing, dict):
                existing.update(extra)
            else:
                data["_extra"] = extra

    def _on_entity(self, elem: etree._Element) -> None:
        npc = self._npc_parent(elem)
        if npc is None:
            return
        npc_id = npc.get("id")
        if not npc_id:
            return
        data = self._ensure(npc_id)
        data["entity_type"] = elem.get("type")
        data["entity_post"] = elem.get("post")

    def _on_npcseed(self, elem: etree._Element) -> None:
        npc = self._npc_parent(elem)
        if npc is None:
            return
        npc_id = npc.get("id")
        if not npc_id:
            return
        seed = elem.get("seed")
        if seed is not None:
            self._ensure(npc_id)["seed"] = seed

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("npc",) if tier is Tier.STRUCTURAL else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.STRUCTURAL:
            return ""
        return hash_rows(
            {"id": k, **{kk: vv for kk, vv in v.items() if not kk.startswith("_")}}
            for k, v in sorted(self._by_id.items())
        )

    @staticmethod
    def _employment(owner: str | None, loc_station: str | None) -> str:
        if owner == "player":
            return "owned"
        if loc_station is not None:
            return "hireable"
        return "other"

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.STRUCTURAL) or not self._by_id:
            return
        rows: list[NPCRow] = []
        for npc_id, data in sorted(self._by_id.items()):
            owner = data.get("owner_faction")
            loc_station = data.get("location_station_id")
            rows.append(
                NPCRow(
                    id=npc_id,
                    name=data.get("name"),
                    code=data.get("code"),
                    macro=data.get("macro"),
                    owner_faction=owner,
                    entity_type=data.get("entity_type"),
                    entity_post=data.get("entity_post"),
                    seed=data.get("seed"),
                    location_ship_id=data.get("location_ship_id"),
                    location_station_id=loc_station,
                    employment=self._employment(owner, loc_station),
                    extra_json=json.dumps(data["_extra"], sort_keys=True) if data.get("_extra") else None,
                )
            )
        conn.executemany(
            """
            INSERT OR REPLACE INTO npc
                (id, name, code, macro, owner_faction, entity_type, entity_post,
                 seed, location_ship_id, location_station_id, employment, extra_json)
            VALUES
                (:id, :name, :code, :macro, :owner_faction, :entity_type, :entity_post,
                 :seed, :location_ship_id, :location_station_id, :employment, :extra_json)
            """,
            [dataclasses.asdict(r) for r in rows],
        )
