# Setup & initialization flow

What happens between the user clicking **Initialize** and the dashboard rendering its
first page. Written against the code as of 2026-07.

---

## Phase 0 — Server boot (already happened)

Before the browser even loads, the API server is running on `127.0.0.1:8765`.

### 0.1 — Uvicorn starts the FastAPI app

`x4_api.server_entry.main()` (or `cli.py serve`) calls `uvicorn.run` with the
`x4_api.api.app:app` factory. All routes are registered, middleware is wired up.

→ [server_entry.py](../packages/x4-api/src/x4_api/server_entry.py)
→ [app.py](../packages/x4-api/src/x4_api/api/app.py:68)

### 0.2 — Settings singleton is created

`Settings()` resolves `data_dir`:

- **Source checkout**: `repo/data/` (detected via `_pin_data_dir` walking up 4 parents
  from `config.py`)
- **Packaged build**: `~/.x4-companion/data/` (app-data fallback)
- **Explicit env**: `X4C_DATA_DIR` wins over both

`install_path` and `save_path` are *optional* at this point — the server boots
unconfigured so the setup wizard can run.

→ [config.py](../packages/x4-api/src/x4_api/config.py:85-93)

### 0.3 — Lifespan: static mounts + background refresher

The FastAPI lifespan context manager fires:

- **0.3a** If `icons_dir` exists: mounts `/static/icons` → `data/icons/`. On a fresh
  install this directory doesn't exist yet, so no mount — added later when the icon
  build creates it (but the StaticFiles mount only takes effect at startup; a
  restart is needed for newly-created directories to be served).
- **0.3b** If `background_refresh` is enabled (default): creates a
  `BackgroundRefresher` and spawns its daemon thread. The thread immediately enters
  a wait loop — it blocks until `static_db_ready()` returns `true` AND the init
  job isn't running. On a fresh install this means it sits idle through Phase 3.
- **0.3c** If `dashboard_dist/` exists: mounts `/assets` and an SPA catch-all at `/`
  that serves `index.html` for client-side routing.

→ [app.py](../packages/x4-api/src/x4_api/api/app.py:53-64)
→ [refresher.py](../packages/x4-api/src/x4_api/api/refresher.py:109-126)

### 0.4 — Dashboard loads in browser

React mounts in `main.tsx`. The component tree:

```
<QueryClientProvider>
  <SettingsProvider>
    <TooltipProvider>
      <SetupGate>          ← polls /api/v1/setup/status
        <BackgroundRefresh />
        <RouterProvider />
      </SetupGate>
    </TooltipProvider>
  </SettingsProvider>
</QueryClientProvider>
```

→ [main.tsx](../packages/x4-dashboard/src/main.tsx:36-44)

---

## Phase 1 — Setup Gate decides: wizard or app?

### 1.1 — Polling begins

`SetupGate` fires `useQuery(["setup-status"])` → `GET /api/v1/setup/status`.

Polling interval depends on state:
- `init.running === true` → every **1 second** (fast, so the dashboard appears the
  moment the build finishes)
- `init.running === false` → every **5 seconds**

→ [SetupGate.tsx](../packages/x4-dashboard/src/components/setup/SetupGate.tsx:19-20)

### 1.2 — Server responds with SetupStatus

```json
{
  "configured": false,
  "install_path": null,
  "save_path": null,
  "static_ready": false,
  "needs_setup": true,
  "init": { "stage": "idle", "label": "Not started", "progress": 0.0, "running": false }
}
```

`needs_setup` logic: `true` until `static_ready AND paths_valid AND NOT init.running
AND NOT init.error`.

→ [setup.py](../packages/x4-api/src/x4_api/api/v1/setup.py:93-104)

### 1.3 — Gate renders the wizard

`needs_setup === true` → `<SetupWizard>` renders. `init.stage === "idle"` → shows the
**ConfigureStep** (folder picker).

→ [SetupGate.tsx](../packages/x4-dashboard/src/components/setup/SetupGate.tsx:32)
→ [SetupWizard.tsx](../packages/x4-dashboard/src/components/setup/SetupWizard.tsx:28)

---

## Phase 2 — User picks folders and clicks Initialize

### 2.1 — Auto-discovery (best-effort)

On first mount, the wizard calls `GET /api/v1/setup/discover` to try to find game
folders automatically. If found, pre-fills the inputs. If the endpoint doesn't exist
(404), the fields stay blank and the user types paths manually.

> **⚠️ Note:** the `/setup/discover` endpoint is called by the frontend but not yet
> implemented in the backend. It 404s silently; the wizard degrades gracefully.

