"""Extract ship equipment loadouts from a streamed save (player-owned ships only).

Each installed engine/weapon/turret/shield/missile is a <component> under the ship's
<connections> subtree. The parent ship is found by walking ancestors.

Tier: STRUCTURAL — loadouts change only when the player refits a ship.
"""

from __future__ import annotations

import contextlib
import dataclasses
import sqlite3
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, fingerprint_for_tier, tables_for_tier
from x4_extract.dynamic.extractors.common import (
    ANCESTOR_WALK_LIMIT,
    component_class_registrations,
    element_attrs,
    extra_json_from_attrs,
)
from x4_extract.savefile.dispatch import Registration

_LOADOUT_CLASSES = ("engine", "weapon", "turret", "shieldgenerator", "missilelauncher")
_MAPPED_LOADOUT_ATTRS = frozenset({"id", "class", "macro", "connection", "ammunition", "owner"})


def _parent_ship_id(elem: etree._Element) -> str | None:
    """Walk up from a loadout component to its owning <component class='ship_*'>, but
    only when that ship is player-owned."""
    ancestor: etree._Element | None = elem.getparent()
    for _ in range(ANCESTOR_WALK_LIMIT):
        if ancestor is None:
            return None
        if ancestor.tag == "component":
            cls = ancestor.get("class", "")
            if cls.startswith("ship_"):
                if ancestor.get("owner") == "player":
                    return ancestor.get("id")
                return None  # not a player ship — skip
        ancestor = ancestor.getparent()
    return None


@dataclass(slots=True)
class LoadoutRow:
    ship_id: str
    slot_type: str
    slot_connection: str
    macro: str
    ammunition: int | None
    extra_json: str | None


@dataclass(slots=True)
class ShipLoadoutCollector:
    rows: list[LoadoutRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return component_class_registrations(_LOADOUT_CLASSES, self._on_slot)

    def _on_slot(self, elem: etree._Element) -> None:
        ship_id = _parent_ship_id(elem)
        if ship_id is None:
            return
        macro = elem.get("macro")
        if not macro:
            return
        cls = elem.get("class", "")
        conn = elem.get("connection", "")

        ammo_raw = elem.get("ammunition")
        ammunition: int | None = None
        if ammo_raw is not None:
            with contextlib.suppress(ValueError):
                ammunition = int(ammo_raw)

        self.rows.append(
            LoadoutRow(
                ship_id=ship_id,
                slot_type=cls,
                slot_connection=conn,
                macro=macro,
                ammunition=ammunition,
                extra_json=extra_json_from_attrs(element_attrs(elem), _MAPPED_LOADOUT_ATTRS),
            )
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return tables_for_tier(tier, Tier.STRUCTURAL, ("ship_loadouts",))

    def fingerprint(self, tier: Tier) -> str:
        return fingerprint_for_tier(
            tier,
            Tier.STRUCTURAL,
            (dataclasses.asdict(r) for r in self.rows),
        )

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.STRUCTURAL) or not self.rows:
            return
        conn.executemany(
            """
            INSERT OR REPLACE INTO ship_loadouts
                (ship_id, slot_type, slot_connection, macro, ammunition, extra_json)
            VALUES
                (:ship_id, :slot_type, :slot_connection, :macro, :ammunition, :extra_json)
            """,
            [dataclasses.asdict(r) for r in self.rows],
        )
