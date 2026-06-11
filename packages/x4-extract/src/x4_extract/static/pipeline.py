"""Orchestrator: extract XML from raw.db → write static.db.

Reads the pre-patched data lake (raw.db) and transforms it into structured tables.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from x4_extract.config import ExtractSettings
from x4_extract.db import apply_schema
from x4_extract.static import (
    diplomacy,
    drops,
    equip_mods,
    equipment,
    factions,
    loadouts,
    map,
    modules,
    npc_stations,
    regions,
    ships,
    station_types,
    terraforming,
    waregroups,
    wares,
)


def run(settings: ExtractSettings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    db_path = settings.data_dir / "static.db"
    raw_db_path = settings.data_dir / "raw.db"

    if not raw_db_path.exists():
        print("raw.db not found. Please run 'uv run x4c rebuild-datalake' first.")
        return

    # Always start with a fresh static.db — rebuild-static is a full replace, not a migration.
    apply_schema(settings.data_dir, "static")

    # Write to static.db in a transaction
    conn = sqlite3.connect(db_path)

    # Attach raw database so we can read from it
    conn.execute(f"ATTACH DATABASE '{raw_db_path.as_posix()}' AS raw")

    # Helper to fetch a file from raw.db. Case-insensitive because index/macros.xml
    # references lowercase paths (e.g. props/engines/macros/…) while the crawler
    # preserves the archives' original casing (props/Engines/…). An exact match drops
    # most base-game equipment macros; NOCASE recovers them.
    def get_raw_file(filepath: str) -> bytes | None:
        row = conn.execute(
            "SELECT content FROM raw.raw_files WHERE filepath = ? COLLATE NOCASE", (filepath,)
        ).fetchone()
        if row:
            return row[0].encode('utf-8')
        return None

    # Init localizer
    import dataclasses

    from x4_extract.i18n import Localizer
    localizer = Localizer(conn, "044")

    def _localize_result(result: Any) -> Any:
        """Recursively translates {page,text} macros in all strings within ExtractResult dicts."""
        if not dataclasses.is_dataclass(result):
            return result
        for field in dataclasses.fields(result):
            value = getattr(result, field.name)
            if isinstance(value, list):
                for row_dict in value:
                    for k, v in row_dict.items():
                        if isinstance(v, str) and "{" in v:
                            row_dict[k] = localizer.resolve(v)
        return result

    # Captured during the static pass, written to seed.db afterwards (gamestart snapshot).
    factions_result: Any | None = None
    god_result: Any | None = None

    try:
        with conn:
            def resolver(path: str) -> bytes:
                content = get_raw_file(path)
                if content is None and path.startswith("extensions/"):
                    # DLC macros index uses "extensions/<dlc>/assets/..." paths, but
                    # raw.db stores the same files at "assets/..." (cat-relative paths).
                    stripped = "/".join(path.split("/")[2:])
                    content = get_raw_file(stripped)
                if content is None:
                    raise KeyError(path)
                return content

            def resolve_name(name: str) -> bytes:
                filename = f"{name}.xml"
                row = conn.execute(
                    "SELECT content FROM raw.raw_files WHERE filename = ? COLLATE NOCASE", (filename,)
                ).fetchone()
                if row:
                    return row[0].encode('utf-8')
                raise KeyError(name)

            waregroups_xml = get_raw_file("libraries/waregroups.xml")
            if waregroups_xml:
                waregroups.write(conn, _localize_result(waregroups.extract(waregroups_xml)))

            wares_xml = get_raw_file("libraries/wares.xml")
            if wares_xml:
                wares.write(conn, _localize_result(wares.extract(wares_xml)))
                mods_xml = get_raw_file("libraries/equipmentmods.xml")
                if mods_xml:
                    equip_mods.write(conn, _localize_result(equip_mods.extract(mods_xml, wares_xml)))
                drops_xml = get_raw_file("libraries/drops.xml")
                if drops_xml:
                    drops.write(conn, _localize_result(drops.extract(drops_xml)))

            factions_xml = get_raw_file("libraries/factions.xml")
            if factions_xml:
                colors_xml = get_raw_file("libraries/colors.xml")
                factions_result = _localize_result(factions.extract(factions_xml, colors_xml))
                factions.write(conn, factions_result)  # definitions only; relations → seed.db

            macros_xml = get_raw_file("index/macros.xml")
            if macros_xml:
                modules.write(conn, _localize_result(modules.extract(macros_xml, resolver, resolve_name)))
                ships.write(conn, _localize_result(ships.extract(macros_xml, resolver, resolve_name)))
                equipment.write(conn, _localize_result(equipment.extract(macros_xml, resolver, resolve_name)))
                ships.update_derived_stats(conn)
                station_types.write(conn, _localize_result(station_types.extract(macros_xml, resolver)))

            loadouts_xml = get_raw_file("libraries/loadouts.xml")
            if loadouts_xml:
                loadouts.write(conn, _localize_result(loadouts.extract(loadouts_xml)))

            # Collect all map files — base game + per-DLC cluster/sector/zone files.
            # Must be fetched before regions so the sector mapping can be built.
            map_rows = conn.execute(
                "SELECT filepath, content FROM raw.raw_files "
                "WHERE filepath LIKE 'maps/xu_ep2_universe/%.xml'"
            ).fetchall()
            map_xmls: dict[str, bytes] = {}
            if map_rows:
                map_xmls = {
                    row[0].rsplit("/", 1)[-1]: row[1].encode("utf-8")
                    for row in map_rows
                }

            region_xml = get_raw_file("libraries/region_definitions.xml")
            if region_xml:
                region_sector_map = regions.build_region_sector_map(map_xmls) if map_xmls else None
                regions.write(conn, _localize_result(regions.extract(region_xml, region_sector_map)))

            if map_xmls:
                mapdefaults_xml = get_raw_file("libraries/mapdefaults.xml")
                if mapdefaults_xml:
                    map_xmls["mapdefaults.xml"] = mapdefaults_xml
                map.write(conn, _localize_result(map.extract(map_xmls)))

            # god.xml NPC stations are gamestart seed — captured here, written to seed.db below.
            god_xml = get_raw_file("libraries/god.xml")
            if god_xml:
                god_result = _localize_result(npc_stations.extract(god_xml))

            terraform_xml = get_raw_file("libraries/terraforming.xml")
            if terraform_xml:
                terraforming.write(conn, _localize_result(terraforming.extract(terraform_xml)))

            diplo_xml = get_raw_file("libraries/diplomacy.xml")
            if diplo_xml:
                diplomacy.write(conn, _localize_result(diplomacy.extract(diplo_xml)))
    finally:
        conn.close()

    # --- Build seed.db: the gamestart instance snapshot, separate from reference data. ---
    # static.db is now closed; attach it read-only so the derivations can map god.xml's
    # lowercase sector macros to canonical sector/cluster ids.
    apply_schema(settings.data_dir, "seed")
    seed_conn = sqlite3.connect(settings.data_dir / "seed.db")
    seed_conn.execute(f"ATTACH DATABASE '{db_path.as_posix()}' AS s")
    try:
        with seed_conn:
            if factions_result is not None:
                factions.write_relations(seed_conn, factions_result)
            if god_result is not None:
                npc_stations.write(seed_conn, god_result)
    finally:
        seed_conn.close()
