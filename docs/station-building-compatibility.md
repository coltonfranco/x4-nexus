# Station Building Compatibility Model

Analysis of X4 Foundations module compatibility constraints for the station planner
feature. Based on game data extraction code and community documentation.

---

## 1. Station types are chosen at plot placement — one tag per plot

When placing a station plot, the player selects a type (Factory, Argon Trade Station,
Pirate Base, etc.). This writes a build set tag into the plot that is **fixed for the
station's lifetime**. The first module built does not determine the type — the
plot-level tag is the sole authority.

**Key mechanic:** Each station type carries **exactly one** build set tag in its
macro XML. For example, `station_gen_factory_base_01_macro` has
`<build><sets><set ref="factory"/></sets></build>`. There is no way for a plot to
gain additional tags later. A Factory plot is `factory` forever.

**Station types in the game data:**

| Station Type | Build Set Tag | Modules Supported |
|---|---|---|
| Factory | `factory` | 274 (broadest — all factions, all kinds) |
| Player HQ | `headquarters_player` | 271 (nearly everything) |
| Pirate Base | `piratebase` | 124 (pirate-themed subset) |
| Argon Trade Station | `tradestation_argon` | 30 |
| Paranid Trade Station | `tradestation_paranid` | 33 |
| Teladi Trade Station | `tradestation_teladi` | 30 |
| Split Trade Station | `tradestation_split` | 23 |
| Boron Trade Station | `tradestation_boron` | 21 |
| Terran Trade Station | `tradestation_terran` | 1 |
| Xenon Factory | `factory_xenon` | 14 |
| Xenon Shipyard | `shipyard_xenon` | 18 |
| Xenon Defence | `defence_xenon` | 8 |

Players can build trade station modules **if they chose that station type at plot
creation**. A Factory plot cannot later accept `tradestation_argon`-only modules.

---

## 2. Two gates for module placement

A module can be placed on a station when **both** conditions are met:

1. **Blueprint ownership** — the player owns the blueprint (purchased from a faction
   representative, stolen via EMP bomb, or unlocked through research).
2. **Build set membership** — the station's plot-level build set tag appears in the
   module's `build_sets` list.

**Code evidence:** `modules.py` stores `build_sets` per module. The game engine
checks for any overlap between the plot's tag set and the module's `build_sets` at
build time.

---

## 3. Makerrace is purely cosmetic — no faction lock

The `makerrace` attribute on a module (e.g. `terran`, `argon`, `boron`) is **not
used for build eligibility**. It exists for flavor and to tell the player which
faction "makes" that module, but the game engine never checks it against the
station's faction or any other constraint.

This explains why a player can build a "Terran Solar" production module, "Terran"
dock, and "Terran" pier on a generic Factory plot — all three have `build_sets`
containing `factory`, and that's the only thing that matters. There is no separate
"Terran Factory" station type at all — `factory` is universal across all factions.

On a single Factory plot, a player can freely mix:

- Argon defence turrets
- Paranid production modules
- Split habitats
- Boron storage
- Teladi connection structures
- Terran docks

…as long as every module shares the `factory` build set tag. The module's `makerrace`
attribute is purely cosmetic/labeling — it is never checked for build eligibility.

**Code evidence:** Zero matches for `faction.*lock|lock.*faction|faction_mismatch`
across the entire extraction codebase. `makerrace` is extracted but never used in
compatibility logic.

---

## 4. Build set tag categories

The dashboard now color-codes build set tags:

| Color | Tags | Meaning |
|---|---|---|
| 🟢 Green | `factory`, `headquarters_player` | Player-accessible on standard plots |
| 🟡 Amber | `tradestation_*` | Faction trade stations (also usually on factory) |
| 🔴 Red | `*_xenon`, `factory_xenon`, `shipyard_xenon` | Xenon/NPC-only |
| 🔵 Default | `piratebase`, `station_yaki`, unknown | Special/other |

---

## 4a. Build set = intersection check

The game checks for **any overlap** between:

- The station plot's tag set (from the macro chosen at plot placement)
- The module's `build_sets` list

If at least one tag matches, the module is buildable. Example:

```
Station plot: "factory"
Module build_sets: "factory headquarters_player piratebase"
→ MATCH on "factory" → module is buildable

Station plot: "tradestation_argon"
Module build_sets: "factory headquarters_player"
→ NO MATCH → module is NOT buildable
```

---

## 5. Trade station modules are NOT NPC-exclusive

Almost all modules with `tradestation_*` tags ALSO carry the `factory` tag. Only 2
storage modules are trade-station-exclusive:

| Module | Build Set | Notes |
|---|---|---|
| Argon L Universal Storage | `tradestation_argon` only | Not on factory |
| Argon L Container Storage | `tradestation_paranid` only | Not on factory |

