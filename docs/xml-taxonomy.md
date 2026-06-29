# X4 XML Taxonomy & Coverage Gap Reference

Findings from a June 2026 audit of `raw.db` (6,950 XML files, 284 distinct macro class values, 165 MB).
Use this document as a starting point for any future gap analysis before querying raw files individually.

---

## How to re-run a gap analysis

The fastest approach is SQL against `raw.db` — never read individual XML files in a loop.

```python
import sqlite3, re, collections

conn = sqlite3.connect("packages/x4-api/data/raw.db")

# 1. Directory breakdown
for row in conn.execute("SELECT directory, COUNT(*) FROM raw_files GROUP BY directory ORDER BY 2 DESC"):
    print(row)

# 2. All macro class values and frequency
rows = conn.execute(
    "SELECT content FROM raw_files WHERE filename LIKE '%macro%' AND content LIKE '%class=%'"
).fetchall()
counts = collections.Counter()
for (content,) in rows:
    for m in re.finditer(r'<macro[^>]+class="([^"]+)"', content):
        counts[m.group(1)] += 1
for cls, n in counts.most_common(100):
    print(f"{n:5d}  {cls}")

# 3. All library filenames (the catalog layer)
for row in conn.execute("SELECT filename FROM raw_files WHERE directory = 'libraries' ORDER BY filename"):
    print(row[0])
```

---

## Directory structure

| Directory | File count | Role |
|-----------|-----------|------|
| `assets/` | 6,733 | Concrete macro instances (ships, engines, weapons, spatial objects) |
| `libraries/` | 130 | Catalog definitions (wares, factions, modules, construction plans) |
| `maps/` | 67 | Tutorial and scenario galaxy/sector layouts |
| `index/` | 2 | Master indices: `macros.xml`, `components.xml` |
| `t/` | 16 | Localization strings |
| `shadergl/` | 2 | Graphics shaders (no gameplay data) |

`assets/` contains individual macro files, one or a few entities each. `libraries/` contains aggregate XML files that define catalogs (e.g. all wares in one file). The index files are the master lookup tables.

---

## XML conventions and patterns

### The macro/component hierarchy

Every game entity follows the same two-level structure:

```xml
<!-- foo_macro.xml -->
<macros>
  <macro name="engine_arg_s_allround_01_mk1_macro" class="engine">
    <component ref="engine_arg_s_allround_01_mk1" />
    <properties>
      <identification name="{20104,30101}" shortname="{20104,30102}" />
      <physics mass="8">
        <inertia pitch="0.1" yaw="0.1" roll="0.05" />
        <drag forward="350" reverse="120" horizontal="20" vertical="20" pitch="0.6" yaw="0.6" roll="0.9" />
      </physics>
      <thrust forward="2876800" boost="11507200" travel="7200000" />
    </properties>
    <connections>
      <connection ref="con_engine_thruster_1" />  <!-- nested component macros for thrusters -->
    </connections>
  </macro>
</macros>
```

```xml
<!-- foo_component.xml -->
<components>
  <component name="engine_arg_s_allround_01_mk1" class="engine">
    <connections>
      <connection name="con_engine_thruster_1" tags="thruster">
        <macro ref="thruster_arg_s_allround_01_mk1_macro" />
      </connection>
    </connections>
  </component>
</components>
```

**Key points:**
- `<macro>` → `<component>` → `<connection>` → `<macro>` is the recursive chain for equipment slots
- `class=` on `<macro>` is the primary filter for categorising entities
- Ships reference engine/weapon/shield **slot macros** via connections; the actual installed equipment is separate
- The `class=` value on `<macro>` and `<component>` is usually the same, but component class is less reliable — always filter on macro class

### Text IDs — `{PAGE,ID}` format

All user-visible strings are indirection references into the `t/` localization files:

```xml
<identification name="{20104,30101}" shortname="{20104,30102}" description="{20104,30103}" />
```

`{20104,30101}` means page 20104, entry 30101 in `0001-L044.xml` (English). The extractor must join against the `raw_files` table for `t/*.xml` to resolve display names — this is why `wares.py` does a two-pass parse.

### Macro class = primary entity filter

The `class=` attribute on `<macro>` is the canonical entity type tag. The `SHIP_CLASSES`, `MODULE_CLASSES`, and `EQUIPMENT_CLASSES` sets in `constants.py` mirror this taxonomy. When adding a new entity type, find its class value here first, then add it to the appropriate set.

### Library files vs asset files

- **Library files** (`libraries/*.xml`) are aggregate catalogs — one file per entity type with all entries. Parse these for catalog-level data (wares, factions, module groups).
- **Asset files** (`assets/**/*macro*.xml`) are individual macro definitions — parse these for per-entity stats. The crawler indexes these into `raw_files` so the static pipeline can query them by class.

