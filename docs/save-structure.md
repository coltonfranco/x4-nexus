# Save-file structure & seed↔save parity

Empirical map of the X4 save XML (`*.xml.gz`), and a field-by-field parity check of the
**seed** layer (gamestart `static`/`seed.db`, sourced from god.xml + factions.xml) against
the **live** layer (the save). Purpose: decide how much of a gamestart↔save compatibility
layer is actually warranted *before* building it.

Probed against `autosave_02.xml.gz` / `save_001.xml.gz` (game 8.00, build 590967).

## Top-level save layout

```
savegame(1)
├─ info(2)                      save/game/player headers (name, time, version, credits)
├─ universe(2)
│  ├─ factions(3)
│  │  └─ faction(4) id=…        account(5)@amount · relations(5)/relation(6) · licences(5)/licence(6)
│  ├─ jobs / god / diplomacy(3) economy job + spawn bookkeeping
│  └─ component[galaxy](3)
│     └─ …/component[cluster](6)/…/component[sector](9)/…/component[zone](12)/…
│        ├─ component[station](15)   trade/offers/production/trade(19) = offers; connections = modules
│        └─ component[ship_*](15+)   nests deeper when docked/subordinate (variable depth)
├─ economylog(2)               trade-history events (cargo/tradeoffer/trade/money)
├─ stats(2)                    play-session counters
└─ (player components)         component[class=player] — character(d21) + control(d16)
                               blueprints live at <blueprints><blueprint ware=…> (deep)
```

Key structural facts (already encoded in the collectors):
- `<component>` nests recursively — match by `(depth, class)`; ships need **depth=None**.
- Visitors must read an element's **own** attrs/ancestors; children are cleared at their
  own end event (why meta targets the depth-3 `<info>` children, not `<info>`).

## Entity field inventory (live save)

| Entity | Where | Fields seen on the instance |
|---|---|---|
| **station** | `component[station]` | `id, code, name, macro, owner, state, modulelevel, spawntime, knownto, *transportdronemode, attack*time/attackmethod` + `trade/offers` (ware/buyer/seller/price/amount) + modules under `connections` |
| **ship** | `component[ship_*]` | `id, code, name, macro, owner, class, level, variation, thruster, state, knownto, attacker/attack*time` + cargo/orders under `connections` (deep) |
| **faction** | `factions/faction` | `id` + `account@amount` (live credits) + `relations/relation{faction,relation,booster}` + `licences/licence{type,factions}` |
| **player** | `component[class=player]` + `<blueprints>` | character: `id, name, macro, lastcontrolled` · account credits (player faction) · blueprints (`ware`) · licences (held) |

### Station composition & construction (probed `autosave_01.xml`, game 8.00, 2026-06)

Probe of a player HQ mid-"expand" (`/tmp/probe*.py` throwaways). Key facts for the
station-composition extractor:

- **Module list** lives in `station/construction/sequence/entry` —
  `entry[@id,@index,@macro,@connection]` (+ nested `predecessor`, `offset/position`).
  This is the authoritative module composition. The `connections/connection[@connection=modules]`
  children are **empty `<component/>` placeholders** for player stations — do *not* read
  modules from there (the prior extractor did, and got nothing).
- **Built vs planned**: `station/snapshot/entry` mirrors the realized state; a sequence
  entry absent from snapshot is pending/under-construction.
- **Under construction**: `station/buildtasks[@build="<id>"]` references an in-progress
  `<build type="expand|build" component="<station id>" faction builder time>` found under a
  global `buildtasks/inprogress`. Presence of the ref ⇒ active build task.
- **Station budget**: `station/account[@amount,@min,@max,@own]` — the station's own credits
  (e.g. HQ amount=339148). A cheap, monitorable metric.
- **Construction material needs (required/delivered)**: **NOT present** in this save — no
  `buildstorage`/`constructionplan`/build-cargo structures exist (HQ was an `expand` of a
  preexisting base). Needs a save with a freshly-placed station mid-build to probe; the
  `construction_needs` table is left best-effort/empty until then.
