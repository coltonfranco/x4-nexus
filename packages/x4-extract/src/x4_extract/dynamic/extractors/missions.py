"""Extract mission, offer, and objective rows from a streamed X4 save file.

Probed structure (save_001.xml.gz, game 8.00):

    savegame(1)
    └─ missions(2)
       ├─ mission(3)  ← ACTIVE plot/story missions (8 found)
       │  ├─ briefing(4)
       │  │  └─ objective(5)  attrs: step, type, text, active
       │  │     ├─ encyclopedia(6)  type, item
       │  │     ├─ targets(6) / target(7)  id (entity ref)
       │  │     └─ progress(6)  current, max, name
       │  └─ objective(4)  (completed-state duplicate)
       │
       └─ offer(3)  ← AVAILABLE mission offers (41 found, incl. tutorials)
          ├─ bbs(4) / space(5)  component (station ref)
          ├─ briefing(4)
          │  ├─ mission(5)  ← repeatable guild/war template (23 found)
          │  └─ objective(5)
          └─ locations(4) / location(5)  component (station ref)

Missions and offers are VOLATILE.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import sqlite3
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

# --- Helpers ---------------------------------------------------------------


def _int(v: str | None) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return None


def _bool(v: str | None) -> bool | None:
    if v is None:
        return None
    return v == "1"


def _float(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _attrs(elem: etree._Element) -> dict[str, str]:
    return {str(k): str(v) for k, v in elem.attrib.items()}


# Attributes promoted to columns for active missions.
_MAPPED_MISSION = frozenset({
    "id", "name", "description", "faction", "type", "level",
    "active", "priority", "abortable", "associated", "activation", "alert",
    "group", "caption", "icon", "time", "rewardtext", "reward",
    "opposingfaction",
})

# Attributes promoted to columns for mission offers.
_MAPPED_OFFER = frozenset({
    "id", "name", "description", "faction", "type", "level", "actor",
    "opposingfaction", "group", "reward", "component", "distance", "threadtype",
    "duration",
})


# --- Row types -------------------------------------------------------------


@dataclass(slots=True)
class MissionRow:
    mission_id: str | None
    name: str | None
    description: str | None
    faction: str | None
    type: str | None
    level: str | None
    is_active: bool
    priority: int | None
    abortable: bool | None
    associated_entity: str | None
    group_id: str | None = None
    is_story: bool = False
    caption: str | None = None
    icon: str | None = None
    time: float | None = None
    rewardtext: str | None = None
    reward_credits: int | None = None
    opposing_faction: str | None = None
    activation: str | None = None
    alert: str | None = None
    extra_json: str | None = None


@dataclass(slots=True)
class ObjectiveRow:
    mission_id: str | None
    step: int | None
    type: str | None
    text: str | None
    is_active: bool
    target_id: str | None = None
    progress_current: int | None = None
    progress_max: int | None = None
    progress_name: str | None = None
    encyclopedia_type: str | None = None
    encyclopedia_item: str | None = None


@dataclass(slots=True)
class OfferRow:
    offer_id: str | None
    name: str | None
    description: str | None
    faction: str | None
    type: str | None
    level: str | None
    actor: str | None
    station_id: str | None          # first <location component="...">
    bbs_station_id: str | None      # from <bbs>/<space component="...">
    is_repeatable: bool              # has a <briefing>/<mission> child
    rewardtext: str | None           # from nested briefing/mission
    opposing_faction: str | None = None  # from XML opposingfaction attr
    group_id: str | None = None          # from XML group attr
    reward_credits: int | None = None    # from XML reward attr
    component_id: str | None = None      # from XML component attr
    distance: int | None = None          # from XML distance attr
    thread_type: str | None = None       # from XML threadtype attr
    duration: float | None = None        # from XML duration attr
    extra_json: str | None = None


# --- Collector -------------------------------------------------------------


@dataclass(slots=True)
class MissionsCollector:
    """Accumulates mission, offer, and objective rows in one streaming pass."""

    mission_rows: list[MissionRow] = field(default_factory=list)
    objective_rows: list[ObjectiveRow] = field(default_factory=list)
    offer_rows: list[OfferRow] = field(default_factory=list)

    # Temporary accumulators for offer-level data captured from child elements.
    _offer_repeatable: set[str] = field(default_factory=set)
    _offer_rewardtext: dict[str, str] = field(default_factory=dict)
    _offer_stations: dict[str, str] = field(default_factory=dict)
    _offer_bbs: dict[str, str] = field(default_factory=dict)

    # Temporary accumulators for objective child data.
    # Key: (mission_id, step); populated by child handlers before _on_objective fires.
    _obj_targets: dict[tuple[str, int], list[str]] = field(default_factory=dict)
    _obj_progress: dict[tuple[str, int], dict[str, str | None]] = field(default_factory=dict)
    _obj_encyclopedia: dict[tuple[str, int], dict[str, str | None]] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            # Active missions
            Registration(
                Target(depth=3, tag="mission", parent_tag="missions"),
                self._on_mission,
            ),
            # Available offers
            Registration(
                Target(depth=3, tag="offer", parent_tag="missions"),
                self._on_offer,
            ),
            # Offer child: repeatable mission template
            Registration(
                Target(depth=5, tag="mission", parent_tag="briefing"),
                self._on_offer_mission,
            ),
            # Offer child: location component ref
            Registration(
                Target(depth=5, tag="location", parent_tag="locations"),
                self._on_offer_location,
            ),
            # Offer child: BBS bulletin board location
            Registration(
                Target(depth=5, tag="space", parent_tag="bbs"),
                self._on_offer_bbs,
            ),
            # Objectives: wildcard depth
            Registration(
                Target(depth=None, tag="objective"),
                self._on_objective,
            ),
            # Objective children: targets, progress, encyclopedia
            Registration(
                Target(depth=None, tag="target", parent_tag="targets"),
                self._on_target,
            ),
            Registration(
                Target(depth=None, tag="progress"),
                self._on_progress,
            ),
            Registration(
                Target(depth=None, tag="encyclopedia"),
                self._on_encyclopedia,
            ),
        ]

    # -- Active missions ----------------------------------------------------

    def _on_mission(self, elem: etree._Element) -> None:
        attrs = _attrs(elem)
        extra = {k: v for k, v in attrs.items() if k not in _MAPPED_MISSION}

        mission_id = attrs.get("id") or _synthetic_mission_id(attrs)

        if mission_id.startswith("syn_"):
            for existing in self.mission_rows:
                if existing.mission_id == mission_id:
                    return

        group_id = attrs.get("group")
        self.mission_rows.append(MissionRow(
            mission_id=mission_id,
            name=attrs.get("name"),
            description=attrs.get("description"),
            faction=attrs.get("faction"),
            type=attrs.get("type"),
            level=attrs.get("level"),
            is_active=attrs.get("active") == "1",
            priority=_int(attrs.get("priority")),
            abortable=_bool(attrs.get("abortable")),
            associated_entity=attrs.get("associated"),
            group_id=group_id,
            is_story=bool(group_id and group_id.startswith("story_")),
            caption=attrs.get("caption"),
            icon=attrs.get("icon"),
            time=_float(attrs.get("time")),
            rewardtext=attrs.get("rewardtext"),
            reward_credits=_int(attrs.get("reward")),
            opposing_faction=attrs.get("opposingfaction"),
            activation=attrs.get("activation"),
            alert=attrs.get("alert"),
            extra_json=json.dumps(extra, sort_keys=True) if extra else None,
        ))

    # -- Mission offers -----------------------------------------------------

    def _on_offer(self, elem: etree._Element) -> None:
        attrs = _attrs(elem)
        extra = {k: v for k, v in attrs.items() if k not in _MAPPED_OFFER}

        offer_id = attrs.get("id") or _synthetic_mission_id(attrs)

        is_repeatable = offer_id in self._offer_repeatable
        station_id = self._offer_stations.get(offer_id)
        bbs_station_id = self._offer_bbs.get(offer_id)
        rewardtext = self._offer_rewardtext.get(offer_id)

        self.offer_rows.append(OfferRow(
            offer_id=offer_id,
            name=attrs.get("name"),
            description=attrs.get("description"),
            faction=attrs.get("faction"),
            type=attrs.get("type"),
            level=attrs.get("level"),
            actor=attrs.get("actor"),
            station_id=station_id,
            bbs_station_id=bbs_station_id,
            is_repeatable=is_repeatable,
            rewardtext=rewardtext,
            opposing_faction=attrs.get("opposingfaction"),
            group_id=attrs.get("group"),
            reward_credits=_int(attrs.get("reward")),
            component_id=attrs.get("component"),
            distance=_int(attrs.get("distance")),
            thread_type=attrs.get("threadtype"),
            duration=_float(attrs.get("duration")),
            extra_json=json.dumps(extra, sort_keys=True) if extra else None,
        ))

    def _on_offer_mission(self, elem: etree._Element) -> None:
        parent = elem.getparent()  # briefing
        if parent is None:
            return
        offer = parent.getparent()  # offer
        if offer is None or offer.tag != "offer":
            return
        offer_id = offer.get("id") or _synthetic_mission_id(_attrs(offer))
        self._offer_repeatable.add(offer_id)
        rewardtext = elem.get("rewardtext")
        if rewardtext:
            self._offer_rewardtext[offer_id] = rewardtext

    def _on_offer_location(self, elem: etree._Element) -> None:
        parent = elem.getparent()  # locations
        if parent is None:
            return
        offer = parent.getparent()  # offer
        if offer is None or offer.tag != "offer":
            return
        offer_id = offer.get("id") or _synthetic_mission_id(_attrs(offer))
        if offer_id not in self._offer_stations:
            comp = elem.get("component")
            if comp:
                self._offer_stations[offer_id] = comp

    def _on_offer_bbs(self, elem: etree._Element) -> None:
        parent = elem.getparent()  # bbs
        if parent is None:
            return
        offer = parent.getparent()  # offer
        if offer is None or offer.tag != "offer":
            return
        offer_id = offer.get("id") or _synthetic_mission_id(_attrs(offer))
        if offer_id not in self._offer_bbs:
            comp = elem.get("component")
            if comp:
                self._offer_bbs[offer_id] = comp

    # -- Objectives ---------------------------------------------------------

    def _on_objective(self, elem: etree._Element) -> None:
        parent_mission = _find_parent_mission(elem)
        if parent_mission is None:
            return

        mission_attrs = _attrs(parent_mission)
        mission_id = mission_attrs.get("id") or _synthetic_mission_id(mission_attrs)

        attrs = _attrs(elem)
        step = _int(attrs.get("step"))
        is_active = attrs.get("active") == "1"

        # Read child-element data accumulated by target/progress/encyclopedia handlers.
        key = (mission_id, step or 0)
        target_ids = self._obj_targets.pop(key, [])
        target_id = target_ids[0] if target_ids else None
        prog = self._obj_progress.pop(key, {})
        enc = self._obj_encyclopedia.pop(key, {})

        row = ObjectiveRow(
            mission_id=mission_id,
            step=step,
            type=attrs.get("type"),
            text=attrs.get("text"),
            is_active=is_active,
            target_id=target_id,
            progress_current=_int(prog.get("current")),
            progress_max=_int(prog.get("max")),
            progress_name=prog.get("name"),
            encyclopedia_type=enc.get("type"),
            encyclopedia_item=enc.get("item"),
        )

        # Deduplicate: keep active variant over completed variant.
        # Normalise None→0 so that a stale copy at <mission>/<objective>
        # (no step attr) matches its twin under <briefing>/<objective step="0">.
        norm_step = step or 0
        for i, existing in enumerate(self.objective_rows):
            if existing.mission_id == mission_id and (existing.step or 0) == norm_step:
                if not existing.is_active and is_active:
                    self.objective_rows[i] = row
                # Either way, don't append a duplicate.
                return

        self.objective_rows.append(row)

    # -- Objective children -------------------------------------------------

    def _on_target(self, elem: etree._Element) -> None:
        obj_key = _find_objective_key(elem)
        if obj_key is None:
            return
        tid = elem.get("id")
        if tid:
            self._obj_targets.setdefault(obj_key, []).append(tid)

    def _on_progress(self, elem: etree._Element) -> None:
        obj_key = _find_objective_key(elem)
        if obj_key is None:
            return
        self._obj_progress[obj_key] = {
            "current": elem.get("current"),
            "max": elem.get("max"),
            "name": elem.get("name"),
        }

    def _on_encyclopedia(self, elem: etree._Element) -> None:
        obj_key = _find_objective_key(elem)
        if obj_key is None:
            return
        self._obj_encyclopedia[obj_key] = {
            "type": elem.get("type"),
            "item": elem.get("item"),
        }

    # --- delta source ------------------------------------------------------

    def keyed_rows(self, tier: Tier) -> Iterable[tuple[str, str, Mapping[str, object]]]:
        """Active missions (keyed by mission_id) and available offers (by offer_id). A
        mission appearing/completing or its active/priority state moving is a 'mission'
        event; new BBS offers are 'mission_offer' events. Objectives are intentionally
        left out of the feed for now — add them here keyed by (mission_id, step) later."""
        if tier is not Tier.VOLATILE:
            return
        for mission in self.mission_rows:
            if mission.mission_id is None:
                continue
            yield "mission", mission.mission_id, {
                "mission_id": mission.mission_id,
                "name": mission.name,
                "faction": mission.faction,
                "type": mission.type,
                "level": mission.level,
                "is_active": mission.is_active,
                "priority": mission.priority,
            }
        for offer in self.offer_rows:
            if offer.offer_id is None:
                continue
            yield "mission_offer", offer.offer_id, {
                "offer_id": offer.offer_id,
                "name": offer.name,
                "faction": offer.faction,
                "type": offer.type,
            }

    # --- tiered contract ---------------------------------------------------

    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("missions", "mission_objectives", "mission_offers") if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        parts: list[str] = []
        if self.mission_rows:
            parts.append(hash_rows([dataclasses.asdict(r) for r in self.mission_rows]))
        if self.objective_rows:
            parts.append(hash_rows([dataclasses.asdict(r) for r in self.objective_rows]))
        if self.offer_rows:
            parts.append(hash_rows([dataclasses.asdict(r) for r in self.offer_rows]))
        if not parts:
            return ""
        h = hashlib.sha256()
        for p in sorted(parts):
            h.update(p.encode())
        return h.hexdigest()

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE):
            return

        conn.executemany(
            """INSERT OR REPLACE INTO missions
                (mission_id, name, description, faction, type, level,
                 is_active, priority, abortable, associated_entity,
                 group_id, is_story, caption, icon, time, rewardtext,
                 reward_credits, opposing_faction, activation, alert,
                 extra_json)
               VALUES
                (:mission_id, :name, :description, :faction, :type, :level,
                 :is_active, :priority, :abortable, :associated_entity,
                 :group_id, :is_story, :caption, :icon, :time, :rewardtext,
                 :reward_credits, :opposing_faction, :activation, :alert,
                 :extra_json)""",
            [dataclasses.asdict(r) for r in self.mission_rows],
        )
        conn.executemany(
            """INSERT OR REPLACE INTO mission_objectives
                (mission_id, step, type, text, is_active,
                 target_id, progress_current, progress_max, progress_name,
                 encyclopedia_type, encyclopedia_item)
               VALUES
                (:mission_id, :step, :type, :text, :is_active,
                 :target_id, :progress_current, :progress_max, :progress_name,
                 :encyclopedia_type, :encyclopedia_item)""",
            [dataclasses.asdict(r) for r in self.objective_rows],
        )
        conn.executemany(
            """INSERT OR REPLACE INTO mission_offers
                (offer_id, name, description, faction, type, level, actor,
                 station_id, bbs_station_id, is_repeatable, rewardtext,
                 opposing_faction, group_id, reward_credits, component_id,
                 distance, thread_type, duration, extra_json)
               VALUES
                (:offer_id, :name, :description, :faction, :type, :level,
                 :actor, :station_id, :bbs_station_id, :is_repeatable,
                 :rewardtext, :opposing_faction, :group_id, :reward_credits,
                 :component_id, :distance, :thread_type, :duration, :extra_json)""",
            [dataclasses.asdict(r) for r in self.offer_rows],
        )


# --- DOM walk helpers -------------------------------------------------------


def _find_parent_mission(elem: etree._Element) -> etree._Element | None:
    """Walk up from an <objective> to find its containing <mission> element."""
    node = elem.getparent()
    while node is not None:
        if node.tag == "mission":
            return node
        node = node.getparent()
    return None


def _find_objective_key(elem: etree._Element) -> tuple[str, int] | None:
    """Walk up from a child of <objective> to find (mission_id, step)."""
    node = elem.getparent()
    # Walk up: child → (targets|progress|encyclopedia) → objective → (briefing?) → mission
    while node is not None:
        if node.tag == "objective":
            step = _int(node.get("step")) or 0
            # Now find the parent mission
            mission_node = _find_parent_mission(node)
            if mission_node is not None:
                mission_attrs = _attrs(mission_node)
                mission_id = mission_attrs.get("id") or _synthetic_mission_id(mission_attrs)
                return (mission_id, step)
            return None
        node = node.getparent()
    return None


def _synthetic_mission_id(attrs: dict[str, str]) -> str:
    """Generate a stable synthetic id for entities without an explicit id."""
    key = f"{attrs.get('faction','')}|{attrs.get('type','')}|{attrs.get('name','')}"
    return f"syn_{hashlib.md5(key.encode()).hexdigest()[:8]}"