→ [setup.ts](../packages/x4-dashboard/src/lib/setup.ts:53-57)

### 2.2 — Path validation (debounced)

As the user types or picks a folder, the wizard calls `POST /api/v1/setup/validate-path`
after a 500ms debounce. Server checks:

- **Install folder**: counts `*.cat` files (base + `extensions/*/ext_*.cat`).
  Returns `ok: true` if any are found.
- **Save folder**: counts `*.xml.gz` files. Returns `ok: true` if any are found.

Both inputs must show green checkmarks before the Initialize button enables.

→ [setup.py](../packages/x4-api/src/x4_api/api/v1/setup.py:120-140)
→ [SetupWizard.tsx](../packages/x4-dashboard/src/components/setup/SetupWizard.tsx:152-158)

### 2.3 — User clicks Initialize

Two sequential API calls:

#### 2.3a — `POST /api/v1/setup/config`

Persists `install_path` and `save_path`:

1. Writes to `~/.x4-companion/config.json` via `appdata.write_config()` (survives
   restart — the `_JsonConfigSource` reads it back on next boot).
2. Mutates the live `settings` singleton in-place: `settings.install_path = ...`,
   `settings.save_path = ...`. All existing references (deps, refresher) see the
   new paths immediately — no restart needed.

→ [setup.py](../packages/x4-api/src/x4_api/api/v1/setup.py:143-151)
→ [appdata.py](../packages/x4-api/src/x4_api/appdata.py:57-67)

#### 2.3b — `POST /api/v1/setup/initialize`

Kicks off the background init job:

1. `job.start(settings)` — creates `InitState(stage="datalake")` and spawns a
   **daemon thread** running `InitJob._run(settings)`.
2. Returns immediately with the updated `SetupStatus` (now `init.running = true`,
   `init.stage = "datalake"`).
3. If a job is already running, `start()` is a no-op and returns `false`.

→ [setup.py](../packages/x4-api/src/x4_api/api/v1/setup.py:157-160)
→ [init_job.py](../packages/x4-api/src/x4_api/init_job.py:73-83)

### 2.4 — Wizard flips to progress view

Frontend receives `init.running === true` → `<SetupWizard>` switches from
`<ConfigureStep>` to `<InitProgress>`. Shows:

- A spinner
- The current stage label (e.g. "Extracting game archives…")
- A detail line (e.g. "Reading base catalog: 01.cat")
- A progress bar (0–100%, driven by `init.progress`)

Polling accelerates to 1s intervals.

→ [SetupWizard.tsx](../packages/x4-dashboard/src/components/setup/SetupWizard.tsx:28)
→ [SetupWizard.tsx](../packages/x4-dashboard/src/components/setup/SetupWizard.tsx:197-227)

---

## Phase 3 — The init job (daemon thread, 2–15 minutes)

`InitJob._run()` executes four sequential stages in a single thread. Each stage
updates `InitState` via `self._set()`, which is thread-safe (protected by a lock).
The frontend's 1s polling picks up these updates and re-renders the progress UI.

### 3.1 — DATALAKE: extract game archives → raw.db

**Function:** `run_crawler(settings)`

Reads all `.cat` archives from the game install folder, decompresses their entries,
and writes raw XML files into `raw.db` (the "datalake"). Three sub-phases:

1. Base catalogs — reads `01.cat`, `02.cat`, etc. at the install root
2. DLC catalogs — reads `extensions/*/ext_*.cat` for each DLC and workshop mod
3. Writing to database — batch-inserts decompressed file contents into
   `raw.raw_files`

**Progress:** crawler reports `0.0 → 0.4` internally (mapped directly to init
progress 0.0 → 0.4).

**Duration:** ~30s–2min depending on number of DLCs and disk speed.

→ [crawler.py](../packages/x4-extract/src/x4_extract/static/crawler.py:52)
→ [init_job.py](../packages/x4-api/src/x4_api/init_job.py:94)

### 3.2 — STATIC: transform XML → static.db

**Function:** `run_static(settings)`

Reads the datalake (`raw.db`) and transforms it into structured `static.db` tables.
26 sequential steps, each extracting one domain:

