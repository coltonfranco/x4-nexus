"""Extract `libraries/wares.xml` into the `wares`, `ware_production`, `ware_inputs` tables.

This is the EXEMPLAR for every static extractor. Copy this shape:

    1. A single `extract(xml_bytes) -> ExtractResult` pure function that takes bytes and
       returns row dicts. Pure functions are trivial to test with hand-crafted XML.
    2. A `write(conn, result)` function that does the INSERTs. Separating extraction from
       persistence keeps tests fast and makes the SQL reviewable.
    3. An orchestrator `run(conn, cat_index)` that glues catdat → extract → write.

DLC overlay: wares.xml from DLC/workshop packages uses Egosoft's <diff> syntax to patch
the base. The orchestrator applies diffs via `extract.diff_merge` BEFORE calling
`extract()` — extractors only ever see fully-merged XML.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Any

from lxml import etree


@dataclass(slots=True)
class ExtractResult:
    wares: list[dict[str, Any]] = field(default_factory=list)
    production: list[dict[str, Any]] = field(default_factory=list)
    inputs: list[dict[str, Any]] = field(default_factory=list)
    owners: list[dict[str, Any]] = field(default_factory=list)
    illegal: list[dict[str, Any]] = field(default_factory=list)


def extract(xml_bytes: bytes) -> ExtractResult:
    """Parse merged wares.xml bytes into row dicts. Pure function — no I/O."""
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()

    for ware_el in root.iterfind("ware"):
        ware_id = ware_el.get("id")
        if not ware_id:
            continue

        price_el = ware_el.find("price")
        transport = ware_el.get("transport")
        storage_class = transport if transport in ("container", "solid", "liquid") else None

        restriction_el = ware_el.find("restriction")
        use_el = ware_el.find("use")
        raw_tags = ware_el.get("tags", "").strip()

        out.wares.append(
            {
                "ware_id": ware_id,
                "name": ware_el.get("name", ware_id),
                "group_id": ware_el.get("group"),
                "transport": ware_el.get("transport"),
                "volume": float(ware_el.get("volume") or 1),
                "price_min": _int(price_el, "min") if price_el is not None else None,
                "price_avg": _int(price_el, "average") if price_el is not None else None,
                "price_max": _int(price_el, "max") if price_el is not None else None,
                "storage_class": storage_class,
                "tags": raw_tags if raw_tags else None,
                "restriction_licence": restriction_el.get("licence") if restriction_el is not None else None,
                "use_threshold": _float(use_el, "threshold") if use_el is not None else None,
                "icon_path": _icon_path(ware_el),
            }
        )

        for owner_el in ware_el.iterfind("owner"):
            faction = owner_el.get("faction")
            if faction:
                out.owners.append({"ware_id": ware_id, "faction_id": faction})

        for illegal_el in ware_el.iterfind("illegal"):
            factions_str = illegal_el.get("factions", "").strip()
            for faction in factions_str.split():
                out.illegal.append({"ware_id": ware_id, "faction_id": faction})

        for prod_el in ware_el.iterfind("production"):
            method = prod_el.get("method", "default")
            out.production.append(
                {
                    "ware_id": ware_id,
                    "method": method,
                    "time_sec": float(prod_el.get("time") or 0),
                    "amount": int(prod_el.get("amount") or 0),
                    "workforce": _int(prod_el.find("effects/effect[@type='work']"), "product"),
                }
            )
            for input_el in prod_el.iterfind("primary/ware"):
                input_id = input_el.get("ware")
                if not input_id:
                    continue
                out.inputs.append(
                    {
                        "ware_id": ware_id,
                        "method": method,
                        "input_ware_id": input_id,
                        "amount": int(input_el.get("amount") or 0),
                    }
                )

    return out


def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    """Replace ware rows in static.db. Caller wraps in a transaction."""
    conn.execute("DELETE FROM ware_illegal")
    conn.execute("DELETE FROM ware_owners")
    conn.execute("DELETE FROM ware_inputs")
    conn.execute("DELETE FROM ware_production")
    conn.execute("DELETE FROM wares")

    conn.executemany(
        """
        INSERT INTO wares (ware_id, name, group_id, transport, volume,
                           price_min, price_avg, price_max, storage_class,
                           tags, restriction_licence, use_threshold, icon_path)
        VALUES (:ware_id, :name, :group_id, :transport, :volume,
                :price_min, :price_avg, :price_max, :storage_class,
                :tags, :restriction_licence, :use_threshold, :icon_path)
        """,
        result.wares,
    )
    conn.executemany(
        """
        INSERT INTO ware_production (ware_id, method, time_sec, amount, workforce)
        VALUES (:ware_id, :method, :time_sec, :amount, :workforce)
        """,
        result.production,
    )
    conn.executemany(
        """
        INSERT INTO ware_inputs (ware_id, method, input_ware_id, amount)
        VALUES (:ware_id, :method, :input_ware_id, :amount)
        """,
        result.inputs,
    )
    conn.executemany(
        "INSERT INTO ware_owners (ware_id, faction_id) VALUES (:ware_id, :faction_id)",
        result.owners,
    )
    conn.executemany(
        "INSERT INTO ware_illegal (ware_id, faction_id) VALUES (:ware_id, :faction_id)",
        result.illegal,
    )


def _int(el: etree._Element | None, attr: str) -> int | None:
    if el is None:
        return None
    v = el.get(attr)
    if v is None:
        return None
    try:
        return int(v)
    except ValueError:
        return int(float(v))


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


def _icon_path(ware_el: etree._Element) -> str | None:
    icon = ware_el.find("icon")
    return icon.get("active") if icon is not None else None