- **Module macro → static join**: sequence macros (e.g. `dockarea_arg_m_station_01_macro`)
  match `static.db` `modules.module_id`; non-module landmarks (`landmarks_*`) won't join and
  show as composition without static facts.

## Seed source inventory (god.xml + factions.xml)

From `docs/xml_schemas/god_schema.md` / `factions_schema.md`:
- **god.xml `<station>`**: `id`(gamestart, not the save id), `owner`, `race`, `type`,
  inner `station@macro`, `select@tags` (function), `location@class/@macro`, `position`,
  `constructionplan`. **No ships enumerated** (the economy fleet spawns dynamically).
- **factions.xml `<faction>`**: full definition + `account@amount` (gamestart credits) +
  `relations/relation{faction,relation}` + `licences/licence{type,factions,price,minrelation}`.

## Parity matrix — the headline

✅ shared · ◐ derivable from the other side · ✗ absent

| Resource | Seed has | Save has | Verdict |
|---|---|---|---|
| **Faction relations** | initial `{faction,relation}` | current `{faction,relation}` (+ booster) | ✅ **clean 1:1 parity** (same -1..1 scale). The one resource that truly dual-sources. |
| **Faction account (credits)** | `account@amount` (not yet extracted) | `account@amount` | ✅ parity (extract seed-side to match) |
| **Sector/cluster ownership** | derived from station tags | not stored; ◐ derivable from save stations | ◐ both derived — parity in method, not storage |
| **Station — placement** | owner ✅, race ✅, type/tags ✅, macro ✅, sector ✅, position ✅ | owner ✅, macro ✅, sector ✅, position ✅; race/tags ◐ (via `macro→station_types`) | ◐ overlap on *where/who/what*; **identity ids do not bridge** |
| **Station — operation** | ✗ none | offers (10.9k), modules, construction, build %, state | ✗ **save-only** — the economically interesting half |
| **Station — identity** | gamestart id only | `id`/`code`/`name` | ✗ no shared instance key |
| **Ships (fleet)** | ✗ ~none (fleet spawns post-start) | 10,759 instances, rich | ✗ **entirely save-only** |
| **Player (account/blueprints/licences/fleet cmd)** | ✗ none (lives in gamestarts.xml, unextracted) | full | ✗ **entirely save-only** |
| **economy_log / stats** | ✗ none | present | ✗ save-only |

## Are there major gaps? Yes — and they shape the design

1. **Ships and player are 100% save-only.** The gamestart source can't represent a fleet
   or a player account at all. There is no dual-source contract to build for these — the
   gamestart source simply advertises `capabilities` *without* `fleet`/`player`, and those
   endpoints return `[]`/404 under gamestart. No projection work needed.
2. **Station *operation* (offers/modules/construction/state) is save-only.** Seed gives
   *placement intent* (who/what/where), not live economy. So a station resource shows
   identity+location under gamestart and gains `trade`/`build` capability blocks only under
   a save.
3. **Only faction relations (and faction credits) genuinely dual-source 1:1.** Plus
   ownership, which is *derived* on both sides.

**Implication:** the compatibility layer is small, not sprawling. Exactly **three**
resources need real dual-source projection — faction relations, station placement, sector
ownership — and they're precisely the ones already in `seed.db`. Everything else is
single-source (save-only), which the capability manifest expresses by omission rather than
by code. This *confirms* the switch-not-merge + capability model is right-sized rather than
over-engineered: most of the apparent complexity collapses because the datasets barely
overlap.

## Suggested next checks (cheap parity wins)
- Extract seed-side **faction `account@amount`** so faction wealth dual-sources too.
- Add a **referential audit**: % of save `sector_id`/`macro`/`owner` that resolve against
  `static.db`/`seed.db` — catches silent key-normalization drift (the linchpin of every join).
- Defer the gamestart-source adapter until the deep save extractors (Task 7: modules,
  cargo, construction) land, so the capability set is measured from real coverage, not
  guessed.