| Order | Domain | Output tables |
|-------|--------|--------------|
| 1 | Ware groups | `ware_groups` |
| 2 | Mission groups | `mission_groups` |
| 3 | Wares | `wares`, `ware_inputs`, `ware_production` |
| 4 | Equipment mods | `equip_mods`, `mod_effects` |
| 5 | Drops | `drops`, `drop_items` |
| 6 | Factions | `factions` |
| 7 | Races | `races` |
| 8 | Ships | `ships`, `ship_storage`, `ship_connections`, `ship_paintmods` |
| 9 | Equipment | `equip_engines`, `equip_shields`, `equip_weapons`, etc. |
| 10 | Modules | `modules` |
| 11 | Station types | `station_types` |
| 12 | Derived ship stats | (updates `ships` with computed hull/speed) |
| 13 | Loadouts | `loadouts`, `loadout_items` |
| 14 | Map | `clusters`, `sectors`, `zones`, `gates`, `highway_gates` |
| 15 | Region definitions | `region_definitions`, `region_bonus` |
| 16 | Terraforming | `terraform_projects`, `terraform_wares` |
| 17 | Diplomacy | `diplomacy_actions` |
| 18 | Gamestart stories | `gamestart_stories` |
| 19 | Assignments | `assignments` |
| 20 | Behaviours | `behaviours` |
| 21 | Roles | `roles` |
| 22 | Texts | `texts` |
| 23 | Orders (aiscripts) | `orders` |
| 24 | Ware uses | `ware_uses` (derived cross-reference) |
| 25 | — (reserved) | |
| 26 | — (reserved) | |

**Progress:** pipeline reports `step/26` → mapped to init progress `0.4 → 0.5`
(10% weight).

**Duration:** ~1–3min depending on DLC count and CPU speed. The macros.xml step
(ships + equipment + modules) dominates — it resolves thousands of file paths.

> **⚠️ Gate unblocked:** after this stage, `static_db_ready()` returns `true`. The
> background refresher's wait loop at 0.3b clears its first gate (`static_db_ready`)
> but still waits for `job.state().running` to clear.

→ [pipeline.py](../packages/x4-extract/src/x4_extract/static/pipeline.py:59)
→ [init_job.py](../packages/x4-api/src/x4_api/init_job.py:96-97)

### 3.3 — ICONS: decode DDS textures → PNG files

**Function:** `rebuild_icons(settings)`

1. Reads `libraries/icons.xml` from the game catalogs.
2. Maps logical icon IDs to texture paths (handles wildcard patterns like
   `ship_*` → `ship_behemoth`, `ship_osprey`, …).
3. For each mapping: locates the DDS bytes in the catalog index, decompresses
   (gunzip), decodes DDS → RGBA pixels (BC1/BC3/BC7 via `texture2ddecoder`, with a
   `texconv.exe` fallback on Windows), and saves as PNG under
   `data/icons/<category>/<logical_id>.png`.
4. Writes `data/icons/manifest.json` — a JSON map of `{logical_id: {md5, path}}`.

**Incremental:** checks the MD5 hash of each source entry against the previous
manifest. Unchanged icons are skipped (typically >90% on re-runs).

**Progress:** icons reports `i/total` (where `total` = number of icon mappings) →
mapped to init progress `0.5 → 0.9` (40% weight).

**Duration:** ~2–10min depending on icon count and CPU speed. DDS decoding is the
bottleneck.

> **⚠️ This is when `manifest.json` appears on disk.** The `_load_manifest()`
> function in `icons.py` uses an mtime-based cache — the next API call after this
> stage completes will read the fresh manifest and resolve `icon_url` correctly.

→ [icons.py](../packages/x4-extract/src/x4_extract/static/icons.py:48)
→ [init_job.py](../packages/x4-api/src/x4_api/init_job.py:99-100)

### 3.4 — DYNAMIC: ingest newest save → dynamic.db

**Function:** `run_dynamic(settings, newest_save)`

1. Finds the newest `*.xml.gz` save file in the configured save folder.
2. Reads the save's `<info>` header to extract the player/save name for display.
3. Streams the full save XML through all collectors in one pass:
   - **MetaCollector** — player name, game time, game version
   - **StatsCollector** — player stats (cash, assets, kills, etc.)
   - **MissionsCollector** — active missions and offers
   - **StationsCollector** — station construction, modules, storage, workforce
   - **FactionsCollector** — faction relations, strengths
   - **LogbookCollector** — logbook entries
   - **MessagesCollector** — player messages
   - **NPCsCollector** — NPC crew, skills, locations
   - **ShipLoadoutCollector** — ship equipment loadouts
   - **DeployablesCollector** — satellites, nav beacons, resource probes
   - **PlayerCollector** — player inventory, licences, blueprints
   - **SectorsCollector** — sector ownership, security
   - **ShipsCollector** — all ships (player + NPC), positions, orders
   - **ResourceAreasCollector** — mining yields per sector
   - **EconomyLogCollector** — station trade offers
