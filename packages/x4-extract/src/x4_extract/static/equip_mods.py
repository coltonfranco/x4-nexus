"""Extract equipment mod data from `libraries/equipmentmods.xml` + `libraries/wares.xml`.

equipmentmods.xml maps ware IDs to their category, stat, quality level, and min/max multipliers.
wares.xml supplies the display name, shortname, description, and pricing.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    mods: list[dict[str, Any]] = field(default_factory=list)
    bonuses: list[dict[str, Any]] = field(default_factory=list)


def extract(mods_bytes: bytes, wares_bytes: bytes) -> ExtractResult:
    """Parse equipmentmods.xml and wares.xml into equip_mods row dicts. Pure function."""
    ware_info = _build_ware_info(wares_bytes)

    root = etree.fromstring(mods_bytes)
    out = ExtractResult()

    for category_el in root:
        if callable(category_el.tag):
            continue
        category = category_el.tag.lower()

        for mod_el in category_el:
            if callable(mod_el.tag):
                continue
            stat = mod_el.tag.lower()
            ware_id = mod_el.get("ware")
            if not ware_id:
                continue

            info = ware_info.get(ware_id, {})

            quality_raw = mod_el.get("quality")
            quality = int(quality_raw) if quality_raw and quality_raw.isdigit() else None

            min_raw = mod_el.get("min")
            max_raw = mod_el.get("max")

            out.mods.append({
                "ware_id": ware_id,
                "name": info.get("name"),
                "shortname": info.get("shortname"),
                "description": info.get("description"),
                "category": category,
                "stat": stat,
                "quality": quality,
                "min_factor": float(min_raw) if min_raw else None,
                "max_factor": float(max_raw) if max_raw else None,
                "price_min": info.get("price_min"),
                "price_avg": info.get("price_avg"),
                "price_max": info.get("price_max"),
                "production_time": info.get("production_time"),
            })

            bonus_el = mod_el.find("bonus")
            if bonus_el is not None:
                chance_raw = bonus_el.get("chance")
                max_rolls_raw = bonus_el.get("max")
                chance = float(chance_raw) if chance_raw else None
                max_rolls = int(max_rolls_raw) if max_rolls_raw and max_rolls_raw.isdigit() else None

                for bonus_stat_el in bonus_el:
                    if callable(bonus_stat_el.tag):
                        continue
                    bonus_stat = bonus_stat_el.tag.lower()
                    b_min = bonus_stat_el.get("min")
                    b_max = bonus_stat_el.get("max")
                    b_weight = bonus_stat_el.get("weight")
                    out.bonuses.append({
                        "ware_id": ware_id,
                        "stat": bonus_stat,
                        "min_factor": float(b_min) if b_min else None,
                        "max_factor": float(b_max) if b_max else None,
                        "chance": chance,
                        "max_rolls": max_rolls,
                        "weight": int(b_weight) if b_weight and b_weight.isdigit() else None,
                    })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM equip_mod_bonuses")
    conn.execute("DELETE FROM equip_mods")
    conn.executemany(
        """INSERT INTO equip_mods
            (ware_id, name, shortname, description, category, stat, quality,
             min_factor, max_factor, price_min, price_avg, price_max, production_time)
           VALUES
            (:ware_id, :name, :shortname, :description, :category, :stat, :quality,
             :min_factor, :max_factor, :price_min, :price_avg, :price_max, :production_time)""",
        result.mods,
    )
    conn.executemany(
        """INSERT INTO equip_mod_bonuses
            (ware_id, stat, min_factor, max_factor, chance, max_rolls, weight)
           VALUES
            (:ware_id, :stat, :min_factor, :max_factor, :chance, :max_rolls, :weight)""",
        result.bonuses,
    )


def _build_ware_info(wares_bytes: bytes) -> dict[str, dict[str, Any]]:
    root = etree.fromstring(wares_bytes)
    info: dict[str, dict[str, Any]] = {}
    for ware_el in root.iterfind("ware"):
        ware_id = ware_el.get("id")
        if not ware_id or not ware_id.startswith("mod_"):
            continue
        price_el = ware_el.find("price")
        prod_el = ware_el.find("production")
        info[ware_id] = {
            "name": ware_el.get("name"),
            "shortname": ware_el.get("shortname"),
            "description": ware_el.get("description"),
            "price_min": _int(price_el, "min"),
            "price_avg": _int(price_el, "average"),
            "price_max": _int(price_el, "max"),
            "production_time": _float(prod_el, "time"),
        }
    return info


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


def _float(el: etree._Element | None, attr: str) -> float | None:
    if el is None:
        return None
    v = el.get(attr)
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None
