from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from x4_extract.static.id_name import append_id_name_rows


@dataclass(slots=True)
class ExtractResult:
    assignments: list[dict[str, str | None]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    out = ExtractResult()
    append_id_name_rows(
        xml_bytes,
        item_tag="assignment",
        id_column="assignment_id",
        rows=out.assignments,
    )
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM assignments")
    conn.executemany(
        "INSERT INTO assignments (assignment_id, name) VALUES (:assignment_id, :name)",
        result.assignments,
    )