4. Writes collected data to `dynamic/<save_key>.db` in tiered transactions
   (WAL mode — API readers stay live during writes).
5. Computes derived artifacts: sector distances, top trade routes.
6. Runs delta computation: diffs against the previous ingest to produce
   per-entity change events for the background refresh system.

**Progress:** dynamic reports internally as:
- Streaming save XML: `0.0 → 0.7`
- Ingesting tiers: `0.7 → 1.0`
- Mapped to init progress `0.90 → 1.0` (10% weight).

**Duration:** ~30s–3min depending on save file size (typically 50–300 MB
compressed).

→ [pipeline.py](../packages/x4-extract/src/x4_extract/dynamic/pipeline.py:101)
→ [init_job.py](../packages/x4-api/src/x4_api/init_job.py:102-114)

### 3.5 — Done

`self._set(stage="done", progress=1.0, detail="Done")`. The next 1s poll picks
this up.

→ [init_job.py](../packages/x4-api/src/x4_api/init_job.py:107)

---

## Phase 4 — Gate lifts, dashboard renders

### 4.1 — Poll detects completion

Frontend receives `stage="done"`, `running=false`. The server computes
`needs_setup`:

```
needs_setup = NOT static_ready      ← false (static.db populated)
           OR NOT paths_valid       ← false (folders validated)
           OR init.running          ← false (job finished)
           OR init.error IS NOT NULL ← false (no error)
           = false
```

### 4.2 — Gate renders children

`SetupGate` sees `needs_setup === false` → renders `{children}` instead of
`<SetupWizard>`.

→ [SetupGate.tsx](../packages/x4-dashboard/src/components/setup/SetupGate.tsx:32)

### 4.3 — React tree mounts

- `<BackgroundRefresh />` — starts polling `/api/v1/refresh-status` every 7s
  for live save change markers. On first poll it establishes a baseline
  (no refetch triggered).
- `<RouterProvider>` — TanStack Router renders `<AppLayout>`.
- Index route `/` redirects to `/empire` (or the last-visited route if the
  user navigated via URL).

→ [main.tsx](../packages/x4-dashboard/src/main.tsx:38-40)
→ [router.tsx](../packages/x4-dashboard/src/router.tsx:40-42)

### 4.4 — AppLayout renders

Sidebar navigation + header (save selector, refresh indicator, theme toggle,
settings) + the active page in an `<Outlet>`.

---

## Phase 5 — First data request

### 5.1 — Page component fires queries

Example: the Empire Overview page fires `useQuery` hooks for player stats,
stations, fleet summary, net worth, etc.

### 5.2 — `get_db` dependency

Each API request goes through `get_db`:
1. Calls `ensure_active_dynamic_db(settings)` → opens or creates the per-save
   `dynamic/<save_key>.db`.
2. Opens a read-only connection with `ATTACH DATABASE 'static.db' AS s` — so
   every SQL query can JOIN static catalog data (module names, ware prices, ship
   specs) with live save data.
3. Connection is closed after the request (yield/finally).

→ [deps.py](../packages/x4-api/src/x4_api/api/deps.py:22-36)

### 5.3 — Icon resolution

When a module/ware/ship/faction endpoint builds its response, it calls one of:
- `_module_icon_url(module_id)` — modules only, uses `module_<id>` key in manifest
- `get_icon_url(logical_id)` — ships, factions, equipment (has fallback path)
- `get_ware_icon_url(ware_id, icon_path, tags)` — wares

All three call `_load_manifest()` which reads `data/icons/manifest.json` with
mtime-based caching (re-reads automatically when the file changes).

→ [icons.py](../packages/x4-api/src/x4_api/api/icons.py:17-41)
→ [modules.py](../packages/x4-api/src/x4_api/api/v1/modules.py:183-195)

### 5.4 — Browser loads icon PNGs

The frontend receives `icon_url: "/static/icons/stationmodules/module_struct_arg_vertical_02_macro.png"`,
renders an `<img>` tag, and the browser fetches it. FastAPI's `StaticFiles` mount
at `/static/icons` serves the file from `data/icons/`.

> **⚠️ Static mount race:** the `StaticFiles` mount is configured at server startup
> in the lifespan. If `data/icons/` didn't exist at boot (fresh install), the mount
> isn't added. The dashboard needs a **server restart** after the icon build
> completes for `/static/icons/` URLs to resolve. This is a known limitation of
> FastAPI's `StaticFiles` — mounts can't be added after startup.

---

## Phase 6 — Background refresh goes live

### 6.1 — Refresher thread unblocks

