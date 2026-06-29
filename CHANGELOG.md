# Changelog

All notable changes to X4 Nexus are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2026-06-29

First packaged pre-release. X4 Nexus is a second-monitor companion for
*X4: Foundations* that extracts the game's static catalog and your live save
state into a versioned REST API, surfaced through an opinionated desktop app.
This release bundles everything built since the project began.

### Added

#### Desktop app & distribution
- Self-contained Windows and Linux installers — no Python, Node, Rust, or uv
  required on the user's machine; the FastAPI server ships as a bundled
  PyInstaller sidecar inside a Tauri v2 shell.
- First-run setup wizard with a native folder picker for the X4 install and
  save paths, plus background initial extraction (static data + icons).
- Over-the-air updates via signed GitHub Release artifacts, with an in-app
  "Update & restart" notifier (progress + retry).
- CI release pipeline builds the sidecar, dashboard, and signed installers for
  Windows and Linux on `v*` tags.

#### Live save tracking
- Follows the latest save and refreshes in the background during play, with
  stale-DB protection against reading half-written saves.
- Multi-save catalog with active-save selection; per-save dynamic databases.
- Finance & P&L: net-worth-over-time chart and trade transaction history from
  the save's economy log (Empire → Finance).
- Crew roster with real NPC skill values (piloting, morale, engineering,
  management, boarding) as star ratings, roles, workplaces, and click-through
  ship detail.
- Player messages inbox and logbook timeline; live faction standings and
  events feed.

#### Galaxy map
- Full hex map with pan/zoom, sector names, and collapsible overlay layers.
- Intel overlay: conflict detection (skirmish → invasion → intense battle),
  border tensions colored by hostile fleet mass, and danger zones.
- In-sector station view with a 10km build grid.
- Fog of war — optionally hide undiscovered factions and content.
- Live per-sector resource fields (current/max).
- Pathfinding across gates and highways with uniform connection weights.

#### Trade & economy
- Production chain graph: depth-ordered commodity production trees with
  recipes, producer modules, and live market overlay
  (`GET /api/v1/economy/production-chain`).
- Live market pricing (min/avg/max) alongside static reference prices, plus
  supply/demand from station offers.
- Ware tiers computed via BFS from raw resources through recipes, with
  filtering.
- Trade route ranking by profit/hour and a supply-shortage radar.

#### Stations
- My Stations overview: per-station build progress, workforce, production, and
  account balance pulled live from the save.
- Station Builder: drag-and-drop planner (React Flow) with snap-point
  validation, tree-only topology enforcement, undo/redo, clipboard
  copy/paste, material cost aggregation, and blueprint/licence warnings.
- Module catalog with blueprint pricing and full stats; construction bill of
  materials derived from module recipes.

#### Ships & equipment
- Ship Builder: searchable ship picker with class/role filters, click-to-equip
  loadouts with slot validation, and live computed stats.
- Ship detail with theoretical-max-normalized stat bars, storage, and dynamic
  loadouts.
- Equipment, inventory, and trade-route UIs.

#### Missions
- Redesigned missions view with story detection, group folding
  (choice-forks vs required sequences), objective checklists with progress
  parsing, and a run planner with an embedded route map.

#### Data & API
- Three-layer data model: static reference catalog → gamestart seed → live
  per-save databases.
- 14+ extractors audited for full field coverage across ships, modules,
  station types, wares, loadouts, diplomacy, NPCs, missions, and game text.
- DLC-aware XML merge pipeline that deduplicates by id instead of appending
  duplicates.
- Versioned `/api/v1` REST contract with a maintained OpenAPI spec.

### Fixed
- DLC duplication producing duplicate faction relations and licences.
- Pathfinding treating all gates into a sector unequally (now uniform weights).
- SPA client-side routing on browser refresh.
- Non-destructive schema application (incremental `IF NOT EXISTS` upgrades),
  resolving a Windows file-lock issue.

### Performance
- Ship stats extraction reduced from ~44s to ~0.3s via component-XML parse and
  connection-count caches.
- `update_derived_stats` pre-computes per-size aggregates in Python,
  eliminating 5,100+ correlated DB subqueries.
- Pipeline bulk pre-loads all raw files into memory, replacing 8,000+
  individual case-insensitive lookups.

[0.0.1]: https://github.com/coltonfranco/x4-nexus/releases/tag/v0.0.1
