# Stat Bars

All stat bars in the X4 Companion follow a consistent model. This document explains how
values are computed, what the bars represent, and how the scale changes based on context.

## Data model

Every ship stat has two forms:

| Form | Source | Example |
|------|--------|---------|
| **Base stat** | Raw game data (hull points, cargo volume, crew slots, missile storage, etc.) | A Colossus has `hull = 119,000` |
| **Theoretical maximum** | Precomputed during extraction. Uses the ship's actual slot counts × the best available equipment for that slot size. | A Colossus with 4 XL shield slots and the best XL shield (170,000 MJ each) → `shield_capacity_max = 680,000` |

The theoretical maximums are stored in the `ships` table and computed by
[`update_derived_stats()`](../packages/x4-extract/src/x4_extract/static/ships.py).

### Stats that are equipment-modifiable

For these stats, the ship's theoretical maximum differs from its base value:

| Stat | DB column | Formula |
|------|-----------|---------|
| Speed | `speed_max` | `Σ(best engine thrust per slot) / drag_forward` |
| Travel speed | `travel_max` | `Σ(best engine thrust × travel multiplier per slot) / drag_forward` |
| Boost speed | `boost_max` | `Σ(best engine thrust × boost multiplier per slot) / drag_forward` |
| Acceleration | `accel_max` | `Σ(best engine thrust per slot) / mass` |
| Shield capacity | `shield_capacity_max` | `Σ(best shield capacity × slot count per size)` |
| Shield recharge | `shield_recharge_max` | `Σ(best shield recharge rate × slot count per size)` |
| Weapon DPS | `dps_max` | `Σ(best weapon DPS × slot count per size) + Σ(best turret DPS × slot count per size)` |
| Weapon range | `range_max` | `MAX(best weapon range per compatible size)`, capped at 30 km |

### Stats that are fixed (not modifiable by equipment)

These stats cannot be improved with equipment. The base value IS the maximum:

| Stat | DB column |
|------|-----------|
| Hull | `hull` |
| Cargo | `cargo_volume` |
| Crew | `people_capacity` |
| Deployables | `deployable_storage` |
| Drones | `drone_storage` |
| Flares | `countermeasure_storage` |
| Missiles | `missile_storage` |
| Docking pads | `dock_s`, `dock_m` |
| Internal storage | `storage_s`, `storage_m` |

## Scale modes

### Logarithmic (cross-class)

Used when **all ship classes** are visible (no class filter active).

- Scale: `log₁₀(value + 1)`
- 100% = a global constant chosen to cover the full range (e.g. `MAX_SPEED = 12,000`)
- Purpose: compress orders-of-magnitude differences so a 500 m/s freighter and an 11,800 m/s
  spacesuit show meaningfully different bar widths

### Linear (per-class)

Used when a **single class** is selected (XS, S, M, L, or XL).

- Scale: linear (`value / max`)
- 100% = the highest theoretical maximum among **all ships of that class**
  (ignoring role/faction/search filters — the ceiling is stable)
- Source: computed dynamically from the `ships` table, or from the
  `GET /api/v1/ships/class-max?class_id=…` endpoint

### Equipment comparison table

Equipment uses the same dual-mode scale as the ships list:

| Mode | Scale | 100% = |
|------|:-----:|--------|
| All sizes (no size filter) | log₁₀ | highest value across ALL equipment of the current category |
| Single size selected | linear | highest value among ALL equipment of that category + size |

Maxima are computed from **all** equipment of the current category, ignoring secondary
filters (faction / mk / search / type / obtainable) — the ceiling is stable and doesn't
change as you filter. Different categories are isolated (engine stats don't contribute to
shield maxima, etc.).

- Scale (log): `log₁₀(value + 1)` / `log₁₀(globalMax + 1)`
- Scale (linear): `value` / `perSizeMax`
- Purpose: compress orders-of-magnitude differences when cross-size, show precise
  relative ranking when comparing within a single size

## Views

### Ships list

| Mode | Scale | 100% = |
|------|:-----:|--------|
| All classes (no class selected) | log₁₀ | global constant |
| Single class selected | linear | best ship in that class |

A subtle indicator (`log · cross-class` / `linear · per-class`) appears near the class
buttons. Hovering the ℹ icon in the table header shows a detailed explanation.

Users can customize which stat columns are visible via the Columns dropdown. Selection
persists in `localStorage`.

### Ship detail panel (dialog)

- Scale: linear
- 100% = class ceiling from `GET /api/v1/ships/class-max`
- Always shows one ship → always within a single class → always linear

### Ship builder (StatsFooter)

- Scale: linear
- 100% = class ceiling from `GET /api/v1/ships/class-max`
- Shows the **equipped** value (computed from selected equipment), not the theoretical max

The builder adds a **ship-max marker**: a thin vertical line showing THIS specific hull's
theoretical maximum with the best possible equipment. The area to the right of the marker
is tinted to indicate values unreachable with this hull — you'd need a different ship to
get there.

If equipment mods (in-game modifications) push the equipped value past the ship's
theoretical maximum, the filled bar extends past the marker (it renders on top).

Fixed stats (Hull, Cargo, Crew, Missiles, Deployables) show the marker at their value
position for consistency, since they cannot be improved with equipment.

### Equipment comparison

Same dual-mode as the ships list: logarithmic when no size filter is active, linear when
a single size is selected. 100% references are stable (computed from all equipment of the
current category, ignoring secondary filters).

No ship-max markers (equipment stats are absolute, not ship-relative).

### Builder equipment cards

- Scale: linear
- 100% = highest value among ALL equipment of that category + size (ignoring filters)
- Maxima are computed from the full equipment dataset, falling back to hardcoded
  per-size constants when the dataset isn't loaded

## API

### `GET /api/v1/ships/class-max?class_id={id}`

Returns the ceiling for each stat among ships of the given class. Used by the detail
panel and builder to set their 100% reference.

```json
{
  "hull": 1190000,
  "speed_max": 1000,
  "travel_max": 20000,
  "boost_max": 2500,
  "accel_max": 50,
  "shield_capacity_max": 998000,
  "shield_recharge_max": 6300,
  "cargo_volume": 200000,
  "dps_max": 110254,
  "range_max": 30
}
```


