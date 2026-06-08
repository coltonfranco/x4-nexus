"""Orchestrator: parse one save → write dynamic.db → materialize routes.

NOT YET IMPLEMENTED. Shape:

    1. Skip if (path, mtime, size) hash matches the last successful run.
    2. Open `dynamic.new.db`, apply schema.
    3. Register visitors: meta, stations, station_offers, construction, trade_orders,
       economy_log. See savefile/extractors/meta.py for the visitor pattern.
    4. Call `savefile.dispatch.stream_save(path, registrations)`.
    5. After streaming, flush each collector to the DB.
    6. Run `ingest.distance.build_sector_distance(conn)`.
    7. Run `ingest.materialize.compute_top_routes(conn)`.
    8. Atomic-rename `dynamic.new.db` over `dynamic.db`.
"""

from __future__ import annotations

from pathlib import Path

from x4_api.config import Settings


def run(settings: Settings, save_path: Path) -> None:
    raise NotImplementedError(
        "Dynamic pipeline not yet implemented — follow the docstring; the meta "
        "visitor in savefile/extractors/meta.py is the exemplar."
    )
