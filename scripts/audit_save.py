"""Save file attribute scanner — cross-references live extraction coverage.

Usage: uv run python scripts/audit_save.py

Scans the latest save file for every XML element and its attributes,
then compares against the dynamic extraction schema to flag untracked data.
"""

import gzip
import os
import re
from collections import defaultdict
from pathlib import Path

SAVE_DIR = Path(os.environ.get("X4C_SAVE_PATH", "C:/Users/colto/sss/Documents/Egosoft/X4/59308344/save"))

# ── What we currently extract ─────────────────────────────────────────────────

EXTRACTED = {
    # save_meta
    ("info",): {"save_name", "in_game_time_sec", "real_time_iso", "game_version", "game_build"},
    ("player",): {"player_credits", "player_name", "player_id", "hq_station_id", "current_sector", "current_ship_id"},

    # stations
    ("station",): {
        "station_id", "code", "name", "macro", "owner_faction", "sector_id",
        "zone_id", "x", "y", "z", "state", "build_pct", "is_player_owned",
        "is_under_construction", "seed_id", "dynamic_tags", "known_to_player",
        "basename", "nameindex",
    },
    ("station_modules",): {"station_id", "module_id", "macro", "count", "construction_pct"},
    ("station_offers",): {"station_id", "ware_id", "side", "price", "quantity"},
    ("construction_needs",): {"station_id", "ware_id", "required", "delivered"},

    # ships
    ("ship",): {
        "ship_id", "code", "name", "macro", "owner_faction", "class_id",
        "sector_id", "zone_id", "x", "y", "z", "commander_id", "state",
        "is_player_owned",
    },
    ("ship_cargo",): {"ship_id", "ware_id", "amount"},

    # factions
    ("faction_relations",): {"faction_id", "other_faction_id", "relation"},

    # player
    ("player_blueprints",): {"ware_id"},
    ("player_licences",): {"licence_type", "faction_id"},

    # sectors
    ("sector_state",): {"sector_id", "known_to_player"},

    # resources
    ("sector_resources",): {"sector_id", "ware", "current", "max", "yield_tier", "recharge_time"},

    # trade
    ("trade_orders",): {"order_id", "ship_id", "owner_faction", "ware_id", "side", "buy_station_id", "sell_station_id", "quantity", "price", "state"},

    # distance
    ("sector_distance",): {"from_sector_id", "to_sector_id", "hops", "manual_distance", "fast_travel_time"},
}

# ── Scan the save ──────────────────────────────────────────────────────────────

def find_latest_save() -> Path:
    saves = sorted(SAVE_DIR.glob("*.xml.gz"))
    if not saves:
        raise SystemExit(f"No saves found in {SAVE_DIR}")
    return saves[-1]


def scan_save(save_path: Path) -> dict[str, set[str]]:
    """Return {element_tag: {attribute_names}} for every element in the save."""
    found: dict[str, set[str]] = defaultdict(set)
    chunk_size = 20_000_000

    with gzip.open(save_path, "rb") as f:
        offset = 0
        while True:
            f.seek(offset)
            chunk = f.read(chunk_size).decode("utf-8", errors="replace")
            if not chunk:
                break
            offset += chunk_size

            for m in re.finditer(r"<(\w+)((?:\s+\w+=\"[^\"]*\")*)\s*/?>", chunk):
                tag = m.group(1)
                attrs_str = m.group(2)
                for am in re.finditer(r'(\w+)="[^"]*"', attrs_str):
                    attr_name = am.group(1)
                    found[tag].add(attr_name)

    return found


def report(found: dict[str, set[str]]) -> None:
    """Print coverage report."""
    print(f"Scanned {len(found)} unique element types.\n")

    # Group by our tracking categories
    by_category: dict[str, list[str]] = defaultdict(list)

    # Map save XML tags to our extraction keys
    tag_mapping = {
        "component": "ship",  # class="ship_*" components
        "savegame": None,     # root
        "info": "save_meta",
        "faction": "faction_relations",
        "relation": "faction_relations",
        "player": "player",
        "blueprint": "player_blueprints",
        "licence": "player_licences",
        "sector": "sector_state",
        "station": "stations",
        "module": "station_modules",
        "offer": "station_offers",
        "construction": "construction_needs",
        "cargo": "ship_cargo",
        "order": "trade_orders",
    }

    print("=== Attribute coverage by entity ===\n")

    for tag in sorted(found):
        attrs = found[tag]
        if not attrs:
            continue

        mapped = tag_mapping.get(tag)

        if mapped == "ship":
            # Ships are class-filtered — check all ship-related attrs
            extracted_attrs = EXTRACTED.get(("ship",), set())
            missing = attrs - extracted_attrs - {"class", "connection"}
            print(f"<{tag} class=\"ship_*\"> — tracked as ships")
            print(f"  Extracted: {sorted(extracted_attrs)}")
            if missing:
                print(f"  *UNTRACKED: {sorted(missing)}")
            print()

        elif mapped and mapped in {v for vs in EXTRACTED.values() for v in vs}:
            # Find the right extraction key
            extracted_attrs = set()
            for ek, ev in EXTRACTED.items():
                if ek[0] == mapped:
                    extracted_attrs = ev
                    break
            missing = attrs - extracted_attrs
            print(f"<{tag}> — tracked as {mapped}")
            print(f"  Extracted: {sorted(extracted_attrs)}")
            if missing:
                print(f"  *UNTRACKED: {sorted(missing)}")
            print()

        elif mapped is None:
            continue  # skip root

        else:
            # Unmapped element — check if it's tracked somewhere
            is_tracked = False
            for ek, ev in EXTRACTED.items():
                if tag in ev:
                    is_tracked = True
                    break
            if not is_tracked and len(attrs) > 1:
                print(f"<{tag}> — NO extraction mapping ({len(attrs)} attrs)")
                print(f"  Attributes: {sorted(attrs)}")
                print()


if __name__ == "__main__":
    save = find_latest_save()
    print(f"Save: {save.name} ({save.stat().st_size / 1_000_000:.1f} MB)\n")
    found = scan_save(save)
    report(found)
