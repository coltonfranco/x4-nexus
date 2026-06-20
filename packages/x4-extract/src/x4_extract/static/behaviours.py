from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    behaviours: list[dict[str, str]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    for b in root.iterfind("behaviour"):
        bid = b.get("id")
        name = b.get("name")
        if bid:
            out.behaviours.append({
                "behaviour_id": bid,
                "name": name,
            })
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM behaviours")
    conn.executemany(
        "INSERT INTO behaviours (behaviour_id, name) VALUES (:behaviour_id, :name)",
        result.behaviours,
    )
