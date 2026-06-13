"""Orchestrator: extract XML from raw.db -> write static.db.

Reads the pre-patched data lake (raw.db) and transforms it into structured tables.
"""

from __future__ import annotations

import sqlite3
import time
from typing import Any

from x4_extract.config import ExtractSettings
from x4_extract.db import apply_schema
from x4_extract.static import (
    diplomacy,
    drops,
    equip_mods,
    equipment,
    factions,
    icons,
    loadouts,
    map,
    modules,
    npc_stations,
    races,
    regions,
    ships,
    station_types,
    terraforming,
    waregroups,
    wares,
)

# ── Logging helpers ────────────────────────────────────────────────────────────

def _log(msg: str) -> None:
    """Print a timestamped progress message."""
    ts = time.strftime("%H:%M:%S")
    print(f"\033[90m{ts}\033[0m  {msg}", flush=True)

def _elapsed(start: float) -> str:
    """Return a color-coded duration string (green < 1s, yellow < 10s, red > 10s)."""
    dt = time.monotonic() - start
    if dt < 1.0:
        c = "32"
    elif dt < 10.0:
        c = "33"
    else:
        c = "31"
    return f"\033[{c}m{dt:.1f}s\033[0m"


def run(settings: ExtractSettings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    db_path = settings.data_dir / "static.db"
    raw_db_path = settings.data_dir / "raw.db"

    if not raw_db_path.exists():
        _log("raw.db not found — run rebuild-datalake first")
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

    _log("Starting static rebuild")

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

            t0 = time.monotonic()
            _log("Extracting: ware groups")
            waregroups_xml = get_raw_file("libraries/waregroups.xml")
            if waregroups_xml:
                waregroups.write(conn, _localize_result(waregroups.extract(waregroups_xml)))
                _log(f"  -> {len(waregroups.extract(waregroups_xml).groups)} groups ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: wares")
            wares_xml = get_raw_file("libraries/wares.xml")
            if wares_xml:
                result = wares.extract(wares_xml)
                wares.write(conn, _localize_result(result))
                _log(f"  -> {len(result.wares)} wares ({_elapsed(t0)})")
                mods_xml = get_raw_file("libraries/equipmentmods.xml")
                if mods_xml:
                    t0 = time.monotonic()
                    _log("Extracting: equipment mods")
                    mods_result = equip_mods.extract(mods_xml, wares_xml)
                    equip_mods.write(conn, _localize_result(mods_result))
                    _log(f"  -> {len(mods_result.mods)} mods ({_elapsed(t0)})")
                drops_xml = get_raw_file("libraries/drops.xml")
                if drops_xml:
                    t0 = time.monotonic()
                    _log("Extracting: drops")
                    drops_result = drops.extract(drops_xml)
                    drops.write(conn, _localize_result(drops_result))
                    _log(f"  -> {len(drops_result.lists)} lists ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: factions")
            factions_xml = get_raw_file("libraries/factions.xml")
            if factions_xml:
                colors_xml = get_raw_file("libraries/colors.xml")
                factions_result = _localize_result(factions.extract(factions_xml, colors_xml))
                factions.write(conn, factions_result)  # definitions only; relations -> seed.db
                _log(f"  -> {len(factions_result.factions)} factions ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: races")
            races_xml = get_raw_file("libraries/races.xml")
            if races_xml:
                races_result = _localize_result(races.extract(races_xml))
                races.write(conn, races_result)
                _log(f"  -> {len(races_result.races)} races ({_elapsed(t0)})")

            macros_xml = get_raw_file("index/macros.xml")
            if macros_xml:
                # Bulk-load all raw_files into memory — the macros step
                # resolves thousands of paths and filenames.  Doing 8K+
                # individual DB queries (each with COLLATE NOCASE) is the
                # dominant cost in the entire pipeline.
                rows = conn.execute(
                    "SELECT filepath, content FROM raw.raw_files"
                ).fetchall()
                _all_raw = {r[0]: r[1].encode("utf-8") for r in rows}
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
                _log("Extracting: ships")
                s_result = ships.extract(macros_xml, cached_resolver, cached_resolve_name)
                ships.write(conn, _localize_result(s_result))
                _log(f"  -> {len(s_result.ships)} ships ({_elapsed(t0)})")

                t0 = time.monotonic()
                _log("Extracting: equipment")
                e_result = equipment.extract(macros_xml, cached_resolver, cached_resolve_name)
                equipment.write(conn, _localize_result(e_result))
                _log(f"  -> {len(e_result.engines)} engines, {len(e_result.shields)} shields, {len(e_result.weapons)} weapons ({_elapsed(t0)})")

                t0 = time.monotonic()
                _log("Extracting: modules")
                m_result = modules.extract(macros_xml, cached_resolver, cached_resolve_name)
                modules.write(conn, _localize_result(m_result))
                _log(f"  -> {len(m_result.modules)} modules ({_elapsed(t0)})")

                t0 = time.monotonic()
                _log("Extracting: station types")
                st_result = station_types.extract(macros_xml, cached_resolver)
                station_types.write(conn, _localize_result(st_result))
                _log(f"  -> {len(st_result.stations)} types ({_elapsed(t0)})")

                t0 = time.monotonic()
                _log("Computing: derived ship stats")
                ships.update_derived_stats(conn)
                _log(f"  done ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: loadouts")
            loadouts_xml = get_raw_file("libraries/loadouts.xml")
            if loadouts_xml:
                lo_result = loadouts.extract(loadouts_xml)
                loadouts.write(conn, _localize_result(lo_result))
                _log(f"  -> {len(lo_result.loadouts)} loadouts ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: map")
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
                _log(f"  -> {len(map_result.clusters)} clusters, {len(map_result.sectors)} sectors ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: NPC stations (god.xml)")
            god_xml = get_raw_file("libraries/god.xml")
            if god_xml:
                god_result = _localize_result(npc_stations.extract(god_xml))
                _log(f"  -> {len(god_result.stations)} stations ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: terraforming")
            terraform_xml = get_raw_file("libraries/terraforming.xml")
            if terraform_xml:
                tf_result = terraforming.extract(terraform_xml)
                terraforming.write(conn, _localize_result(tf_result))
                _log(f"  -> {len(tf_result.projects)} projects ({_elapsed(t0)})")

            t0 = time.monotonic()
            _log("Extracting: diplomacy")
            diplo_xml = get_raw_file("libraries/diplomacy.xml")
            if diplo_xml:
                d_result = diplomacy.extract(diplo_xml)
                diplomacy.write(conn, _localize_result(d_result))
                _log(f"  -> {len(d_result.actions)} actions ({_elapsed(t0)})")
    finally:
        conn.close()

    # --- Build seed.db: the gamestart instance snapshot, separate from reference data. ---
    # static.db is now closed; attach it read-only so the derivations can map god.xml's
    # lowercase sector macros to canonical sector/cluster ids.
    t0 = time.monotonic()
    _log("Building: seed.db")
    apply_schema(settings.data_dir, "seed")
    seed_conn = sqlite3.connect(settings.data_dir / "seed.db")
    seed_conn.execute(f"ATTACH DATABASE '{db_path.as_posix()}' AS s")
    try:
        with seed_conn:
            if factions_result is not None:
                factions.write_relations(seed_conn, factions_result)
                _log(f"  faction relations: {len(factions_result.relations)} rows")
            if god_result is not None:
                npc_stations.write(seed_conn, god_result)
                _log(f"  NPC stations: {len(god_result.stations)} stations")
    finally:
        seed_conn.close()
    _log(f"seed.db done ({_elapsed(t0)})")

    # --- Build icons: DDS -> PNG under data/icons/ ---
    t0 = time.monotonic()
    _log("Building: icons")
    icons.run(settings)
    _log(f"icons done ({_elapsed(t0)})")

    _log("All done.")
