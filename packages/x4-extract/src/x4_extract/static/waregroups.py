"""Extract `libraries/waregroups.xml` into the `ware_groups` table."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    groups: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    for el in root:
        if callable(el.tag):
            continue
        group_id = el.get("id")
        if not group_id:
            continue
        tier_raw = el.get("tier")
        priority_raw = el.get("priority")
        out.groups.append({
            "group_id": group_id,
            "name": el.get("name"),
            "tags": el.get("tags"),
            "factory_name": el.get("factoryname"),
            "icon": el.get("icon"),
            "factory_map_icon": el.get("factorymapicon"),
            "factory_hud_icon": el.get("factoryhudicon"),
            "tier": int(tier_raw) if tier_raw else None,
            "priority": int(priority_raw) if priority_raw else None,
        })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM ware_groups")
    conn.executemany(
        """INSERT INTO ware_groups
            (group_id, name, tags, factory_name, icon,
             factory_map_icon, factory_hud_icon, tier, priority)
           VALUES
            (:group_id, :name, :tags, :factory_name, :icon,
             :factory_map_icon, :factory_hud_icon, :tier, :priority)""",
        result.groups,
    )