The `BackgroundRefresher` daemon (spawned at 0.3b) has been polling in a 1s loop
waiting for two conditions:

```python
while not self._stop.is_set():
    if static_db_ready(self._settings) and not job.state().running:
        break
    time.sleep(1.0)
```

After Phase 3 completes:
- `static_db_ready()` → `true` (since 3.2)
- `job.state().running` → `false` (since 3.5)

→ [refresher.py](../packages/x4-api/src/x4_api/api/refresher.py:122-128)

### 6.2 — Watch loop starts

`poller.watch_realtime()` enters its main loop:
- **Watchdog:** uses filesystem events (where available) to detect save file writes
- **Backstop:** periodic poll at `interval_sec` (default 60s) as a safety net
- **Pause gate:** if `job.state().running` becomes true again (manual rebuild),
  pauses polling to avoid contention
- On each save change: re-reads the save's source fingerprint. If unchanged →
  no-op. If changed → re-ingests via `run_dynamic()`.

→ [refresher.py](../packages/x4-api/src/x4_api/api/refresher.py:133-139)

### 6.3 — Frontend selective refresh

The `<BackgroundRefresh>` component polls `GET /api/v1/refresh-status` every 7s.
The response includes per-entity-type change markers:

```json
{
  "active_key": "quicksave",
  "markers": { "ship": 142, "station_offer": 87, ... },
  "source_fingerprint": "abc123...",
  "ingested_at": "2026-07-01T12:00:00Z"
}
```

When a marker advances (e.g. `ship` went from 140 → 142), only the React Query
keys mapped to that entity type are invalidated:

| Entity type | Invalidated query keys |
|-------------|----------------------|
| `ship` | `fleet-player`, `ship`, `ships`, `map-forces`, `map-conflicts`, `map:stations` |
| `logbook` | `logbook`, `logbook-categories` |
| `mission` | `missions` |
| `station_offer` | `station-offers`, `economy`, `economy-wares`, `routes`, `map-top-routes` |
| `faction_relation` | `faction-relations`, `player-reputation`, `map-tensions`, … |

Structural changes (fingerprint changed but no entity markers advanced) trigger a
refresh of `map-stations`, `map:stations`, `stations-player`, and `economy`.

→ [useBackgroundRefresh.ts](../packages/x4-dashboard/src/lib/useBackgroundRefresh.ts:28-73)

---

## Visual summary

```
User clicks "Initialize"
  │
  ▼
POST /setup/config       → persist install_path + save_path to config.json
  │                         mutate live settings singleton in-place
  ▼
POST /setup/initialize   → spawn InitJob daemon thread
  │
  ├─ [datalake]  prog 0.0→0.4   read .cat → raw.db            ~30s–2min
  ├─ [static]    prog 0.4→0.5   raw.db → static.db (26 steps)  ~1–3min   ← static_db_ready flips true
  ├─ [icons]     prog 0.5→0.9   decode DDS → PNG + manifest    ~2–10min  ← manifest.json appears
  └─ [dynamic]   prog 0.9→1.0   ingest save → dynamic.db       ~30s–3min
  │
  ▼
stage="done"  →  SetupGate lifts  →  Dashboard renders
  │
  ├─ Router mounts, redirects / → /empire
  ├─ React Query fetches data (modules, ships, stations, …)
  ├─ _load_manifest() reads manifest.json (mtime-cached)
  ├─ EntityIcon loads PNG from /static/icons/…
  └─ BackgroundRefresher starts watching for save changes
```

---

## Known issues & sharp edges

1. **`/setup/discover` endpoint missing.** The frontend calls it for auto-discovery
   of game folders, but no route exists in `setup.py`. The wizard degrades gracefully
   (fields stay blank).

2. **StaticFiles mount is startup-only.** If `data/icons/` doesn't exist when the
   server boots, the `/static/icons` mount isn't added. A server restart is needed
   after the icon build for icon PNGs to be served. The API JSON responses will
   include correct `icon_url` values, but the browser will get 404 on the actual
   image files.

3. **Progress weights are hardcoded.** The four stages are weighted at 40% / 10% /
   40% / 10% of the total progress bar, regardless of actual runtime. The icons
   stage is usually the longest; the static stage (26 steps) is under-weighted.
   See [init_job.py](../packages/x4-api/src/x4_api/init_job.py:91-106).

4. **`_load_manifest` caching.** Uses mtime-based cache (not `lru_cache`) so it
   recovers when `manifest.json` is created mid-process. The old `lru_cache` would
   permanently poison itself with `{}` if called before the file existed.
