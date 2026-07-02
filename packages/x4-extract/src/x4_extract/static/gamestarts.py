"""Extract `libraries/gamestarts.xml` into gamestart tables.

Each gamestart defines a player starting scenario: starting ship(s) with full
equipment loadouts, inventory items, faction relations, skills, and universe
configuration.  This is the "New Game" menu data.
"""

from __future__ import annotations

import sqlite3
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    gamestarts: list[dict[str, Any]] = field(default_factory=list)
    ships: list[dict[str, Any]] = field(default_factory=list)
    ship_equipment: list[dict[str, Any]] = field(default_factory=list)
    inventory: list[dict[str, Any]] = field(default_factory=list)
    relations: list[dict[str, Any]] = field(default_factory=list)
    skills: list[dict[str, Any]] = field(default_factory=list)
    stories: list[dict[str, Any]] = field(default_factory=list)
    encyclopedia: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    # Pre-load group names for display
    groups: dict[str, dict[str, str | None]] = {}
    for group_el in root.iterfind("groups/group"):
        gid = group_el.get("id")
        if gid:
            groups[gid] = {
                "name": group_el.get("name"),
                "description": group_el.get("description"),
            }

    for gs_el in root.iterfind("gamestart"):
        gs_id = gs_el.get("id")
        if not gs_id:
            continue

        group_id = gs_el.get("group", "")
        group_info = groups.get(group_id, {})

        # ── Universe settings ──
        universe_el = gs_el.find("universe")
        jobs_el = universe_el.find("jobs") if universe_el is not None else None
        god_el = universe_el.find("god") if universe_el is not None else None
        mt_el = universe_el.find("masstraffic") if universe_el is not None else None

        # ── Location ──
        loc_el = gs_el.find("location")

        # ── Player ──
        pl_el = gs_el.find("player")

        out.gamestarts.append({
            "gamestart_id": gs_id,
            "name": gs_el.get("name"),
            "description": gs_el.get("description"),
            "image": gs_el.get("image"),
            "group_id": group_id,
            "group_name": group_info.get("name"),
            "tags": gs_el.get("tags"),
            "debug": 1 if gs_el.get("debug") == "true" else 0,
            # Location
            "location_galaxy": loc_el.get("galaxy") if loc_el is not None else None,
            "location_sector": loc_el.get("sector") if loc_el is not None else None,
            "location_zone": loc_el.get("zone") if loc_el is not None else None,
            "location_station": loc_el.get("station") if loc_el is not None else None,
            "location_docked": 1 if loc_el is not None and loc_el.get("docked") == "true" else 0,
            # Player
            "player_macro": pl_el.get("macro") if pl_el is not None else None,
            "player_money": _int(pl_el, "money") if pl_el is not None else None,
            "player_name": pl_el.get("name") if pl_el is not None else None,
            "player_female": 1 if pl_el is not None and pl_el.get("female") == "true" else 0,
            # Universe
            "universe_ventures": 0 if universe_el is not None and universe_el.get("ventures") == "false" else 1,
            "universe_visitors": 0 if universe_el is not None and universe_el.get("visitors") == "false" else 1,
            "universe_online_inventory": 0 if universe_el is not None and universe_el.get("onlineinventory") == "false" else 1,
            "jobs_enabled": 0 if jobs_el is not None and jobs_el.get("enabled") == "false" else 1,
            "god_enabled": 0 if god_el is not None and god_el.get("enabled") == "false" else 1,
            "masstraffic_enabled": 0 if mt_el is not None and mt_el.get("enabled") == "false" else 1,
        })

        # ── Starting ships ──
        macros_el = gs_el.find("macros")
        if macros_el is not None:
            for ship_el in macros_el.iterfind("ship"):
                macro = ship_el.get("macro")
                if not macro:
                    continue
                lo_ref = ship_el.find("loadout")
                out.ships.append({
                    "gamestart_id": gs_id,
                    "macro": macro,
                    "name": ship_el.get("name"),
                    "loadout_ref": lo_ref.get("ref") if lo_ref is not None else None,
                })

        # ── Ship equipment (macros subtree) ──
        for kind in ("engine", "shield", "weapon", "turret", "thruster"):
            for eq_el in gs_el.iterfind(f"macros/ship/{kind}"):
                macro = eq_el.get("macro")
                if macro:
                    out.ship_equipment.append({
                        "gamestart_id": gs_id,
                        "kind": kind,
                        "macro": macro,
                        "slot_path": eq_el.get("path"),
                        "optional": 1 if eq_el.get("optional") in ("1", "true") else 0,
                        "weaponmode": eq_el.get("weaponmode"),
                        "ware": eq_el.get("ware"),
                    })
        # Software
        for sw_el in gs_el.iterfind("macros/ship/software"):
            ware = sw_el.get("ware")
            if ware:
                out.ship_equipment.append({
                    "gamestart_id": gs_id,
                    "kind": "software",
                    "macro": ware,
                    "slot_path": None,
                    "optional": 0,
                    "weaponmode": None,
                    "ware": None,
                })

        # ── Player inventory ──
        inv_el = pl_el.find("inventory") if pl_el is not None else None
        if inv_el is not None:
            for ware_el in inv_el.iterfind("ware"):
                ware_id = ware_el.get("ware")
                if ware_id:
                    out.inventory.append({
                        "gamestart_id": gs_id,
                        "ware_id": ware_id,
                        "amount": _int(ware_el, "amount") or 1,
                    })

        # ── Faction relations ──
        for rel_el in gs_el.iterfind("relations/relation"):
            faction = rel_el.get("faction")
            rel_val = rel_el.get("relation")
            if faction and rel_val:
                with suppress(ValueError):
                    out.relations.append({
                        "gamestart_id": gs_id,
                        "faction_id": faction,
                        "relation": float(rel_val),
                    })

        # ── Player skills ──
        skills_el = gs_el.find("skills")
        if skills_el is not None:
            for sk_el in skills_el.iterfind("skill"):
                stype = sk_el.get("type")
                sval = sk_el.get("value")
                if stype and sval:
                    out.skills.append({
                        "gamestart_id": gs_id,
                        "skill_type": stype,
                        "value": int(sval),
                    })

        # ── Story missions ──
        def _collect_stories(container: etree._Element, gamestart_id: str = gs_id) -> None:
            for st_el in container.iterfind("story"):
                ref = st_el.get("ref")
                if ref:
                    out.stories.append({
                        "gamestart_id": gamestart_id,
                        "story_ref": ref,
                        "story_group": st_el.get("group"),
                        "story_index": _int(st_el, "index"),
                    })

        story_el = gs_el.find("story")
        if story_el is not None:
            _collect_stories(story_el)
        else:
            # Some gamestarts (e.g. custom_budgeted) wrap stories in <budget>.
            budget_el = gs_el.find("budget")
            if budget_el is not None:
                _collect_stories(budget_el)

        # ── Encyclopedia entries ──
        enc_el = gs_el.find("encyclopedia")
        if enc_el is not None:
            for e_el in enc_el.iterfind("entry"):
                ref = e_el.get("ref")
                if ref:
                    out.encyclopedia.append({
                        "gamestart_id": gs_id,
                        "entry_ref": ref,
                        "entry_type": e_el.get("type"),
                    })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM gamestart_encyclopedia")
    conn.execute("DELETE FROM gamestart_stories")
    conn.execute("DELETE FROM gamestart_skills")
    conn.execute("DELETE FROM gamestart_relations")
    conn.execute("DELETE FROM gamestart_inventory")
    conn.execute("DELETE FROM gamestart_equipment")
    conn.execute("DELETE FROM gamestart_ships")
    conn.execute("DELETE FROM gamestarts")

    conn.executemany(
        """INSERT INTO gamestarts
            (gamestart_id, name, description, image, group_id, group_name, tags, debug,
             location_galaxy, location_sector, location_zone, location_station, location_docked,
             player_macro, player_money, player_name, player_female,
             universe_ventures, universe_visitors, universe_online_inventory,
             jobs_enabled, god_enabled, masstraffic_enabled)
           VALUES
            (:gamestart_id, :name, :description, :image, :group_id, :group_name, :tags, :debug,
             :location_galaxy, :location_sector, :location_zone, :location_station, :location_docked,
             :player_macro, :player_money, :player_name, :player_female,
             :universe_ventures, :universe_visitors, :universe_online_inventory,
             :jobs_enabled, :god_enabled, :masstraffic_enabled)""",
        result.gamestarts,
    )
    if result.ships:
        conn.executemany(
            "INSERT INTO gamestart_ships (gamestart_id, macro, name, loadout_ref) "
            "VALUES (:gamestart_id, :macro, :name, :loadout_ref)",
            result.ships,
        )
    if result.ship_equipment:
        conn.executemany(
            "INSERT INTO gamestart_equipment (gamestart_id, kind, macro, slot_path, optional, weaponmode, ware) "
            "VALUES (:gamestart_id, :kind, :macro, :slot_path, :optional, :weaponmode, :ware)",
            result.ship_equipment,
        )
    if result.inventory:
        conn.executemany(
            "INSERT INTO gamestart_inventory (gamestart_id, ware_id, amount) "
            "VALUES (:gamestart_id, :ware_id, :amount)",
            result.inventory,
        )
    if result.relations:
        conn.executemany(
            "INSERT INTO gamestart_relations (gamestart_id, faction_id, relation) "
            "VALUES (:gamestart_id, :faction_id, :relation)",
            result.relations,
        )
    if result.skills:
        conn.executemany(
            "INSERT INTO gamestart_skills (gamestart_id, skill_type, value) "
            "VALUES (:gamestart_id, :skill_type, :value)",
            result.skills,
        )
    if result.stories:
        conn.executemany(
            "INSERT INTO gamestart_stories (gamestart_id, story_ref, story_group, story_index) "
            "VALUES (:gamestart_id, :story_ref, :story_group, :story_index)",
            result.stories,
        )
    if result.encyclopedia:
        conn.executemany(
            "INSERT INTO gamestart_encyclopedia (gamestart_id, entry_ref, entry_type) "
            "VALUES (:gamestart_id, :entry_ref, :entry_type)",
            result.encyclopedia,
        )


def _int(el: etree._Element | None, attr: str) -> int | None:
    if el is None:
        return None
    v = el.get(attr)
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return None
