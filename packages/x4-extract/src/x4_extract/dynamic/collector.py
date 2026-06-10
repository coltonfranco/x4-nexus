"""Tiered collector contract for save-file extraction.

Every save refresh re-streams the whole file (gzip isn't seekable), but not every
table needs rewriting each tick. Collectors tag their tables as:

    STRUCTURAL — rarely changes: station/module layout, fleet roster, sector ownership.
    VOLATILE   — changes every tick: trade offers, credits, relations, positions.

The pipeline accumulates all collectors in one streaming pass, then persists per tier:
a tier (and its derived artifacts) is only cleared + rewritten when its combined
content fingerprint differs from the last successful run.

A single collector may contribute to both tiers (e.g. stations are structural, their
trade offers are volatile). `flush(conn)` with no tier writes everything — the simple
path used by tests and one-shot ingestion.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from collections.abc import Iterable, Mapping
from enum import StrEnum
from typing import Protocol, runtime_checkable

from x4_extract.savefile.dispatch import Registration


class Tier(StrEnum):
    STRUCTURAL = "structural"
    VOLATILE = "volatile"


TIERS = (Tier.STRUCTURAL, Tier.VOLATILE)


@runtime_checkable
class Collector(Protocol):
    """A streaming save extractor. Implementations are dataclasses (structural typing)."""

    def register(self) -> list[Registration]:
        """Visitor registrations for the dispatch pass."""
        ...

    def tables(self, tier: Tier) -> tuple[str, ...]:
        """Tables this collector owns for `tier` (cleared before a tiered rewrite)."""
        ...

    def fingerprint(self, tier: Tier) -> str:
        """Stable hash of accumulated rows for `tier` ("" when this collector has none)."""
        ...

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        """Write accumulated rows. `tier=None` writes all tiers (clears assumed done)."""
        ...


def hash_rows(rows: Iterable[Mapping[str, object]]) -> str:
    """Order-independent content hash of row dicts. Empty input → "" (no-data sentinel)."""
    digests = sorted(
        hashlib.sha256(json.dumps(r, sort_keys=True, default=str).encode()).hexdigest()
        for r in rows
    )
    if not digests:
        return ""
    h = hashlib.sha256()
    for d in digests:
        h.update(d.encode())
    return h.hexdigest()


def combined_fingerprint(collectors: Iterable[Collector], tier: Tier) -> str:
    """Fold all collectors' fingerprints for a tier into one. "" when the tier is empty."""
    parts = [fp for c in collectors if (fp := c.fingerprint(tier))]
    if not parts:
        return ""
    h = hashlib.sha256()
    for p in sorted(parts):
        h.update(p.encode())
    return h.hexdigest()
