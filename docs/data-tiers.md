# Data tiers

Authoritative inventory of game XML files and what `x4-api` exposes from each.
Three tiers: **V1 MUST** ships in the first public release, **V1 NICE** has reserved
URLs returning 501 until implemented, **SKIP** is out of scope.

## V1 MUST (ship with the first PyPI release)

| Source (in `08.cat` unless noted) | Endpoint(s) | Tables in `static.db` |
|---|---|---|
| `libraries/wares.xml` | `/api/v1/wares`, `/api/v1/wares/{id}`, `/api/v1/wares/{id}/chain` | `wares`, `ware_production`, `ware_inputs` |
| `libraries/modules.xml` + `modulegroups.xml` | `/api/v1/modules`, `/api/v1/modules/{id}` | `modules` |
| `libraries/macros.xml` + selected `assets/units/...xml` | `/api/v1/ships`, `/api/v1/ships/{id}` | `ships` |
| `maps/xu_ep2_universe/clusters.xml` + `sectors.xml` + `zones.xml` (`06.cat`) | `/api/v1/map/clusters`, `/sectors`, `/sectors/{id}`, `/gates` | `clusters`, `sectors`, `zones`, `gates` |
| `libraries/factions.xml` | `/api/v1/factions`, `/api/v1/factions/{id}` | `factions` |
| `libraries/icons.xml` + DDS textures in `01.cat`/`05.cat`/`07.cat` | `/static/icons/{logical_id}.png` | (PNGs on disk) |
| Save: `<savegame>` info, stations, offers, construction, trade orders, missions | `/api/v1/save/*`, `/api/v1/stations`, `/api/v1/routes`, `/api/v1/chains/gaps`, `/api/v1/construction/needs`, `/api/v1/missions` | `save_meta`, `stations`, `station_modules`, `station_offers`, `construction_needs`, `trade_orders`, `sector_distance`, `top_routes_per_ware` |

## V1 NICE (reserved URLs return 501; implement post-v1.0)

| Source | Endpoint | Use case |
|---|---|---|
| `libraries/diplomacy.xml` | `/api/v1/diplomacy` | War-watch, faction tracking |
| weapons/shields/engines (scattered, indexed via `macros.xml`) | `/api/v1/equipment/{weapons,shields,engines,thrusters}` | Combat sims, loadout calculators |
| `libraries/equipmentmods.xml` | `/api/v1/equipment/mods` | Modding tools |
| `libraries/loadouts.xml` + `loadoutrules.xml` | `/api/v1/loadouts/ships/{id}` | Loadout builder |
| `libraries/constructionplans.xml` | `/api/v1/blueprints/stations` | Station cost calculators |
| `libraries/baskets.xml` | `/api/v1/production/baskets` | Production combos |
| `libraries/jobs.xml` | `/api/v1/jobs` | Traffic prediction |
| `libraries/drops.xml` | `/api/v1/drops` | Loot/lockbox tools |
| `libraries/gamestarts.xml` | `/api/v1/gamestarts` | Scenario catalog |
| `libraries/god.xml` | `/api/v1/god/templates` | Economy/template inspection |
| `libraries/colors.xml` | `/api/v1/palette` | Faction-themed UI |
| `libraries/characters.xml` | `/api/v1/npcs` | Personnel trackers |
| Save: economy_log, blueprints, research, faction relations | `/api/v1/save/{economy-log,blueprints,research,faction-relations}` | Time-series, progression |

## SKIP (deliberate)

- `aiscripts/*.xml` (~178 files) — runtime behavior trees; no data value
- `cutscenes/*.xml` — camera scripts
- `md/*` mission director — runtime
- `libraries/material_library.xml` — shaders (2.4 MB)
- `libraries/effects.xml`, `lens_effects.xml` — VFX
- `libraries/character_components.xml`, `character_macros.xml`, `animation_sequences.xml` — NPC rigging
- `assets/textures/*` beyond icons — environment art
- Voice, SFX, music (`03.cat` is ~6 GB of voice)
- 3D `.xmf` models — would need model parser, no display value in a 2D dashboard
- Fonts, input maps, control schemes
- Localizations beyond English (`0001-l044.xml`) — defer to v2
