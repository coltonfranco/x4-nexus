from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    orders: list[dict[str, str]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    for o in root.iterfind("order"):
        order_id = o.get("id")
        name = o.get("name")
        if order_id:
            out.orders.append({
                "order_id": order_id,
                "name": name,
            })
    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM orders")
    conn.executemany(
        "INSERT INTO orders (order_id, name) VALUES (:order_id, :name)",
        result.orders,
    )
