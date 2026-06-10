"""Extract `<savegame>` top-level metadata.

EXEMPLAR visitor — copy this shape for stations, factions, player, ships, etc:

    1. Collector dataclass that accumulates rows during the streaming pass.
    2. Bound methods as visitors, registered with the appropriate Targets.
    3. The tiered contract: `tables(tier)`, `fingerprint(tier)`, `flush(conn, tier)`.

Real structure, probed from autosave_02.xml.gz (game 8.00, build 590967):

    savegame(1) → info(2)            # <info> itself carries no attributes
        → save(3)   name="#001" date="1780927923"      # date is a unix timestamp
        → game(3)   version="800" build="590967" time="25825.499" code="576950"
        → player(3) name="Colton Franco" money="1515390" location="{20004,10011}"

IMPORTANT: the dispatch loop clears each element at its `end` event, so by the time
`<info>` ends its children are already wiped. We therefore register on the depth-3
children directly (guarded by `parent_tag="info"`), not on `<info>` itself.

Metadata policy: promote the obvious fields to columns; keep every other attribute on
those children in `extra_json` (prefixed by element) so nothing useful is lost.
"""

from __future__ import annotations

import dataclasses
import json
import sqlite3
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from lxml import etree

from x4_extract.dynamic.collector import Tier, hash_rows
from x4_extract.savefile.dispatch import Registration, Target

# Attributes promoted to columns, per child element; the rest go to extra_json.
_MAPPED = {
    "save": frozenset({"name", "date"}),
    "game": frozenset({"version", "build", "time"}),
    "player": frozenset({"name", "money"}),
}


@dataclass(slots=True)
class SaveMeta:
    save_path: Path
    save_name: str | None = None
    in_game_time_sec: int | None = None
    real_time_iso: str | None = None
    game_version: str | None = None
    game_build: str | None = None
    player_credits: int | None = None
    player_name: str | None = None
    extra_json: str | None = None


@dataclass(slots=True)
class MetaCollector:
    save_path: Path
    _save: dict[str, str] = field(default_factory=dict)
    _game: dict[str, str] = field(default_factory=dict)
    _player: dict[str, str] = field(default_factory=dict)
    _seen: bool = False

    def register(self) -> list[Registration]:
        return [
            Registration(Target(depth=3, tag="save", parent_tag="info"), self._on_save),
            Registration(Target(depth=3, tag="game", parent_tag="info"), self._on_game),
            Registration(Target(depth=3, tag="player", parent_tag="info"), self._on_player),
        ]

    def _on_save(self, elem: etree._Element) -> None:
        self._save = _attrs(elem)
        self._seen = True

    def _on_game(self, elem: etree._Element) -> None:
        self._game = _attrs(elem)
        self._seen = True

    def _on_player(self, elem: etree._Element) -> None:
        self._player = _attrs(elem)
        self._seen = True

    def _row(self) -> SaveMeta | None:
        if not self._seen:
            return None
        extra = {
            f"{name}.{k}": v
            for name, attrs in (("save", self._save), ("game", self._game), ("player", self._player))
            for k, v in attrs.items()
            if k not in _MAPPED[name]
        }
        return SaveMeta(
            save_path=self.save_path,
            save_name=self._save.get("name"),
            in_game_time_sec=_int(self._game.get("time")),
            real_time_iso=_unix_to_iso(self._save.get("date")),
            game_version=self._game.get("version"),
            game_build=self._game.get("build"),
            player_credits=_int(self._player.get("money")),
            player_name=self._player.get("name"),
            extra_json=json.dumps(extra, sort_keys=True) if extra else None,
        )

    # --- tiered contract -------------------------------------------------------
    def tables(self, tier: Tier) -> tuple[str, ...]:
        return ("save_meta",) if tier is Tier.VOLATILE else ()

    def fingerprint(self, tier: Tier) -> str:
        row = self._row()
        if tier is not Tier.VOLATILE or row is None:
            return ""
        return hash_rows([dataclasses.asdict(row)])

    def flush(self, conn: sqlite3.Connection, tier: Tier | None = None) -> None:
        row = self._row()
        if tier not in (None, Tier.VOLATILE) or row is None:
            return
        record = {
            **dataclasses.asdict(row),
            "save_path": str(row.save_path),
            "parsed_at": datetime.now(UTC).isoformat(),
        }
        conn.execute(
            """
            INSERT OR REPLACE INTO save_meta
                (save_path, save_name, in_game_time_sec, real_time_iso,
                 game_version, game_build, player_credits, player_name, extra_json, parsed_at)
            VALUES (:save_path, :save_name, :in_game_time_sec, :real_time_iso,
                    :game_version, :game_build, :player_credits, :player_name,
                    :extra_json, :parsed_at)
            """,
            record,
        )


def _attrs(elem: etree._Element) -> dict[str, str]:
    """All attributes coerced to str (lxml may type values as bytes)."""
    return {
        (k if isinstance(k, str) else k.decode()): (v if isinstance(v, str) else v.decode())
        for k, v in elem.attrib.items()
    }


def _int(v: str | None) -> int | None:
    return int(float(v)) if v is not None else None


def _unix_to_iso(v: str | None) -> str | None:
    if v is None:
        return None
    try:
        return datetime.fromtimestamp(int(v), tz=UTC).isoformat()
    except (ValueError, OverflowError, OSError):
        return v
