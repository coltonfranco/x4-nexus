"""Helpers for simple static id/name catalog extractors."""

from __future__ import annotations

from collections.abc import MutableSequence

from lxml import etree


def append_id_name_rows(
    xml_bytes: bytes,
    *,
    item_tag: str,
    id_column: str,
    rows: MutableSequence[dict[str, str | None]],
) -> None:
    """Append rows from simple XML elements that expose `id` and `name` attributes."""
    root = etree.fromstring(xml_bytes)
    for el in root.iterfind(item_tag):
        item_id = el.get("id")
        if item_id:
            rows.append({id_column: item_id, "name": el.get("name")})
