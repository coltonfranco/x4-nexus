"""Orchestrator: detect game patch → extract XML → write static.db.

NOT YET IMPLEMENTED. Shape it like this (the wares extractor is the model):

    1. Compute SHA-256 of every .cat path (text only) — compare against
       static.db `game_version.content_hash`. Skip the rest if unchanged.
    2. Build the merged .cat index via `extract.catdat.build_index`.
    3. For each library XML in scope (wares, modules, ships, factions, map, icons):
         a. Read base XML bytes via `read_entry`.
         b. Apply DLC + workshop overlays through `extract.diff_merge`.
         c. Call the module's `extract()` to get row dicts.
         d. Open static.db, BEGIN IMMEDIATE, call the module's `write()`, COMMIT.
    4. Update `game_version` row with new content_hash.

Write to `static.new.db`, then atomic-rename over `static.db` at the end so partially
extracted state never gets queried.
"""

from __future__ import annotations

from x4_api.config import Settings


def run(settings: Settings) -> None:
    raise NotImplementedError(
        "Static pipeline not yet implemented — follow the docstring and see "
        "extract/wares.py for the per-library shape."
    )
