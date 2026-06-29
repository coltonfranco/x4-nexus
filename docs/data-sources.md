# Data sources: reference vs seed vs live

X4 data falls into **three** layers, not two. Conflating "gamestart seed" with "static
reference" is what makes save↔catalog merging confusing. This document is the
authoritative manifest of which dataset is which, and the storage split that follows.

The test for each dataset:

> **Does the save *reference* this by id (a rule), or does the save *supersede* it as
> instance state (a snapshot)?** Rules are reference. Snapshots are seed.

| Layer | Meaning | Lifetime | DB |
|---|---|---|---|
| **Reference** | Patch-scoped definitions the save points at by id. Never overridden. | Rebuilt on game patch | `static.db` (ATTACH `s`) |
| **Seed** | The universe *instance snapshot at t=0*. The save diverges from it. | Rebuilt on game patch (it's gamestart-deterministic) | `seed.db` (ATTACH `seed`) |
| **Live** | The actual universe right now, from a save file. | Rebuilt per save tick | `dynamic/<key>.db` (main) |

`static.db` keeps its filename and `s` alias (avoids churn); it just becomes **strictly
referential**. `seed.db` is new and is the backing store for the gamestart "source"
(the synthetic save). Live stays as built in Tasks 1–6.

## Seed data — moves OUT of `static.db` into `seed.db`

Small footprint: **2 tables + 1 derived column** (which becomes a table).

| Dataset | Why it's seed | Live counterpart |
|---|---|---|
| `npc_stations` (table) | god.xml *placements* — specific station instances at t=0; the save destroys/moves/omits them | dynamic `stations` |
| `faction_relations` (table) | the t=0 relation matrix; drifts every tick | dynamic `faction_relations_current` |
| `sectors.owner_faction` (column) → `sector_ownership` (table) | gamestart territorial control, derived from god.xml station tags; shifts with war | (derived from save stations — future) |

Plus one derived convenience table:

- `cluster_ownership(cluster_id, owner_faction)` — predominant sector owner per cluster
  (previously `clusters.owner_faction`, which was **always NULL** because it was computed
  before god.xml set sector owners). Deriving it in the seed build makes it actually work.

### `seed.db` schema (new `schema_seed.sql`)
```sql
CREATE TABLE npc_stations (...);             -- moved verbatim from static
CREATE TABLE faction_relations (             -- moved; FK to factions dropped (cross-db)
    faction_id, other_faction_id, initial_relation, PRIMARY KEY(faction_id, other_faction_id));
CREATE TABLE sector_ownership (sector_id PRIMARY KEY, owner_faction);
CREATE TABLE cluster_ownership (cluster_id PRIMARY KEY, owner_faction);
```

### `static.db` deltas (strictly referential)
- **Drop** tables `npc_stations`, `faction_relations` (+ their indexes).
- **Drop** column `sectors.owner_faction` and `clusters.owner_faction`.
- Everything else stays: wares/production, ships/modules/equip specs, map topology
  (`clusters`/`sectors` minus ownership, `zones`/`gates`/`superhighways`/`regions`/
  `region_resources`), `factions` (definitions), `faction_licences` (licence catalog),
  `loadouts`, `station_types`, `terraform_*`, `diplo_*`, `drop_*`, `game_version`.

> **Sector `economy`/`security`/`sunlight`/`tags`/`access_licence` stay in `static.db`** —
> they're sector *definitions* (identical every new game), not instance state. Only
> `owner_faction` was the snapshot.

## Build flow

`rebuild-static` produces **both** DBs in one run:
1. Build `static.db` (reference) as today, minus the seed bits.
2. Apply `schema_seed.sql`; open `seed.db` with `static.db` ATTACHed `s` (for the
   lowercase→canonical sector_id mapping the derivations need).
3. Write seed: `factions.write_relations(seed)`, `npc_stations.write(seed)` (which also
   derives `sector_ownership` + `cluster_ownership` from `s.sectors`).

`open_db` ATTACHes both `static.db AS s` and `seed.db AS seed` so every read connection
sees reference + seed + live.

## Extractor changes
- `factions.write()` → factions + licences only (reference). New `write_relations(seed_conn)`.
- `npc_stations.write(seed_conn)` → `npc_stations` + derived `sector_ownership`/
  `cluster_ownership` (reads `s.sectors` for canonical ids).
- `map.write()` → drop `owner_faction` from the `clusters`/`sectors` INSERTs.

## Endpoint repoints (`s.*` → `seed.*`)
| Endpoint | Was | Now |
|---|---|---|
| `GET /factions/{id}/relations`, `/faction-relations` | `s.faction_relations` | `seed.faction_relations` (still LEFT JOIN dynamic `faction_relations_current` for `current_relation`) |
| `GET /factions/strength` | `s.faction_relations`, `s.npc_stations`, `s.sectors.owner_faction` | `seed.faction_relations`, `seed.npc_stations`, `seed.sector_ownership`/`cluster_ownership` |
| `GET /npc-stations`, `/npc-stations/{id}` | `s.npc_stations` | `seed.npc_stations` |
| `GET /map/sectors`, `/map/sectors/{id}` | `s.sectors.owner_faction` | LEFT JOIN `seed.sector_ownership` |
| `GET /map/clusters` | `s.clusters.owner_faction` (always null) | LEFT JOIN `seed.cluster_ownership` (now meaningful) |

These are *gamestart* values served from the reference/seed layer. They are correct as
the **gamestart source**; once the gamestart-as-synthetic-save adapter lands (next step),
they'll be reached uniformly through the source/capability model from the prior design
discussion rather than special-cased.

## What this sets up (not in this change)
- **Gamestart = synthetic save**: `seed.db` is the `GamestartSource` backing. The
  capability-manifest adapter (canonical contract + `source`/`as_of`/`capabilities`
  envelope) projects both `seed.db` and `dynamic/<key>.db` into one consistent contract.
- **Live sector ownership** (derive from save stations) — currently only the gamestart
  value exists; this is a known live-side gap.

## Verification
- `uv run pytest` green (extractor + API tests updated to read seed).
- `uv run x4c rebuild-static` produces `static.db` **without** the seed tables and a
  populated `seed.db`; spot-check `seed.faction_relations`, `seed.npc_stations`,
  `seed.sector_ownership` row counts.
- `/map/sectors` still returns `owner_faction`; `/factions/{id}/relations` still returns
  `initial_relation` (+ `current_relation` when a save is active). Regenerate `openapi.yaml`.
