# Changelog

All notable changes to X4 Nexus are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions 0.0.2–0.0.5 are pre-1.0 patch releases that brought up the build, release,
and auto-update pipeline. Expect larger, less frequent releases going forward.

## [0.0.5] - 2026-06-30

### Fixed
- Auto-update on Windows failed with *"Error opening file for writing:
  …\_internal\VCRUNTIME140.dll"* — the running `x4c-server` sidecar held its bundled
  DLLs locked. An NSIS pre-install hook now terminates the sidecar before the installer
  overwrites files.

## [0.0.4] - 2026-06-30

### Fixed
- Updated builds no longer need Ctrl+Shift+R to show new features: `index.html` is
  served with `Cache-Control: no-cache`, so the webview revalidates it and loads the
  new content-hashed bundles after an update.

## [0.0.3] - 2026-06-30

### Added
- App version shown at the bottom of the Settings modal (from `/api/v1/health`).

### Fixed
- Tauri v2 build break: replaced the removed `set_background_color` call with the
  `backgroundColor` window config.
- Reduced the white launch flash by setting the native webview background dark.
- Updater no longer reports an error when there is simply no published release yet.

### Changed
- Single-source versioning: the git tag is the source of truth; CI injects it into
  every manifest at build time.
- Linux ships `.deb` only — AppImage was dropped because `linuxdeploy` couldn't bundle
  the PyInstaller sidecar (#28). Linux therefore has no auto-update artifact.

## [0.0.2] - 2026-06-30

First-run setup reliability, progress feedback, and packaging robustness.

### Added
- Two-level setup stepper showing all four build stages with honest per-stage progress.
- Real byte-position progress for the dynamic save ingest.
- Mtime-based icon-manifest cache, replacing an `lru_cache` that could poison itself.
- Startup gates so the background refresher/poller don't contend with first-run setup.
- Window opens maximized; dark theme applied before first paint.

### Fixed
- Windows sidecar console window hidden (`CREATE_NO_WINDOW`).
- Ware extraction de-duplicates owners, illegal factions, and production methods.
- PyInstaller hidden imports for `uvicorn`, `x4_api`, and `x4_extract`.

## [0.0.1] - 2026-06-29

First packaged pre-release: a second-monitor companion for *X4: Foundations* that
extracts the game's static catalog and live save state into a versioned REST API,
surfaced through a Tauri desktop app with a bundled PyInstaller server.

### Added
- **Distribution** — self-contained Windows/Linux installers (no Python/Node/Rust
  required); first-run setup wizard; signed over-the-air updates; CI release pipeline.
- **Live save tracking** — follows the latest save in the background; multi-save catalog;
  finance/P&L, crew roster, messages, logbook, and live faction standings.
- **Galaxy map** — hex map with pan/zoom and overlays; conflict/intel detection;
  in-sector station view; fog of war; live per-sector resources; gate/highway pathfinding.
- **Trade & economy** — production-chain graphs with live market overlay; ware tiers;
  trade-route ranking and supply-shortage radar.
- **Stations** — My Stations overview (live build/workforce/production); drag-and-drop
  Station Builder with snap validation, undo/redo, and bill of materials.
- **Ships & equipment** — Ship Builder with loadout validation and computed stats;
  ship detail, equipment, inventory, and trade-route views.
- **Missions** — story detection, group folding, objective checklists, and a run planner.
- **Data & API** — three-layer model (static → gamestart → per-save); 14+ audited
  extractors; DLC-aware XML merge; versioned `/api/v1` with a maintained OpenAPI spec.

### Fixed
- DLC duplication of faction relations/licences; uneven gate pathfinding weights; SPA
  refresh routing; non-destructive schema upgrades (resolving a Windows file-lock issue).

### Performance
- Ship-stats extraction ~44s → ~0.3s; eliminated 5,100+ correlated subqueries in
  derived-stat computation; bulk file pre-load replacing 8,000+ per-file lookups.

[0.0.5]: https://github.com/coltonfranco/x4-nexus/releases/tag/v0.0.5
[0.0.4]: https://github.com/coltonfranco/x4-nexus/releases/tag/v0.0.4
[0.0.3]: https://github.com/coltonfranco/x4-nexus/releases/tag/v0.0.3
[0.0.2]: https://github.com/coltonfranco/x4-nexus/releases/tag/v0.0.2
[0.0.1]: https://github.com/coltonfranco/x4-nexus/releases/tag/v0.0.1
