"""Extract NPCs (crew, marines, station personnel) from a streamed save.

Structure: <component class="npc" id="..." name="..." code="..." macro="..."
                        owner="..." connection="...">
  <entity type="officer" post="aipilot"/>
  <npcseed seed="1234567890"/>
  <traits flags="remotecommable">
    <skills boarding="6" engineering="1" management="1" morale="9" piloting="7"/>
  </traits>
  <blackboard>
    <value name="$HiringFee" type="money">4500</value>
  </blackboard>
</component>

Skill values are 0-15 (0-5 stars x 3 pips per star).  Skills are stored as
attributes on a single <skills> element inside <traits>.  They reflect the
NPC's *current* skill levels, which start from the seed-derived base and
increase through experience / seminars.  Not all five attributes are always
present — missing ones are treated as 0 by the game.

Children are cleared before the parent NPC's end event fires (dispatch design),
so this collector uses five registrations:
  1. <component class="npc">  — captures attrs + walks ancestors for location
  2. <entity>                 — walks up to parent NPC, stores role
  3. <npcseed>                — walks up to parent NPC, stores seed
  4. <skills parent=traits>   — walks up to parent NPC, stores skill attributes
  5. <value parent=blackboard>— walks up to parent NPC, stores blackboard entries

Data is accumulated in a dict keyed by NPC id and flushed at the end.

Tier: STRUCTURAL — NPC assignments are rare (hire/fire/reassign), not per-tick.
"""

from __future__ import annotations

import contextlib
import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field
from typing import cast

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.dynamic.extractors.common import ANCESTOR_WALK_LIMIT
from x4_extract.savefile.dispatch import Registration, Target

NpcData = dict[str, object]


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
    connection: str | None
    location_ship_id: str | None
    location_station_id: str | None
    skill_piloting: int | None
    skill_morale: int | None
    skill_engineering: int | None
    skill_management: int | None
    skill_boarding: int | None
    blackboard_json: str | None
    employment: str
    extra_json: str | None


