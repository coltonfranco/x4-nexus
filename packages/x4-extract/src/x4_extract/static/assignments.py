from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    assignments: list[dict[str, str]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    for a in root.iterfind("assignment"):
        aid = a.get("id")
        name = a.get("name")
        if aid:
            out.assignments.append({
                "assignment_id": aid,
                "name": name,
            })
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM assignments")
    conn.executemany(
        "INSERT INTO assignments (assignment_id, name) VALUES (:assignment_id, :name)",
        result.assignments,
    )