The rest (connection modules, defence platforms, habitats, docks, piers, production
modules) all list `factory` AND their trade station tag. This means a player on a
Factory plot can build "Argon Trade Station" themed modules — the trade station
tag is an ADDITIONAL permission, not an NPC-only restriction.

Trade station tags let Egosoft define modules that work on BOTH factories AND trade
stations, while a few modules are trade-station-only for flavor/balance.

## 5a. The correct `is_obtainable` check

The previous dashboard used `blueprint_price_avg IS NOT NULL` as a proxy, which
caught 323 modules including 47 that have blueprints but no factory/HQ tag
(Timelines landmarks, Teladi habitat superstructure parts, Xenon modules).

The **correct** check is:

```
build_sets LIKE '%factory%' OR build_sets LIKE '%headquarters_player%'
```

This identifies 280 player-buildable modules. An additional 4 modules have the
factory tag but no blueprint — these are likely research-gated or story-unlockable.

| Category | Modules | Criteria |
|---|---|---|
| **Player-buildable (factory/HQ)** | 280 | `build_sets` contains `factory` or `headquarters_player` |
| **Blueprint but no factory tag** | 47 | Has a purchasable blueprint but can't be placed on player stations |
| **Trade-station-only** | 2 | Has `tradestation_*` but NOT `factory` or `headquarters_player` |
| **Xenon-only** | 3 | `build_sets` = `shipyard_xenon` |
| **No build_sets** | 314 | Legacy/structure modules |

---

## 6. Complete station type catalog

Every station type and its single build set tag, from the game's `station_types` data:

| Station Type Macro | Display Name | Build Set Tag |
|---|---|---|
| `station_gen_factory_base_01_macro` | Factory | `factory` |
| `station_pla_headquarters_base_01_macro` | Headquarters | `headquarters_player` |
| `station_gen_piratebase_base_01_macro` | Pirate Base | `piratebase` |
| `station_yak_piratebase_base_01_macro` | Pirate Base (Yaki) | `station_yaki` |
| `station_arg_tradestation_base_01_macro` | Argon Trading Station | `tradestation_argon` |
| `station_bor_tradestation_base_01_macro` | Boron Trading Station | `tradestation_boron` |
| `station_par_tradestation_base_01_macro` | Paranid Trading Station | `tradestation_paranid` |
| `station_spl_tradestation_base_01_macro` | Split Trading Station | `tradestation_split` |
| `station_tel_tradestation_base_01_macro` | Teladi Trading Station | `tradestation_teladi` |
| `station_ter_tradestation_base_01_macro` | Terran Trading Station | `tradestation_terran` |
| `station_xen_defence_base_01_macro` | Xenon Defence Platform | `defence_xenon` |
| `station_xen_factory_base_01_macro` | Xenon Factory | `factory_xenon` |
| `station_xen_shipyard_base_01_macro` | Xenon Shipyard | `shipyard_xenon` |

Landmark stations (Kha'ak installations, Xenon asteroids, mass traffic, Torus) have
empty build sets — they are NPC-only story structures.

**There is no "Terran Factory" or "Argon Factory" type.** The `factory` set is
universal across all factions. Faction-specific trade stations exist but are
separate plot types.

---

## 7. What this means for the station planner

### Compatibility is simple

For a given station plot type, the planner only needs to filter modules where
the plot's tag appears in the module's `build_sets`:

```
compatible_modules = modules.filter(m =>
  m.build_sets.includes(plot.build_set_tag)
)
```

### No sequencing constraints

There are no "build X before Y" prerequisites in the game data. Module placement
is only gated by:
- Build set membership
- Blueprint ownership
- Physical snap point alignment (not modeled by our planner)

### Resource requirements are deterministic

Each module has:
- Fixed construction resources (`construction_resources`) from `ware_inputs`
- Fixed build time (`build_time_sec`) from `ware_production`
- Fixed construction cost (`est_cost`) calculated from input ware prices

### Production chains are known

For production modules, the planner can compute:
- What the module produces (`produces_ware_id` + `production_rate`)
- What it consumes (`production_inputs`: list of input wares with rates)
- Whether workforce is needed (`workforce_capacity`, `workforce_race`)

---

## 8. Data sources

| Data point | Source column/table |
|---|---|
| Build compatibility | `modules.build_sets` |
| Station types | `station_types.station_id` + `station_types.build_sets` |
| Blueprint cost | `blueprint_price_avg` (joined from `wares` via `component_ref`) |
| Licence required | `restriction_licence` (from `wares`) |
| Construction resources | `ware_inputs` for the module's blueprint ware |
| Production inputs/outputs | `ware_inputs` + `ware_production` for the produced ware |
| Module stats | `modules` table (hull, storage, workforce, etc.) |
| Faction/maker | `modules.makerrace` (cosmetic only, not a constraint) |