@dataclass(slots=True)
class NPCsCollector:
    _by_id: dict[str, NpcData] = field(default_factory=dict)
    _person_counter: int = 0

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
            Registration(
                target=Target(tag="skills", depth=None, parent_tag="traits"),
                visitor=self._on_skills,
            ),
            Registration(
                target=Target(tag="value", depth=None, parent_tag="blackboard"),
                visitor=self._on_blackboard_value,
            ),
            Registration(
                target=Target(tag="person", depth=None, parent_tag="people"),
                visitor=self._on_person,
            ),
            Registration(
                target=Target(tag="npcseed", depth=None, parent_tag="person"),
                visitor=self._on_person_npcseed,
            ),
            Registration(
                target=Target(tag="skills", depth=None, parent_tag="person"),
                visitor=self._on_person_skills,
            ),
        ]

    def _npc_parent(self, elem: etree._Element) -> etree._Element | None:
        """Walk up from a child element to the enclosing <component class='npc'>."""
        ancestor: etree._Element | None = elem.getparent()
        for _ in range(ANCESTOR_WALK_LIMIT):
            if ancestor is None:
                return None
            if ancestor.tag == "component" and ancestor.get("class") == "npc":
                return ancestor
            ancestor = ancestor.getparent()
        return None

    def _enclosing_location(
        self, elem: etree._Element
    ) -> tuple[str | None, str | None, str | None, str | None, bool]:
        """Walk ancestors to find the enclosing ship, station, component owner, sector, and whether it's a buildstorage."""
        ship_id: str | None = None
        station_id: str | None = None
        owner: str | None = None
        sector_id: str | None = None
        is_buildstorage = False
        ancestor: etree._Element | None = elem.getparent()
        for _ in range(ANCESTOR_WALK_LIMIT):
            if ancestor is None:
                break
            if ancestor.tag == "component":
                cls = ancestor.get("class", "")
                if owner is None and ancestor.get("owner"):
                    owner = ancestor.get("owner")
                if cls in ("ship_s", "ship_m", "ship_l", "ship_xl", "ship_xs") and ship_id is None:
                    ship_id = ancestor.get("id")
                elif cls == "station" and station_id is None:
                    station_id = ancestor.get("id")
                elif cls == "buildstorage" and station_id is None:
                    station_id = ancestor.get("id")
                    is_buildstorage = True
                elif cls == "sector" and sector_id is None:
                    sector_id = ancestor.get("macro")
            if (
                ship_id is not None
                and station_id is not None
                and owner is not None
                and sector_id is not None
            ):
                break
            ancestor = ancestor.getparent()
        return ship_id, station_id, owner, sector_id, is_buildstorage

    def _ensure(self, npc_id: str) -> NpcData:
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
        data["connection"] = elem.get("connection")
        ship_id, station_id, enclosing_owner, sector_id, is_buildstorage = self._enclosing_location(
            elem
        )
        data["owner_faction"] = elem.get("owner") or enclosing_owner
        data["location_ship_id"] = ship_id
        data["location_station_id"] = station_id
        # Capture unmapped attributes
        mapped = frozenset({"id", "name", "code", "macro", "owner", "class", "connection"})
        extra: dict[str, object] = {
            str(k): v for k, v in elem.attrib.items() if str(k) not in mapped
        }
        if sector_id:
            extra["sector_id"] = sector_id
        if is_buildstorage:
            extra["is_buildstorage"] = True

        if extra:
            existing = data.get("_extra")
            if isinstance(existing, dict):
                _object_dict(existing).update(extra)
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

    def _on_skills(self, elem: etree._Element) -> None:
        """Parse <skills boarding="6" engineering="1" .../> attributes."""
        npc = self._npc_parent(elem)
        if npc is None:
            return
        npc_id = npc.get("id")
        if not npc_id:
            return
        data = self._ensure(npc_id)
        skills = _int_dict(data.setdefault("_skills", {}))
        for attr in ("piloting", "morale", "engineering", "management", "boarding"):
            raw = elem.get(attr)
            if raw is not None:
                with contextlib.suppress(ValueError, TypeError):
                    skills[attr] = int(raw)

    def _on_blackboard_value(self, elem: etree._Element) -> None:
        npc = self._npc_parent(elem)
        if npc is None:
            return
        npc_id = npc.get("id")
        if not npc_id:
            return
        name = elem.get("name")
        text = elem.text
        if name:
            data = self._ensure(npc_id)
            bb = _str_dict(data.setdefault("_blackboard", {}))
            bb[name] = text if text else ""

    def _get_or_create_person_tmp_id(self, person: etree._Element) -> str:
        tmp_id = person.get("_tmp_id")
        if not tmp_id:
            self._person_counter += 1
            tmp_id = f"person_tmp_{self._person_counter}"
            person.set("_tmp_id", tmp_id)
        return tmp_id

    def _on_person_skills(self, elem: etree._Element) -> None:
        person = elem.getparent()
        if person is None:
            return
        tmp_id = self._get_or_create_person_tmp_id(person)
        data = self._ensure(tmp_id)
        skills = _int_dict(data.setdefault("_skills", {}))
        for attr in ("piloting", "morale", "engineering", "management", "boarding"):
            raw = elem.get(attr)
            if raw is not None:
                with contextlib.suppress(ValueError, TypeError):
                    skills[attr] = int(raw)

    def _on_person_npcseed(self, elem: etree._Element) -> None:
        person = elem.getparent()
        if person is None:
            return
        seed = elem.get("seed")
        if seed is not None:
            tmp_id = self._get_or_create_person_tmp_id(person)
            self._ensure(tmp_id)["seed"] = seed

    def _on_person(self, elem: etree._Element) -> None:
        tmp_id = self._get_or_create_person_tmp_id(elem)
        data = self._ensure(tmp_id)

        data["macro"] = elem.get("macro")
        role = elem.get("role")
        if role == "service":
            data["entity_post"] = "engineer"
            data["entity_type"] = "officer"
        elif role == "marine":
            data["entity_post"] = "marine"
            data["entity_type"] = "officer"
        else:
            data["entity_post"] = role
            data["entity_type"] = "officer"

        ship_id, station_id, enclosing_owner, sector_id, is_buildstorage = self._enclosing_location(
            elem
        )
        data["owner_faction"] = enclosing_owner
        data["location_ship_id"] = ship_id
        data["location_station_id"] = station_id

        extra = _object_dict(data.get("_extra", {}))
        if sector_id:
            extra["sector_id"] = sector_id
        if is_buildstorage:
            extra["is_buildstorage"] = True
        if extra:
            data["_extra"] = extra

        real_id = f"{ship_id or station_id or 'unknown'}-person-{data.get('seed', tmp_id)}"
        self._by_id[real_id] = self._by_id.pop(tmp_id)

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
            owner = _optional_str(data.get("owner_faction"))
            loc_station = _optional_str(data.get("location_station_id"))
            skills = _int_dict(data.get("_skills", {}))
            bb = _str_dict(data.get("_blackboard", {}))
            extra = _object_dict(data.get("_extra", {}))
            rows.append(
                NPCRow(
                    id=npc_id,
                    name=_optional_str(data.get("name")),
                    code=_optional_str(data.get("code")),
                    macro=_optional_str(data.get("macro")),
                    owner_faction=owner,
                    entity_type=_optional_str(data.get("entity_type")),
                    entity_post=_optional_str(data.get("entity_post")),
                    seed=_optional_str(data.get("seed")),
                    connection=_optional_str(data.get("connection")),
                    location_ship_id=_optional_str(data.get("location_ship_id")),
                    location_station_id=loc_station,
                    skill_piloting=skills.get("piloting"),
                    skill_morale=skills.get("morale"),
                    skill_engineering=skills.get("engineering"),
                    skill_management=skills.get("management"),
                    skill_boarding=skills.get("boarding"),
                    blackboard_json=json.dumps(bb, sort_keys=True) if bb else None,
                    employment=self._employment(owner, loc_station),
                    extra_json=json.dumps(extra, sort_keys=True) if extra else None,
                )
            )
        conn.executemany(
            """
            INSERT OR REPLACE INTO npc
                (id, name, code, macro, owner_faction, entity_type, entity_post,
                 seed, connection, location_ship_id, location_station_id,
                 skill_piloting, skill_morale, skill_engineering, skill_management, skill_boarding,
                 blackboard_json, employment, extra_json)
            VALUES
                (:id, :name, :code, :macro, :owner_faction, :entity_type, :entity_post,
                 :seed, :connection, :location_ship_id, :location_station_id,
                 :skill_piloting, :skill_morale, :skill_engineering, :skill_management, :skill_boarding,
                 :blackboard_json, :employment, :extra_json)
            """,
            [dataclasses.asdict(r) for r in rows],
        )


def _optional_str(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _int_dict(value: object) -> dict[str, int]:
    if isinstance(value, dict):
        return cast("dict[str, int]", value)
    return {}


def _str_dict(value: object) -> dict[str, str]:
    if isinstance(value, dict):
        return cast("dict[str, str]", value)
    return {}


def _object_dict(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return cast("dict[str, object]", value)
    return {}
