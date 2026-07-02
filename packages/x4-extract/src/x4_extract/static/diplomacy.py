"""Extract `libraries/diplomacy.xml` into diplomacy tables.

Captures:
  - Agent actions (negotiation / espionage / interference) with costs, rewards
  - Events (dynamic dilemmas presented to the player) with branching options
  - Faction gift preferences
  - Agent rank thresholds
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree

from x4_extract.parsing import xml_attr_float as _float
from x4_extract.parsing import xml_attr_int_or_none as _int


@dataclass(slots=True)
class ExtractResult:
    actions: list[dict[str, Any]] = field(default_factory=list)
    bribe_wares: list[dict[str, Any]] = field(default_factory=list)
    gifts: list[dict[str, Any]] = field(default_factory=list)
    ranks: list[dict[str, Any]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    event_options: list[dict[str, Any]] = field(default_factory=list)


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
        reward_el = action_el.find("reward")
        icon_el = action_el.find("icon")

        chance_raw = success_el.get("chance") if success_el is not None else None
        duration_raw = time_el.get("duration") if time_el is not None else None
        cooldown_raw = time_el.get("cooldown") if time_el is not None else None

        out.actions.append(
            {
                "action_id": action_id,
                "category": action_el.get("category"),
                "name": action_el.get("name"),
                "description": action_el.get("description"),
                "shortdescription": action_el.get("shortdescription"),
                "hidden": 1 if action_el.get("hidden") == "true" else 0,
                "is_unique": 1 if action_el.get("unique") == "true" else 0,
                "friendgroup": action_el.get("friendgroup"),
                "cost_influence": _int(cost_el, "influence") if cost_el is not None else None,
                "cost_money": _int(cost_el, "money") if cost_el is not None else None,
                "cost_maxinfluencefactor": _int(cost_el, "maxinfluencefactor")
                if cost_el is not None
                else None,
                "success_chance": int(chance_raw) if chance_raw and chance_raw.isdigit() else None,
                "success_weight": _int(success_el, "weight") if success_el is not None else None,
                "success_selectionbonus": success_el.get("selectionweightbonus")
                if success_el is not None
                else None,
                "success_text": success_el.get("text") if success_el is not None else None,
                "duration_sec": int(duration_raw)
                if duration_raw and duration_raw.isdigit()
                else None,
                "cooldown_sec": int(cooldown_raw)
                if cooldown_raw and cooldown_raw.isdigit()
                else None,
                "time_maxinfluencefactor": _int(time_el, "maxinfluencefactor")
                if time_el is not None
                else None,
                "agent_type": agent_el.get("type") if agent_el is not None else None,
                "agent_experience": _int(agent_el, "experience") if agent_el is not None else None,
                "risk": agent_el.get("risk") if agent_el is not None else None,
                "reward_influence": _int(reward_el, "influence") if reward_el is not None else None,
                "reward_text": reward_el.get("text") if reward_el is not None else None,
                "icon_active": icon_el.get("active") if icon_el is not None else None,
                "icon_image": icon_el.get("image") if icon_el is not None else None,
                "triggers_event": 1 if action_el.get("triggersevent") == "true" else 0,
            }
        )

        if cost_el is not None:
            wares_el = cost_el.find("wares")
            if wares_el is not None:
                ware_tags = wares_el.get("tags")
                specific_wares = wares_el.findall("ware")
                if specific_wares:
                    for w in specific_wares:
                        ware_id = w.get("ware")
                        amount_raw = w.get("amount")
                        out.bribe_wares.append(
                            {
                                "action_id": action_id,
                                "ware_id": ware_id,
                                "ware_tags": ware_tags,
                                "amount": int(amount_raw) if amount_raw else None,
                            }
                        )
                else:
                    # Tag-based requirement without specific ware list
                    out.bribe_wares.append(
                        {
                            "action_id": action_id,
                            "ware_id": None,
                            "ware_tags": ware_tags,
                            "amount": None,
                        }
                    )

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
        out.ranks.append(
            {
                "min_value": int(value_raw) if value_raw and value_raw.isdigit() else None,
                "name": el.get("name"),
                "event_bonus": float(bonus_raw) if bonus_raw else None,
                "icon": el.get("icon"),
            }
        )

    for event_el in root.findall("events/event"):
        event_id = event_el.get("id")
        if not event_id:
            continue
        icon_el = event_el.find("icon")
        out.events.append(
            {
                "event_id": event_id,
                "name": event_el.get("name"),
                "description": event_el.get("description"),
                "shortdescription": event_el.get("shortdescription"),
                "duration_sec": _int(event_el, "duration"),
                "icon_image": icon_el.get("image") if icon_el is not None else None,
            }
        )
        for opt_el in event_el.findall("options/option"):
            opt_id = opt_el.get("id")
            if not opt_id:
                continue
            opt_agent = opt_el.find("agent")
            opt_cost = opt_el.find("cost")
            opt_success = opt_el.find("success")
            opt_relation = opt_el.find("relation")
            opt_conclusion = opt_el.find("conclusion")
            opt_result = opt_el.find("result")
            out.event_options.append(
                {
                    "event_id": event_id,
                    "option_id": opt_id,
                    "name": opt_el.get("name"),
                    "description": opt_el.get("description"),
                    "menuposition": _int(opt_el, "menuposition"),
                    "agent_risk": opt_agent.get("risk") if opt_agent is not None else None,
                    "cost_influence": _int(opt_cost, "influence") if opt_cost is not None else None,
                    "cost_money": _int(opt_cost, "money") if opt_cost is not None else None,
                    "success_weight": _int(opt_success, "weight")
                    if opt_success is not None
                    else None,
                    "success_selectionbonus": opt_success.get("selectionweightbonus")
                    if opt_success is not None
                    else None,
                    "relation_value": _float(opt_relation, "value")
                    if opt_relation is not None
                    else None,
                    "conclusion_text": opt_conclusion.get("text")
                    if opt_conclusion is not None
                    else None,
                    "result_text": opt_result.get("text") if opt_result is not None else None,
                }
            )

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM diplo_event_options")
    conn.execute("DELETE FROM diplo_events")
    conn.execute("DELETE FROM diplo_agent_ranks")
    conn.execute("DELETE FROM diplo_gifts")
    conn.execute("DELETE FROM diplo_action_bribe_wares")
    conn.execute("DELETE FROM diplo_actions")

    conn.executemany(
        """INSERT INTO diplo_actions
            (action_id, category, name, description, shortdescription, hidden, is_unique,
             friendgroup, cost_influence, cost_money, cost_maxinfluencefactor,
             success_chance, success_weight, success_selectionbonus, success_text,
             duration_sec, cooldown_sec, time_maxinfluencefactor,
             agent_type, agent_experience, risk,
             reward_influence, reward_text,
             icon_active, icon_image, triggers_event)
           VALUES
            (:action_id, :category, :name, :description, :shortdescription, :hidden, :is_unique,
             :friendgroup, :cost_influence, :cost_money, :cost_maxinfluencefactor,
             :success_chance, :success_weight, :success_selectionbonus, :success_text,
             :duration_sec, :cooldown_sec, :time_maxinfluencefactor,
             :agent_type, :agent_experience, :risk,
             :reward_influence, :reward_text,
             :icon_active, :icon_image, :triggers_event)""",
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
    if result.events:
        conn.executemany(
            """INSERT INTO diplo_events (event_id, name, description, shortdescription, duration_sec, icon_image)
               VALUES (:event_id, :name, :description, :shortdescription, :duration_sec, :icon_image)""",
            result.events,
        )
    if result.event_options:
        conn.executemany(
            """INSERT INTO diplo_event_options
                (event_id, option_id, name, description, menuposition,
                 agent_risk, cost_influence, cost_money,
                 success_weight, success_selectionbonus,
                 relation_value, conclusion_text, result_text)
               VALUES
                (:event_id, :option_id, :name, :description, :menuposition,
                 :agent_risk, :cost_influence, :cost_money,
                 :success_weight, :success_selectionbonus,
                 :relation_value, :conclusion_text, :result_text)""",
            result.event_options,
        )
