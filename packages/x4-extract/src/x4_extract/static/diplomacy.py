"""Extract `libraries/diplomacy.xml` into diplomacy tables.

Captures the three player-facing sections:
  - Agent actions (negotiation / espionage / interference)
  - Faction gift preferences
  - Agent rank thresholds
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    actions: list[dict[str, Any]] = field(default_factory=list)
    bribe_wares: list[dict[str, Any]] = field(default_factory=list)
    gifts: list[dict[str, Any]] = field(default_factory=list)
    ranks: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    for action_el in root.findall("actions/action"):
        action_id = action_el.get("id")
        if not action_id:
            continue

        agent_el = action_el.find("agent")
        cost_el = action_el.find("cost")
        time_el = action_el.find("time")
        success_el = action_el.find("success")

        chance_raw = success_el.get("chance") if success_el is not None else None
        duration_raw = time_el.get("duration") if time_el is not None else None
        cooldown_raw = time_el.get("cooldown") if time_el is not None else None

        out.actions.append({
            "action_id": action_id,
            "category": action_el.get("category"),
            "name": action_el.get("name"),
            "description": action_el.get("description"),
            "hidden": 1 if action_el.get("hidden") == "true" else 0,
            "cost_influence": _int(cost_el, "influence") if cost_el is not None else None,
            "cost_money": _int(cost_el, "money") if cost_el is not None else None,
            "success_chance": int(chance_raw) if chance_raw and chance_raw.isdigit() else None,
            "duration_sec": int(duration_raw) if duration_raw and duration_raw.isdigit() else None,
            "cooldown_sec": int(cooldown_raw) if cooldown_raw and cooldown_raw.isdigit() else None,
            "agent_type": agent_el.get("type") if agent_el is not None else None,
            "agent_experience": _int(agent_el, "experience") if agent_el is not None else None,
            "risk": agent_el.get("risk") if agent_el is not None else None,
        })

        if cost_el is not None:
            wares_el = cost_el.find("wares")
            if wares_el is not None:
                ware_tags = wares_el.get("tags")
                specific_wares = wares_el.findall("ware")
                if specific_wares:
                    for w in specific_wares:
                        ware_id = w.get("ware")
                        amount_raw = w.get("amount")
                        out.bribe_wares.append({
                            "action_id": action_id,
                            "ware_id": ware_id,
                            "ware_tags": ware_tags,
                            "amount": int(amount_raw) if amount_raw else None,
                        })
                else:
                    # Tag-based requirement without specific ware list
                    out.bribe_wares.append({
                        "action_id": action_id,
                        "ware_id": None,
                        "ware_tags": ware_tags,
                        "amount": None,
                    })

    for el in root.findall("gifts/gift"):
        ware_id = el.get("ware")
        faction_raw = el.get("faction", "")
        if not ware_id or not faction_raw:
            continue
        # faction field is "[faction1, faction2, ...]" — strip brackets and split
        factions = [f.strip() for f in re.sub(r"[\[\]]", "", faction_raw).split(",") if f.strip()]
        for faction_id in factions:
            out.gifts.append({"ware_id": ware_id, "faction_id": faction_id})

    for el in root.findall("rank/level"):
        value_raw = el.get("value")
        bonus_raw = el.get("eventbonus")
        out.ranks.append({
            "min_value": int(value_raw) if value_raw and value_raw.isdigit() else None,
            "name": el.get("name"),
            "event_bonus": float(bonus_raw) if bonus_raw else None,
            "icon": el.get("icon"),
        })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM diplo_agent_ranks")
    conn.execute("DELETE FROM diplo_gifts")
    conn.execute("DELETE FROM diplo_action_bribe_wares")
    conn.execute("DELETE FROM diplo_actions")

    conn.executemany(
        """INSERT INTO diplo_actions
            (action_id, category, name, description, hidden,
             cost_influence, cost_money, success_chance,
             duration_sec, cooldown_sec, agent_type, agent_experience, risk)
           VALUES
            (:action_id, :category, :name, :description, :hidden,
             :cost_influence, :cost_money, :success_chance,
             :duration_sec, :cooldown_sec, :agent_type, :agent_experience, :risk)""",
        result.actions,
    )
    conn.executemany(
        """INSERT INTO diplo_action_bribe_wares (action_id, ware_id, ware_tags, amount)
           VALUES (:action_id, :ware_id, :ware_tags, :amount)""",
        result.bribe_wares,
    )
    conn.executemany(
        "INSERT INTO diplo_gifts (ware_id, faction_id) VALUES (:ware_id, :faction_id)",
        result.gifts,
    )
    conn.executemany(
        """INSERT INTO diplo_agent_ranks (min_value, name, event_bonus, icon)
           VALUES (:min_value, :name, :event_bonus, :icon)""",
        result.ranks,
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