### DLC patching convention

Base game files are in the root `.cat`/`.dat` archives; DLC files in numbered subdirectories (e.g. `ext_01/`, `ext_02/`). The catdat crawler applies them in order — later entries overwrite earlier ones for the same virtual path. The `raw_files` table therefore already represents the final merged state.

### Spatial hierarchy

```
galaxy → cluster → sector → zone
```

Gates link sectors (inter-sector travel). Highways link zones within a sector (intra-sector fast lanes). Resource regions are children of sectors defined via `<region>` XML elements, **not** `<macro class=...>` entries — they require a separate parser targeting `<region>` elements rather than the standard macro filter.

### Ammunition / bullet hierarchy

There are two layers:
1. **Bullet macro** (`class="bullet"`) — defines physics, damage, speed of a projectile type. ~303 instances.
2. **Weapon macro** (`class="weapon"` or `"turret"`) — references which bullet macro it fires via `<bullet class="bullet_gen_..."/>` inside `<properties>`.

Faction-specific bullet variants proliferate heavily: `bullet_bor_*`, `bullet_ter_*`, `bullet_arg_*`, etc. These are all the same class `"bullet"` with different stats — treat them as a flat catalog filtered by class, not as separate categories.

---

## Full class taxonomy (top 50 by frequency)

From a June 2026 scan. Counts include both `assets/` and `libraries/` files.

| Count | Class | Category | Extracted? |
|-------|-------|----------|-----------|
| 893 | `zone` | Spatial | ✅ map.py |
| 683 | `galaxy` | Spatial | ✅ map.py |
| 675 | `object` | Environment | ❌ no gameplay stats |
| 536 | `effectobject` | Visual | ❌ graphical only |
| 530 | `destructible` | Environment | ❌ no gameplay stats |
| 411 | `storage` | Station module | ✅ modules.py |
| 399 | `asteroid` | Environment | ❌ instances, not resource defs |
| 337 | `celestialbody` | Spatial | ❌ cosmetic; no gameplay stats |
| 317 | `engine` | Equipment | ✅ equipment.py |
| 303 | `bullet` | Equipment | ✅ equipment.py |
| 265 | `npc` | Character | ❌ crew/personnel not yet extracted |
| 251 | `sector` | Spatial | ✅ map.py |
| 222 | `weapon` | Equipment | ✅ equipment.py |
| 214 | `turret` | Equipment | ✅ equipment.py |
| 211 | `adsign` | Environment | ❌ advertisement signs, no value |
| 205 | `positional` | Spatial marker | ❌ placement helpers |
| 195 | `splinetube` | Spatial boundary | ❌ physics boundary |
| 168 | `shieldgenerator` | Equipment | ✅ equipment.py |
| 162 | `ship_xs` | Ship | ✅ ships.py |
| 147 | `ship_s` | Ship | ✅ ships.py |
| 138 | `connectionmodule` | Station module | ⚠️ not in MODULE_CLASSES |
| 129 | `room` | Ship interior | ❌ cosmetic |
| 128 | `production` | Station module | ✅ modules.py |
| 122 | `ship_m` | Ship | ✅ ships.py |
| 122 | `highway` | Spatial | ❌ not in map extractor |
| 118 | `ship_l` | Ship | ✅ ships.py |
| 116 | `dockarea` | Station module | ✅ modules.py |
| 116 | `cluster` | Spatial | ✅ map.py |
| 93 | `station` | NPC station type | ❌ no station-type extractor |
| 83 | `dockingbay` | Station module | ❌ sub-component of dockarea |
| 71 | `ship_xl` | Ship | ✅ ships.py |
| 68 | `habitation` | Station module | ✅ modules.py |
| 68 | `defencemodule` | Station module | ✅ modules.py |
| 65 | `missileturret` | Equipment | ✅ equipment.py |
| 65 | `cockpit` | Ship interior | ❌ cosmetic |
| 60 | `cutsceneanchor` | Scene | ❌ cutscene helper |
| 56 | `pier` | Station module | ✅ modules.py |
| 53 | `buildmodule` | Station module | ✅ modules.py |
| 43 | `missile` | Equipment | ✅ equipment.py |
| 37 | `missilelauncher` | Equipment | ✅ equipment.py |
| 34 | `cargobay` | Station module | ❌ storage sub-type |
| 26 | `navbeacon` | Equipment | ✅ equipment.py |
| 14 | `mine` | Equipment | ✅ equipment.py |
| 13 | `computer` | Equipment | ✅ equipment.py |
| 10 | `scanner` | Equipment | ✅ equipment.py |
| 10 | `crystal` | Collectible | ❌ floating resource node |
| 7 | `spacesuit` | Ship | ✅ ships.py |
| 7 | `welfaremodule` | Station module | ✅ modules.py |
| 6 | `radar` | Equipment | ✅ equipment.py |
| 5 | `bomb` | Equipment | ✅ equipment.py |

