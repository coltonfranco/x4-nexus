from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from x4_extract.static.id_name import append_id_name_rows


@dataclass(slots=True)
class ExtractResult:
    orders: list[dict[str, str | None]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    out = ExtractResult()
    append_id_name_rows(
        xml_bytes,
        item_tag="order",
        id_column="order_id",
        rows=out.orders,
    )
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM orders")
    conn.executemany(
        "INSERT INTO orders (order_id, name) VALUES (:order_id, :name)",
        result.orders,
    )
