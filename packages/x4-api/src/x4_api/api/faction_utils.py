"""Shared helpers for faction name disambiguation.

Several static factions share the same display name (e.g. "Criminal" for
criminal, outlaw, and smuggler).  This module provides a single function that
takes rows with ``faction_id`` and ``name`` / ``faction_name`` columns and
returns them with duplicates appended by their id.  Every endpoint that returns
faction names should route through here so the distinction is uniform.
"""

from __future__ import annotations

from typing import Any


def disambiguate(
    rows: list[dict[str, Any]],
    *,
    name_col: str = "name",
    id_col: str = "faction_id",
) -> list[dict[str, Any]]:
    """Return *rows* with duplicate *name_col* values suffixed ``(faction_id)``."""
    counts: dict[str, int] = {}
    for r in rows:
        n = r[name_col] or ""
        counts[n] = counts.get(n, 0) + 1
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        if counts.get(d[name_col] or "", 0) > 1:
            d[name_col] = f"{d[name_col]} ({d[id_col]})"
        out.append(d)
    return out
