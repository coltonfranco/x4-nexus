"""Orchestrator: extract XML from raw.db -> write static.db.

Reads the pre-patched data lake (raw.db) and transforms it into structured tables.
"""

from __future__ import annotations

import sqlite3
import time
from collections.abc import Callable
from typing import Any

from x4_extract.config import ExtractSettings
from x4_extract.constants import DEFAULT_LANGUAGE_CODE
from x4_extract.db import apply_schema
from x4_extract.static import (
    assignments,
    behaviours,
    diplomacy,
    drops,
    equip_mods,
    equipment,
    factions,
    gamestarts,
    loadouts,
    map,
    missiongroups,
    modules,
    orders,
    races,
    regions,
    roles,
    ships,
    station_types,
    terraforming,
    texts,
    waregroups,
    wares,
)
from x4_extract.static.progress import elapsed as _elapsed
from x4_extract.static.progress import log_progress as _log
from x4_extract.static.raw import RawFileStore

# ── Logging helpers ────────────────────────────────────────────────────────────

def run(settings: ExtractSettings, on_progress: Callable[[str, float], None] | None = None) -> None:
    _step = [0]
    _total_steps = 26
    def _progress_log(msg: str) -> None:
        _log(msg)
        if on_progress:
            _step[0] += 1
            # Scale from 0.0 to 1.0 (since icons are now moved out)
            frac = (min(_step[0], _total_steps) / _total_steps)
            on_progress(msg.replace("Extracting: ", "").replace("Computing: ", "").capitalize(), frac)

    settings.data_dir.mkdir(parents=True, exist_ok=True)
    db_path = settings.data_dir / "static.db"
    raw_db_path = settings.data_dir / "raw.db"

    if not raw_db_path.exists():
        _progress_log("raw.db not found — run rebuild-datalake first")
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
    raw_files = RawFileStore(conn, schema="raw")
    get_raw_file = raw_files.get_path

    # Init localizer
    import dataclasses

    from x4_extract.i18n import Localizer
    localizer = Localizer(conn, DEFAULT_LANGUAGE_CODE)

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

    # Captured during the static pass.
    factions_result: Any | None = None

    _progress_log("Starting static rebuild")

    try:
        with conn:
            t0 = time.monotonic()
            _progress_log("Extracting: ware groups")
            waregroups_xml = get_raw_file("libraries/waregroups.xml")
            if waregroups_xml:
                waregroups.write(conn, _localize_result(waregroups.extract(waregroups_xml)))
                _progress_log(f"  -> {len(waregroups.extract(waregroups_xml).groups)} groups ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: mission groups")
            missiongroups_xml = get_raw_file("libraries/missiongroups.xml")
            if missiongroups_xml:
                missiongroups.write(conn, _localize_result(missiongroups.extract(missiongroups_xml)))
                _progress_log(f"  -> {len(missiongroups.extract(missiongroups_xml).groups)} groups ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: wares")
            wares_xml = get_raw_file("libraries/wares.xml")
            if wares_xml:
                result = wares.extract(wares_xml)  # extract() fills each ware's production tier
                wares.write(conn, _localize_result(result))
                _progress_log(f"  -> {len(result.wares)} wares ({_elapsed(t0)})")
                mods_xml = get_raw_file("libraries/equipmentmods.xml")
                if mods_xml:
                    t0 = time.monotonic()
                    _progress_log("Extracting: equipment mods")
                    mods_result = equip_mods.extract(mods_xml, wares_xml)
                    equip_mods.write(conn, _localize_result(mods_result))
                    _progress_log(f"  -> {len(mods_result.mods)} mods ({_elapsed(t0)})")
                drops_xml = get_raw_file("libraries/drops.xml")
                if drops_xml:
                    t0 = time.monotonic()
                    _progress_log("Extracting: drops")
                    drops_result = drops.extract(drops_xml)
                    drops.write(conn, _localize_result(drops_result))
                    _progress_log(f"  -> {len(drops_result.lists)} lists ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: factions")
            factions_xml = get_raw_file("libraries/factions.xml")
            if factions_xml:
                colors_xml = get_raw_file("libraries/colors.xml")
                factions_result = _localize_result(factions.extract(factions_xml, colors_xml))
                factions.write(conn, factions_result)  # definitions only; relations -> seed.db
                _progress_log(f"  -> {len(factions_result.factions)} factions ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: races")
            races_xml = get_raw_file("libraries/races.xml")
            if races_xml:
                races_result = _localize_result(races.extract(races_xml))
                races.write(conn, races_result)
                _progress_log(f"  -> {len(races_result.races)} races ({_elapsed(t0)})")

            macros_xml = get_raw_file("index/macros.xml")
            if macros_xml:
                # Bulk-load all raw_files into memory — the macros step
                # resolves thousands of paths and filenames.  Doing 8K+
                # individual DB queries (each with COLLATE NOCASE) is the
                # dominant cost in the entire pipeline.
                rows = conn.execute(
                    "SELECT filepath, content FROM raw.raw_files"
                ).fetchall()
                _all_raw: dict[str, bytes] = {
                    str(r[0]): str(r[1]).encode("utf-8") for r in rows
                }
                # Case-insensitive fallback: macro index uses lowercase paths
                # (assets/props/engines/…) but the cat archives preserve the
                # original casing (assets/props/Engines/…).
                _all_raw_lower = {k.lower(): v for k, v in _all_raw.items()}
                _by_filename: dict[str, bytes] = {}
                for path, content in _all_raw.items():
                    fn = path.rsplit("/", 1)[-1]
                    _by_filename.setdefault(fn.lower(), content)

                def cached_resolver(path: str) -> bytes:
                    if path in _all_raw:
                        return _all_raw[path]
                    lower = path.lower()
                    if lower in _all_raw_lower:
                        return _all_raw_lower[lower]
                    # DLC macros use "extensions/<dlc>/assets/..." paths.
                    if path.startswith("extensions/"):
                        stripped = "/".join(path.split("/")[2:])
                        if stripped in _all_raw:
                            return _all_raw[stripped]
                        sl = stripped.lower()
                        if sl in _all_raw_lower:
                            return _all_raw_lower[sl]
                    raise KeyError(path)

                def cached_resolve_name(name: str) -> bytes:
                    key = f"{name}.xml".lower()
                    if key in _by_filename:
                        return _by_filename[key]
                    raise KeyError(name)

                t0 = time.monotonic()
                _progress_log("Extracting: ships")
                s_result = ships.extract(macros_xml, cached_resolver, cached_resolve_name)
                ships.write(conn, _localize_result(s_result))
                _progress_log(f"  -> {len(s_result.ships)} ships ({_elapsed(t0)})")

                t0 = time.monotonic()
                _progress_log("Extracting: equipment")
                e_result = equipment.extract(macros_xml, cached_resolver, cached_resolve_name)
                equipment.write(conn, _localize_result(e_result))
                _progress_log(f"  -> {len(e_result.engines)} engines, {len(e_result.shields)} shields, {len(e_result.weapons)} weapons ({_elapsed(t0)})")

                t0 = time.monotonic()
                _progress_log("Extracting: modules")
                m_result = modules.extract(macros_xml, cached_resolver, cached_resolve_name)
                modules.write(conn, _localize_result(m_result))
                _progress_log(f"  -> {len(m_result.modules)} modules ({_elapsed(t0)})")

                t0 = time.monotonic()
                _progress_log("Extracting: station types")
                st_result = station_types.extract(macros_xml, cached_resolver)
                station_types.write(conn, _localize_result(st_result))
                _progress_log(f"  -> {len(st_result.stations)} types ({_elapsed(t0)})")

                t0 = time.monotonic()
                _progress_log("Computing: derived ship stats")
                ships.update_derived_stats(conn)
                _progress_log(f"  done ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: loadouts")
            loadouts_xml = get_raw_file("libraries/loadouts.xml")
            if loadouts_xml:
                lo_result = loadouts.extract(loadouts_xml)
                loadouts.write(conn, _localize_result(lo_result))
                _progress_log(f"  -> {len(lo_result.loadouts)} loadouts ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: map")
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
                map_result = map.extract(map_xmls)
                map.write(conn, _localize_result(map_result))
                _progress_log(f"  -> {len(map_result.clusters)} clusters, {len(map_result.sectors)} sectors ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: terraforming")
            terraform_xml = get_raw_file("libraries/terraforming.xml")
            if terraform_xml:
                tf_result = terraforming.extract(terraform_xml)
                terraforming.write(conn, _localize_result(tf_result))
                _progress_log(f"  -> {len(tf_result.projects)} projects ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: diplomacy")
            diplo_xml = get_raw_file("libraries/diplomacy.xml")
            if diplo_xml:
                d_result = diplomacy.extract(diplo_xml)
                diplomacy.write(conn, _localize_result(d_result))
                _progress_log(f"  -> {len(d_result.actions)} actions ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: gamestart stories")
            gamestarts_xml = get_raw_file("libraries/gamestarts.xml")
            if gamestarts_xml:
                gs_result = gamestarts.extract(gamestarts_xml)
                if gs_result.stories:
                    conn.execute("DELETE FROM gamestart_stories")
                    conn.executemany(
                        "INSERT INTO gamestart_stories (gamestart_id, story_ref, story_group, story_index) "
                        "VALUES (:gamestart_id, :story_ref, :story_group, :story_index)",
                        gs_result.stories,
                    )
                _progress_log(f"  -> {len(gs_result.stories)} stories ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: assignments")
            assign_xml = get_raw_file("libraries/assignments.xml")
            if assign_xml:
                a_result = assignments.extract(assign_xml)
                assignments.write(conn, _localize_result(a_result))
                _progress_log(f"  -> {len(a_result.assignments)} assignments ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: behaviours")
            behav_xml = get_raw_file("libraries/behaviours.xml")
            if behav_xml:
                b_result = behaviours.extract(behav_xml)
                behaviours.write(conn, _localize_result(b_result))
                _progress_log(f"  -> {len(b_result.behaviours)} behaviours ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: roles")
            roles_xml = get_raw_file("libraries/roles.xml")
            posts_xml = get_raw_file("libraries/posts.xml")
            if roles_xml:
                r_result = roles.extract(roles_xml, posts_xml)
                roles.write(conn, _localize_result(r_result))
                _progress_log(f"  -> {len(r_result.roles)} roles ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: texts")
            texts_xml = get_raw_file(f"t/0001-l{DEFAULT_LANGUAGE_CODE}.xml")
            if texts_xml:
                t_result = texts.extract(texts_xml)
                texts.write(conn, t_result)
                _progress_log(f"  -> {len(t_result.texts)} texts ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Extracting: orders (aiscripts)")
            # Get all aiscript files
            ai_rows = conn.execute(
                "SELECT content FROM raw.raw_files WHERE directory = 'aiscripts'"
            ).fetchall()
            if ai_rows:
                total_orders = 0
                conn.execute("DELETE FROM orders") # Clear table before loop
                for row in ai_rows:
                    o_result = orders.extract(row[0].encode("utf-8"))
                    if o_result.orders:
                        # localized right before insert
                        o_result = _localize_result(o_result)
                        conn.executemany(
                            "INSERT INTO orders (order_id, name) VALUES (:order_id, :name)",
                            o_result.orders,
                        )
                        total_orders += len(o_result.orders)
                _progress_log(f"  -> {total_orders} orders ({_elapsed(t0)})")

            t0 = time.monotonic()
            _progress_log("Computing: ware uses")
            conn.execute("DELETE FROM ware_uses")
            conn.execute('''
                INSERT INTO ware_uses (ware_id, use_type, use_value)
                SELECT DISTINCT wi.input_ware_id, 'category' AS use_type,
                    CASE
                        WHEN w.group_id IN ('weapons', 'turrets') THEN 'Ship Weapons'
                        WHEN w.group_id = 'shields' THEN 'Shields'
                        WHEN w.group_id = 'engines' THEN 'Engines'
                        WHEN w.group_id = 'thrusters' THEN 'Thrusters'
                        WHEN w.group_id = 'drones' THEN 'Drones'
                        WHEN w.group_id = 'missiles' THEN 'Missiles'
                        WHEN w.group_id = 'countermeasures' THEN 'Countermeasures'
                        WHEN w.group_id IN ('equipmod', 'paintmod') THEN 'Equipment Mods'
                        WHEN s.ship_id IS NOT NULL THEN 'Ships'
                        WHEN m.module_id IS NOT NULL THEN 'Station Modules'
                        WHEN ed.deployable_id IS NOT NULL THEN 'Deployables'
                    END AS use_value
                FROM ware_inputs wi
                JOIN wares w ON wi.ware_id = w.ware_id
                LEFT JOIN ships s ON w.component_ref = s.ship_id
                LEFT JOIN modules m ON w.component_ref = m.module_id
                LEFT JOIN equip_deployables ed ON w.component_ref = ed.deployable_id
                WHERE use_value IS NOT NULL
                
                UNION
                
                SELECT DISTINCT wi.input_ware_id, 'ware' AS use_type, w.ware_id AS use_value
                FROM ware_inputs wi
                JOIN wares w ON wi.ware_id = w.ware_id
                LEFT JOIN ships s ON w.component_ref = s.ship_id
                LEFT JOIN modules m ON w.component_ref = m.module_id
                LEFT JOIN equip_deployables ed ON w.component_ref = ed.deployable_id
                WHERE s.ship_id IS NULL AND m.module_id IS NULL AND ed.deployable_id IS NULL
                  AND w.group_id NOT IN ('weapons', 'turrets', 'shields', 'engines', 'thrusters', 'drones', 'missiles', 'countermeasures', 'equipmod', 'paintmod')
            ''')
            _progress_log(f"  done ({_elapsed(t0)})")
    finally:
        conn.close()

    _progress_log("All done.")
