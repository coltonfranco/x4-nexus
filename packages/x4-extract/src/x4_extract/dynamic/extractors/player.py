"""Extract the player's account, blueprints, and licences from a streamed save.

Probed structure (autosave_02.xml.gz):

  * Identity: a `<component class="player" macro="character_player_*" name="..."
    lastcontrolled="[0x..]" id="[0x..]">` — the player character entity.
  * Credits: the player faction's `<account amount="...">` at
    universe/factions/faction(id="player")/account.
  * Blueprints: `<blueprints><blueprint ware="..."/>` (deeply nested under the player
    HQ component — matched by tag+parent at any depth).
  * Licences: `<faction id="X"><licences><licence type="T" factions="X player"/>` —
    the player holds licence T from faction X when "player" is in the factions list.

Tier: VOLATILE — credits and holdings change during play.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.dynamic.extractors.common import extra_json_from_attrs
from x4_extract.savefile.dispatch import Registration, Target

_LICENCE_DEPTH = 6
_ACCOUNT_DEPTH = 5
_MAPPED_CHAR_ATTRS = frozenset({"id", "name", "macro", "lastcontrolled", "owner", "class"})


@dataclass(slots=True)
class PlayerCollector:
    _char: dict[str, str] = field(default_factory=dict)
    _credits: int | None = None
    _current_ship: str | None = None
    blueprints: set[str] = field(default_factory=set)
    licences: set[tuple[str, str]] = field(default_factory=set)  # (licence_type, granting faction)
    inventory: dict[str, int] = field(default_factory=dict)

    def register(self) -> list[Registration]:
        return [
            Registration(Target(tag="component", depth=None, class_attr="player"), self._on_player),
            Registration(
                Target(tag="account", depth=_ACCOUNT_DEPTH, parent_tag="faction"), self._on_account
            ),
            Registration(
                Target(tag="blueprint", depth=None, parent_tag="blueprints"), self._on_blueprint
            ),
            Registration(
                Target(tag="licence", depth=_LICENCE_DEPTH, parent_tag="licences"), self._on_licence
            ),
            Registration(
                Target(tag="ware", depth=None, parent_tag="inventory"), self._on_inventory_ware
            ),
        ]

    def _on_player(self, elem: etree._Element) -> None:
        # The character entity is the one carrying a name + a character macro.
        macro = elem.get("macro") or ""
        if elem.get("name") and macro.startswith("character"):
            self._char = {
                (k if isinstance(k, str) else k.decode()): (v if isinstance(v, str) else v.decode())
                for k, v in elem.attrib.items()
            }
        ref = elem.get("lastcontrolled") or elem.get("refobject")
        if ref:
            self._current_ship = ref

    def _on_account(self, elem: etree._Element) -> None:
        faction = elem.getparent()
        if faction is None or faction.get("id") != "player":
            return
        amount = elem.get("amount")
        if amount is not None:
            self._credits = int(float(amount))

    def _on_blueprint(self, elem: etree._Element) -> None:
        ware = elem.get("ware")
        if ware:
            self.blueprints.add(ware)

    def _on_licence(self, elem: etree._Element) -> None:
        licence_type = elem.get("type")
        if licence_type is None:
            return
        # Player licences are stored UNDER faction id="player"; the `factions` attr lists
        # the granting factions the player holds this licence type from.
        #   licence(6) → licences(5) → faction(4 id="player")
        licences = elem.getparent()
        faction = licences.getparent() if licences is not None else None
        if faction is None or faction.get("id") != "player":
            return
        for granter in (elem.get("factions") or "").split():
            self.licences.add((licence_type, granter))

    def _on_inventory_ware(self, elem: etree._Element) -> None:
        ware_id = elem.get("ware")
        if not ware_id:
            return
        inv = elem.getparent()
        comp = inv.getparent() if inv is not None else None
        if comp is None or comp.get("class") != "player":
            return
        amount = elem.get("amount")
        self.inventory[ware_id] = int(amount) if amount else 1

    def _player_row(self) -> dict[str, object] | None:
        if not self._char and self._credits is None and self._current_ship is None:
            return None
        return {
            "id": 1,
            "player_id": self._char.get("id"),
            "name": self._char.get("name"),
            "credits": self._credits,
            "hq_station_id": None,
            "current_sector": None,
            "current_ship_id": self._char.get("lastcontrolled") or self._current_ship,
            "extra_json": extra_json_from_attrs(self._char, _MAPPED_CHAR_ATTRS),
        }

    # --- delta source ----------------------------------------------------------
    def keyed_rows(self, tier: Tier) -> Iterable[tuple[str, str, Mapping[str, object]]]:
        """Singleton 'player' row; credit/current-ship changes surface as 'changed'."""
        if tier is not Tier.VOLATILE:
            return
        row = self._player_row()
        if row is None:
            return
        yield (
            "player",
            "player",
            {
                "name": row["name"],
                "credits": row["credits"],
                "current_ship_id": row["current_ship_id"],
            },
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        if tier is Tier.VOLATILE:
            return ("player", "player_blueprints", "player_licences", "player_inventory")
        return ()

    def fingerprint(self, tier: Tier) -> str:
        if tier is not Tier.VOLATILE:
            return ""
        return hash_rows(
            [
                {"player": self._player_row()},
                {"blueprints": sorted(self.blueprints)},
                {"licences": sorted(self.licences)},
                {"inventory": sorted(self.inventory.items())},
            ]
        )

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        if tier not in (None, Tier.VOLATILE):
            return
        row = self._player_row()
        if row is not None:
            conn.execute(
                """
                INSERT OR REPLACE INTO player
                    (id, player_id, name, credits, hq_station_id, current_sector,
                     current_ship_id, extra_json)
                VALUES (:id, :player_id, :name, :credits, :hq_station_id, :current_sector,
                        :current_ship_id, :extra_json)
                """,
                row,
            )
        conn.executemany(
            "INSERT OR REPLACE INTO player_blueprints (ware_id) VALUES (?)",
            [(w,) for w in sorted(self.blueprints)],
        )
        conn.executemany(
            "INSERT OR REPLACE INTO player_licences (licence_type, faction_id) VALUES (?, ?)",
            sorted(self.licences),
        )
        conn.executemany(
            "INSERT OR REPLACE INTO player_inventory (ware_id, amount) VALUES (?, ?)",
            [(w, a) for w, a in self.inventory.items()],
        )