---

## Library files with no extractor

These files in `libraries/` contain structured catalog data that is not yet extracted to `static.db`:

| File | Contents | Priority |
|------|----------|---------|
| `diplomacy.xml` | Faction-pair relation matrix; initial reputation values; war/peace state | High |
| `constructionplans.xml` | Player-sharable station blueprints | Medium |
| `gamestarts.xml` | Starting scenario definitions and initial conditions | Low |
| `charactergroups.xml` | NPC crew type groupings and skill cap definitions | Low |
| `themes.xml` | Station paintwork/theme catalog (cosmetic) | Skip |

Resource region data is **not** in `libraries/` — it lives inside `assets/` spatial XMLs as `<region>` child elements of sector macros. These require a dedicated parser that targets `<region>` rather than `<macro class=...>`.

---

## Coverage gap inventory

### Critical integrity gaps

**`connectionmodule` missing from `MODULE_CLASSES`** (138 instances)

Connection modules (L-shapes, T-junctions, cross-pieces, corridors) are the structural connectors of player stations. They carry build costs (hull parts, claytronics) and dock attachment types. Any station cost calculator is wrong without them. Fix: add `"connectionmodule"` to `MODULE_CLASSES` in `constants.py`.

### High-value missing extractors

| Gap | Mechanism | Why it matters |
|-----|-----------|---------------|
| Sector resource regions | `<region>` elements in sector macros; not a macro class | Mining route planning: "where does nividium spawn" |
| Faction diplomacy | `libraries/diplomacy.xml` | "Which factions will sell me ships / who is at war" |
| Ship default loadouts | Loadout XML files in `libraries/` | Accurate refit cost: "what comes installed from the factory" |

### Medium-value missing extractors

| Gap | Class / file | Why it matters |
|-----|-------------|----------------|
| NPC station types | `class="station"` (93 instances) | What stations exist per faction and sector |
| Research tech tree | `libraries/` research files | Progression planning / unlock tracking |
| Highway network | `class="highway"` (122 instances) | Navigation / routing features |

### Low-value / skip

| Class | Reason to skip |
|-------|---------------|
| `effectobject`, `destructible`, `object` | Physics/graphical, no gameplay stats |
| `adsign` | Advertisement sign placement |
| `room`, `cockpit`, `cutsceneanchor` | Ship/station interior cosmetics |
| `collectablewares`, `crystal` | Floating pickup instances, not catalog entries |
| `celestialbody` | Atmospheric rendering params only |
| `asteroid` | Individual instances; resource data is in region definitions |

---

## `constants.py` class sets — current state and recommended additions

```python
# current — complete
SHIP_CLASSES = {"ship_xs", "ship_s", "ship_m", "ship_l", "ship_xl", "spacesuit"}

# recommended addition: "connectionmodule", "dockingbay", "cargobay"
MODULE_CLASSES = {
    "production", "habitation", "storage", "defencemodule", "dockarea", "pier",
    "buildmodule", "processingmodule", "welfaremodule",
    # --- gaps ---
    "connectionmodule",  # structural connectors — needed for correct build cost
    # "dockingbay",      # bay sub-type within dockarea — medium priority
    # "cargobay",        # storage sub-type — medium priority
}

# current — essentially complete for equipment
EQUIPMENT_CLASSES = {
    "engine", "shieldgenerator", "weapon", "turret", "missilelauncher",
    "bomblauncher", "spacesuitlaser", "missileturret", "bullet", "missile",
    "bomb", "mine", "spacesuitbomb", "countermeasure", "satellite", "navbeacon",
    "resourceprobe", "scanner", "computer", "radar",
}
# Note: "thruster" is class="engine" in the macro system — not a separate class.
# equipment.py correctly handles it via the engine extractor path.
```

---

## Prioritised work queue

1. **Add `connectionmodule` to `MODULE_CLASSES`** — one-line fix, correctness impact on station cost
2. **Resource region extractor** — new parser targeting `<region>` elements; highest feature value
3. **Faction diplomacy extractor** — parse `libraries/diplomacy.xml`; needed for faction-aware queries
4. **Ship loadout extractor** — parse default loadout files; needed for refit cost accuracy
5. **NPC station type extractor** — parse `class="station"` macros for faction/sector station mapping
6. **Research tech tree extractor** — parse research library files for progression features
7. **Highway network extractor** — extend map.py with `class="highway"` entries if routing is needed
