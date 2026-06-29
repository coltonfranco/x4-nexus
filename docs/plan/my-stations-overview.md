# Plan — "My Stations" / Station Overview subpage

## Context

We want a new subpage under the **Stations** section that gives the player an at-a-glance
view of *their own* stations — modelled on the `Station Overview.dc.html` mockup
(X4 Nexus aesthetic, KPI strip, **Fleet Cards** grid + **Ops Console** master/detail).

The mockup was hand-designed with only a rough understanding of station mechanics, so
several of its metrics have **no backing data** in our extraction today. Critically, the
station extractor currently captures only station *identity + trade offers*. It walks the
module subtree but **throws the data away** (`station_modules`/`construction_needs` tables
are never written, `build_pct`/`is_under_construction` are hardcoded — see
`dynamic/extractors/stations.py:243-245` and the docstring "Module/construction/state
extraction is pending a dedicated probe").

Per the agreed scope, we build this **bottom-up**:
1. Get **full station composition** probed, extracted, and ingested into the DB.
2. **Selectively** expose the useful parts via the API.
3. Build the UI (both views), **omitting/adapting** metrics we genuinely cannot source.

Outcome: a real, data-backed "My Stations" page, and a station-composition dataset that
later pages (Construction, Logistics, Station Planner) can also build on.

---

## Design → data reconciliation

| Mockup field | Status | Source |
|---|---|---|
| Station name / sector / type | ✅ have | `stations` + sector lookup; type from `macro`/category (`api/v1/map.py` category logic) |
| Status `building` vs `operational` | ✅ after extraction | `is_under_construction` / `build_pct` |
| Modules built / total | ⚠️ extract needed | `station_modules.count` + `construction_pct` (table currently empty) |
| Build progress + "awaiting materials" (have/need) | ⚠️ extract needed | `stations.build_pct` + `construction_needs.required/delivered` (empty) |
| Producing & Selling / Buying (ware, stock, price) | ✅ have | `station_offers` via `GET /stations/{id}/offers` |
| Production-module count, storage capacity, workforce capacity | ✅ derivable | join `station_modules.macro` → static `modules` (kind, storage_capacity, workforce_capacity) |
| **Net profit / h** | ❌ not captured anywhere | — drop from MVP |
| Storage % / Workforce % *utilization* | ❌ no live fill data (only static capacity) | show **capacity**, not %; revisit after probe |
| Supply shortages + run-out ETA, `critical` status | ❌ needs production sim | drop from MVP |
| Docked ships, build ETA, build queue | ❌ not captured | drop ETA; "queue" ≈ modules with `construction_pct < 100` if probe confirms |

Decisions (confirmed): omit-and-adapt unbacked metrics (no fake/N-A cells); build **both**
views with Cards as default.

---

## Phase A — Probe save station composition (discovery)

Goal: nail the exact XML element names/depths before writing extractor code (the codebase
convention — see depth comments in `stations.py`).

- Use a real save (the user's configured saves dir / X4 install). Run a targeted streaming
  dump (extend `dynamic/profile.py` or a throwaway script using `savefile/dispatch.stream_save`)
  to confirm, **for a player-owned station under construction**, the elements carrying:
  - per-module **count** + **construction progress** (under `connection="modules"`; the
    current `_on_module` already locates these),
  - station **build progress** / under-construction flag (`modulelevel` attr is already
    noted in `docs/save-structure.md`; find the build %/`buildprocessor`/`constructionplan`),
  - **construction material needs** (required vs delivered per ware),
  - *(opportunistic)* current **workforce** population and current **station cargo/storage**
    fill — if present, they unlock the % metrics; if absent, confirm they're save-omitted.
- Record findings by extending the station row in `docs/save-structure.md`.

> This phase needs a real save; the dump may run via `! x4c profile-save <path>` (or the
> throwaway probe) so output lands in the session.

---

## Phase B — Extend extraction & ingest

Files: `packages/x4-extract/src/x4_extract/dynamic/extractors/stations.py`,
`dynamic/pipeline.py`, (maybe) `sql/schema_dynamic.sql`.

- In `StationsCollector`:
  - Populate **`station_modules`**: aggregate the already-collected module macros into
    `(module_id, macro, count, construction_pct)` (use `collections.Counter` for count;
    capture construction_pct from the probed element).
  - Populate **`construction_needs`**: new visitor for the material-needs element
    (`required`, `delivered`).
  - Set real **`build_pct`** and **`is_under_construction`** on `StationRow`
    (replace hardcoded `None`/`0` at lines 243-245).
  - Extend `tables()` and `flush()` to write the new tables. Tier choice: station rows +
    module composition are **STRUCTURAL**; construction progress/needs are best treated as
    **VOLATILE** (they tick during a build). Split the writes accordingly.
  - *(If probe found them)* add `station_workforce` / `station_cargo` tables to
    `schema_dynamic.sql` and populate.
- Bump `_PIPELINE_VERSION` in `pipeline.py:53` ("15" → "16") so existing per-save DBs
  re-ingest and gain the newly-populated tables (per memory: bump on collector changes).
- Re-ingest a save with `force=True` and verify rows: `station_modules`, `construction_needs`
  populated; `build_pct`/`is_under_construction` correct for an in-progress station.

---

## Phase C — Selective API exposure

File: `packages/x4-api/src/x4_api/api/v1/stations.py` (extend; `/stations` and
`/stations/{id}/offers` already exist). Static module facts join via natural keys against
`static.db`'s `modules` table (the established cross-DB join pattern).

- Extend **`LiveStation`** (or add a `/stations/summary` list) with the cheap, list-level
  aggregates the Cards/Console need without N+1 calls:
  `build_pct`, `is_under_construction` (already columns), `module_count`,
  `production_module_count`, `storage_capacity`, `workforce_capacity`, and a derived
  `category`/type label (reuse the category logic in `api/v1/map.py`).
- Add **`GET /stations/{id}/modules`** → `[{module_id, macro, name, kind, size,
  produces_ware_id, count, construction_pct}]` (join static for name/kind/produces).
- Add **`GET /stations/{id}/construction`** → `{build_pct, needs:[{ware_id, name,
  required, delivered}]}`.
- Regenerate the dashboard OpenAPI client (`lib/apiClient.ts`) after the schema changes.

---

## Phase D — Dashboard "My Stations" subpage

Files: `routes/stations/layout.tsx`, `router.tsx`, new `routes/stations/overview.tsx`
(+ small subcomponents). Follow the just-rebuilt **Missions** page conventions
(`routes/missions/*`): React Query `fetch("/api/v1/…")` hooks, `useState` for view/selection/
filters, Tailwind + `HUDCard`, badge/`Currency` components.

- **Tab**: add `{ to: "/stations/overview", label: "My Stations", icon: Building2 }` to
  `TABS` in `stations/layout.tsx`; register `stationsOverviewRoute` in `router.tsx`
  (mirror `stationsModulesRoute`).
- **Page** (`overview.tsx`), H1 "Station Overview", subtitle "{n} STATIONS · {m} BUILDING":
  - **KPI strip** (adapted to real data): Stations · Under Construction · Production Modules
    · Total Modules (drop NET PROFIT/H).
  - **Fleet Cards** (default): per-station card — name, **type badge** (factory/wharf/
    shipyard/tradestation/HQ) + sector (use type as the primary chip since owner is always
    "player"), status badge (Operational/Building), **build block** (build_pct bar +
    awaiting-materials have/need from `construction_needs`) when under construction,
    KPI grid (Modules built/total, Production modules, Storage capacity, Workforce capacity),
    expand → Producing & Selling + Buying (from offers). Omit profit/storage%/workforce%/
    docked.
  - **Ops Console** toggle: 360px master list (name, status dot, type, modules) + detail
    pane reusing the same data (status header, build/needs block, capacity stat grid,
    Producing/Buying tables). Mirror `routes/missions/index.tsx` master/detail.
  - **Filters**: search + type filter + "under construction" toggle.
- **Reuse**: sector-name + faction lookups and `fmtCredits` (`routes/empire.tsx`,
  `routes/missions/helpers.tsx`), ware name/category (`lib/wareFormat.ts`, `lib/constants.ts`),
  `HUDCard`, `FactionBadge`/`Currency`. Add a small `StationStatusBadge` + station-type label
  helper.

---

## Verification

1. **Extraction**: `force` re-ingest a real save; query the per-save dynamic DB —
   `station_modules`, `construction_needs` non-empty; `build_pct`/`is_under_construction`
   sane for an in-progress station; player-station counts match in-game.
2. **API**: start `x4-api`; `GET /stations?player_only=true` returns aggregates;
   `/stations/{id}/modules` and `/stations/{id}/construction` return expected rows; `/offers`
   still works. Add/adjust API tests (fixtures in `packages/x4-api/tests/`).
3. **UI**: run the dashboard, open **Stations → My Stations**; verify both views render
   from a live save, build progress + awaiting-materials show for a constructing station,
   offers populate the expand/detail, and filters/toggle work. Confirm graceful empty state
   when no save is loaded.

## Out of scope / future
Net profit/h, supply-shortage detection & ETAs, storage/workforce % utilization, docked-ship
lists, build-queue ordering — each needs data we don't yet capture (or a production
simulation). Revisit storage/workforce % if Phase A finds live fill/population in the save.
The mockup's "Construction" and "Logistics" top-tabs are deferred.
