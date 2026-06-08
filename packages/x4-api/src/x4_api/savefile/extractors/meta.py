"""Extract `<savegame>` top-level metadata.

EXEMPLAR visitor — copy this shape for stations, orders, economy_log, etc:

    1. Collector dataclass that accumulates rows during the streaming pass.
    2. Bound method as the visitor, registered with the appropriate Target.
    3. A `flush(conn)` that writes accumulated rows after the pass completes.

Keep visitors small. If the logic exceeds ~50 lines, split it into helper functions
in the same module.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from lxml import etree

from x4_api.savefile.dispatch import Registration, Target


@dataclass(slots=True)
class SaveMeta:
    save_path: Path
    save_name: str | None = None
    in_game_time_sec: int | None = None
    real_time_iso: str | None = None
    game_version: str | None = None
    player_credits: int | None = None


@dataclass(slots=True)
class MetaCollector:
    save_path: Path
    rows: list[SaveMeta] = field(default_factory=list)

    def register(self) -> list[Registration]:
        return [
            Registration(
                target=Target(depth=2, tag="info", parent_tag="savegame"),
                visitor=self._on_info,
            ),
        ]

    def _on_info(self, elem: etree._Element) -> None:
        self.rows.append(
            SaveMeta(
                save_path=self.save_path,
                save_name=elem.get("name"),
                in_game_time_sec=_int(elem.get("time")),
                real_time_iso=elem.get("rtime"),
                game_version=elem.get("version"),
                player_credits=_int(elem.findtext("money")),
            )
        )

    def flush(self, conn: sqlite3.Connection) -> None:
        if not self.rows:
            return
        now = datetime.now(UTC).isoformat()
        conn.executemany(
            """
            INSERT OR REPLACE INTO save_meta
                (save_path, save_name, in_game_time_sec, real_time_iso,
                 game_version, player_credits, parsed_at)
            VALUES (:save_path, :save_name, :in_game_time_sec, :real_time_iso,
                    :game_version, :player_credits, :parsed_at)
            """,
            [{**vars(r), "save_path": str(r.save_path), "parsed_at": now} for r in self.rows],
        )


def _int(v: str | None) -> int | None:
    return int(v) if v is not None else None
