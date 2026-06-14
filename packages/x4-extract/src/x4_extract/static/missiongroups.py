"""Extract `libraries/missiongroups.xml` into the `mission_groups` table.

Provides the reference catalog of mission groups — faction guild missions, war
missions, and story plot chains. The save file references these groups indirectly
through faction/type affinity; the group definitions tell the UI what colour/
label/context to display.
"""

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
        name = el.get("name", "")
        faction = el.get("faction")
        enemy = el.get("enemy")
        is_story = el.get("story") == "true" or False

        out.groups.append({
            "group_id": group_id,
            "name": name,
            "faction": faction or None,
            "enemy": enemy or None,
            "is_story": is_story,
        })

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM mission_groups")
    conn.executemany(
        """INSERT INTO mission_groups
            (group_id, name, faction, enemy, is_story)
           VALUES
            (:group_id, :name, :faction, :enemy, :is_story)""",
        result.groups,
    )
