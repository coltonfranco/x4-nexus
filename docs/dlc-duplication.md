# DLC XML duplication risk

## Problem

When a DLC ships a full (non-`<diff>`) XML at a library path that already exists in
the base game, the crawler's `_merge_additive()` appends all DLC root children into
the merged tree. If the DLC file includes base-game entries alongside its new ones,
those entries appear **twice** in the merged XML.

This causes `UNIQUE constraint failed` errors during `rebuild-static` when an
extractor's `write()` function uses a `DELETE` + plain `INSERT` pattern.

## Affected run

- **Duplicate found**: `terran` faction (base + `ego_dlc_terran` factions.xml)
- **Second entry differences**: added relations, missing licences, slightly
  different tags

## Extractors at risk

Any extractor that uses `DELETE FROM` + plain `INSERT` and reads from a merged XML:

- `ships.py` — `ships`, `ship_software`
- `equipment.py` — all `equip_*` tables
- `modules.py` — `modules`
- `station_types.py` — `station_types`
- `wares.py` — `wares`, `ware_production`, `ware_inputs`, `ware_owners`, `ware_illegal`
- `waregroups.py` — `ware_groups`
- `loadouts.py` — `loadouts`, `loadout_equipment`
- `equip_mods.py` — `equip_mods`, `equip_mod_bonuses`
- `drops.py` — all `drop_*` tables
- `diplomacy.py` — all `diplo_*` tables
- `terraforming.py` — all `terraform_*` tables
- `factions.py` — `faction_relations` (in seed.db)

## Fix applied

- `factions.py`: changed `INSERT INTO factions` → `INSERT OR IGNORE INTO factions`
  (2026-06-11)

## Preferred long-term fix

Deduplicate at the XML merge layer in `crawler.py`:
`_merge_additive()` should skip DLC children whose `id` (or equivalent key) already
exists in the base tree, rather than blindly appending everything.

Until that's done, extractors should use `INSERT OR IGNORE` or `INSERT OR REPLACE`
to tolerate duplicates without crashing.
