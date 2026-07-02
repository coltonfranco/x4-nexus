from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from x4_extract.static.id_name import append_id_name_rows


@dataclass(slots=True)
class ExtractResult:
    behaviours: list[dict[str, str | None]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    out = ExtractResult()
    append_id_name_rows(
        xml_bytes,
        item_tag="behaviour",
        id_column="behaviour_id",
        rows=out.behaviours,
    )
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM behaviours")
    conn.executemany(
        "INSERT INTO behaviours (behaviour_id, name) VALUES (:behaviour_id, :name)",
        result.behaviours,
    )
