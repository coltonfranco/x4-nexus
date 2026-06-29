"""Extract `libraries/drops.xml` into drop tables.

Structure of the source file:
  - <ammo id="basket_ammo_*"> and <wares id="basket_wares_*"> — reusable loot pools
  - <droplist id="..."> — named drop tables that reference baskets or have inline wares

The extractor resolves basket references into `drop_list_wares` rows so queries
like "what drops ware X?" need only a single index scan on that table.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    baskets: list[dict[str, Any]] = field(default_factory=list)
    basket_entries: list[dict[str, Any]] = field(default_factory=list)
    lists: list[dict[str, Any]] = field(default_factory=list)
    list_wares: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    # First pass: collect all baskets
    basket_entries: dict[str, list[dict[str, Any]]] = {}

    for el in root:
        if callable(el.tag):
            continue
        if el.tag not in ("ammo", "wares"):
            continue
        basket_id = el.get("id")
        if not basket_id:
            continue
        basket_type = el.tag  # 'ammo' or 'wares'
        out.baskets.append({"basket_id": basket_id, "basket_type": basket_type})

        entries: list[dict[str, Any]] = []
        for select_el in el.findall("select"):
            weight_raw = select_el.get("weight")
            weight = int(weight_raw) if weight_raw and weight_raw.isdigit() else 1

            if basket_type == "ammo":
                # <select weight="7" macro="missile_cluster_light_mk1_macro" min="2" max="4"/>
                macro = select_el.get("macro")
                min_raw = select_el.get("min")
                max_raw = select_el.get("max")
                entry = {
                    "basket_id": basket_id,
                    "ware_id": None,
                    "macro": macro,
                    "weight": weight,
                    "min_amount": int(min_raw) if min_raw else 1,
                    "max_amount": int(max_raw) if max_raw else 1,
                }
                entries.append(entry)
                out.basket_entries.append(entry)
            else:
                # <select weight="7"><ware ware="inv_algaescrubber" min="1" max="3"/></select>
                ware_el = select_el.find("ware")
                if ware_el is not None:
                    ware_id = ware_el.get("ware")
                    min_raw = ware_el.get("min")
                    max_raw = ware_el.get("max")
                    entry = {
                        "basket_id": basket_id,
                        "ware_id": ware_id,
                        "macro": None,
                        "weight": weight,
                        "min_amount": int(min_raw) if min_raw else 1,
                        "max_amount": int(max_raw) if max_raw else 1,
                    }
                    entries.append(entry)
                    out.basket_entries.append(entry)

        basket_entries[basket_id] = entries

    # Pre-compute total weight per basket for item_chance calculation
    basket_totals: dict[str, float] = {
        bid: float(sum(e["weight"] for e in entries if e["weight"] is not None))
        for bid, entries in basket_entries.items()
    }

    def _basket_chance(basket_id: str, weight: int | None) -> float | None:
        total = basket_totals.get(basket_id, 0.0)
        if total > 0 and weight is not None:
            return round(weight / total * 100, 1)
        return None

    # Second pass: droplists
    for el in root:
        if callable(el.tag) or el.tag != "droplist":
            continue
        list_id = el.get("id")
        if not list_id:
            continue

        category = _categorize(list_id)
        out.lists.append({"list_id": list_id, "category": category})

        for drop_el in el.findall("drop"):
            chance_raw = drop_el.get("chance")
            spawn_chance = int(chance_raw) if chance_raw and chance_raw.isdigit() else None

            collectable_el = drop_el.find("collectable")
            if collectable_el is None:
                continue

            # Wares: basket ref or inline
            wares_el = collectable_el.find("wares")
            if wares_el is not None:
                ref = wares_el.get("ref")
                if ref:
                    # Basket reference — expand entries, compute item_chance from basket totals
                    for entry in basket_entries.get(ref, []):
                        out.list_wares.append({
                            "list_id": list_id,
                            "ware_id": entry["ware_id"],
                            "spawn_chance": spawn_chance,
                            "item_chance": _basket_chance(ref, entry["weight"]),
                            "weight": entry["weight"],
                            "min_amount": entry["min_amount"],
                            "max_amount": entry["max_amount"],
                            "source_basket": ref,
                        })
                else:
                    # Inline wares — two sub-forms
                    # Form A: <wares><ware ware="..." min="..." max="..."/></wares>  (all drop, no selection)
                    for ware_el in wares_el.findall("ware"):
                        ware_id = ware_el.get("ware")
                        if not ware_id:
                            continue
                        min_raw = ware_el.get("min") or ware_el.get("amount")
                        max_raw = ware_el.get("max") or ware_el.get("amount")
                        out.list_wares.append({
                            "list_id": list_id,
                            "ware_id": ware_id,
                            "spawn_chance": spawn_chance,
                            "item_chance": None,  # all items drop — no selection
                            "weight": None,
                            "min_amount": int(min_raw) if min_raw else 1,
                            "max_amount": int(max_raw) if max_raw else 1,
                            "source_basket": None,
                        })
                    # Form B: <wares selection="random"><select weight="..."><ware .../></select></wares>
                    # Collect all items first to compute total weight for this drop event
                    inline_selects = []
                    for select_el in wares_el.findall("select"):
                        weight_raw = select_el.get("weight")
                        weight = int(weight_raw) if weight_raw and weight_raw.isdigit() else 1
                        ware_el = select_el.find("ware")
                        if ware_el is None:
                            continue
                        ware_id = ware_el.get("ware")
                        if not ware_id:
                            continue
                        min_raw = ware_el.get("min")
                        max_raw = ware_el.get("max")
                        inline_selects.append({
                            "ware_id": ware_id,
                            "weight": weight,
                            "min_amount": int(min_raw) if min_raw else 1,
                            "max_amount": int(max_raw) if max_raw else 1,
                        })
                    inline_total = float(sum(s["weight"] for s in inline_selects))
                    for s in inline_selects:
                        out.list_wares.append({
                            "list_id": list_id,
                            "ware_id": s["ware_id"],
                            "spawn_chance": spawn_chance,
                            "item_chance": round(s["weight"] / inline_total * 100, 1) if inline_total > 0 else None,
                            "weight": s["weight"],
                            "min_amount": s["min_amount"],
                            "max_amount": s["max_amount"],
                            "source_basket": None,
                        })

            # Ammo basket ref
            ammo_el = collectable_el.find("ammo")
            if ammo_el is not None:
                ref = ammo_el.get("ref")
                if ref:
                    for entry in basket_entries.get(ref, []):
                        if entry.get("macro"):
                            out.list_wares.append({
                                "list_id": list_id,
                                "ware_id": entry["macro"],  # store missile macro as ware_id
                                "spawn_chance": spawn_chance,
                                "item_chance": _basket_chance(ref, entry["weight"]),
                                "weight": entry["weight"],
                                "min_amount": entry["min_amount"],
                                "max_amount": entry["max_amount"],
                                "source_basket": ref,
                            })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM drop_list_wares")
    conn.execute("DELETE FROM drop_lists")
    conn.execute("DELETE FROM drop_basket_entries")
    conn.execute("DELETE FROM drop_baskets")

    conn.executemany(
        "INSERT INTO drop_baskets (basket_id, basket_type) VALUES (:basket_id, :basket_type)",
        result.baskets,
    )
    conn.executemany(
        """INSERT INTO drop_basket_entries
            (basket_id, ware_id, macro, weight, min_amount, max_amount)
           VALUES
            (:basket_id, :ware_id, :macro, :weight, :min_amount, :max_amount)""",
        result.basket_entries,
    )
    conn.executemany(
        "INSERT INTO drop_lists (list_id, category) VALUES (:list_id, :category)",
        result.lists,
    )
    conn.executemany(
        """INSERT INTO drop_list_wares
            (list_id, ware_id, spawn_chance, item_chance, weight, min_amount, max_amount, source_basket)
           VALUES
            (:list_id, :ware_id, :spawn_chance, :item_chance, :weight, :min_amount, :max_amount, :source_basket)""",
        result.list_wares,
    )


def _categorize(list_id: str) -> str:
    if list_id.startswith("ship_") or list_id.startswith("masstraffic_"):
        return "ship" if list_id.startswith("ship_") else "masstraffic"
    if "lockbox" in list_id:
        return "lockbox"
    if list_id.startswith("asteroid_") or list_id.startswith("extradrops_"):
        return "asteroid"
    if list_id.startswith("drops_crystal_"):
        return "crystal"
    if list_id.startswith("erlking_") or list_id.startswith("drops_"):
        return "story"
    return "other"
