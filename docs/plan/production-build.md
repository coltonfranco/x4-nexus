# Plan: Production Build — Self-Contained Installer

> Roadmap for turning the dev-only Tauri app into a single installer that needs **no**
> Python / Node / uv / Rust on the end user's machine. Captured 2026-06-19.

## Context

The dev path works (`npm --prefix packages/x4-desktop run dev`), and the architecture
already *anticipates* packaging — but the hard part (bundling Python) isn't done, and two
correctness gaps will surface the moment a real `tauri build` runs.

`tauri build` already produces an installer, but the result is **not** self-contained: the
Rust shell (`packages/x4-desktop/src-tauri/src/main.rs:24-44`) looks for an `x4c-server.exe`
sidecar next to the binary and **falls back to `uv run x4c serve`** when it's missing. Nothing
bundles that sidecar yet (`tauri.conf.json` has no `externalBin`), so a shipped app would
silently require `uv` + Python + the repo checkout. That's the core gap.

## What a fully self-contained installer requires

### 1. Bundle the Python server into a standalone exe (the big lift)

The server has heavy native deps — `lxml`, `Pillow`, `texture2ddecoder`, `networkx`,
`uvicorn[standard]`. Use **PyInstaller** (or Nuitka) to freeze `x4c serve` into
`x4c-server.exe`:

- Add `pyinstaller` as a dev dependency in `packages/x4-api`.
- Write a `.spec` (none exists yet) with a small entry script that calls
  `uvicorn.run("x4_api.api.app:app", ..., factory=True)` — mirroring
  `packages/x4-api/src/x4_api/cli.py:160-172`.
- Handle `--hidden-import` / `--collect-all` for `uvicorn`, `lxml`, `PIL`,
  `texture2ddecoder`, and `x4_extract` / `x4_api` — their submodules are imported lazily / by
  string, so PyInstaller won't auto-discover them.
- Produce `x4c-server.exe` and verify it boots `:8765` on a machine with no Python.

### 2. Wire the sidecar into the Tauri bundle

`main.rs` already *looks* for the sidecar, but the build must actually place it there.

- Add it to `tauri.conf.json` under `bundle.externalBin` (Tauri's sidecar mechanism — copies
  the platform-suffixed binary next to the app).
- Drop the `uv` fallback from `main.rs` for release builds (keep only as a dev convenience).

### 3. Fix the production API-origin mismatch (correctness gap)

Every dashboard call is a **relative** `fetch("/api/v1/...")` (e.g.
`packages/x4-dashboard/src/lib/setup.ts`, `.../lib/map/useMapData.ts`). Works in dev via the
Vite proxy. In a packaged build Tauri serves the UI from `tauri://localhost` (`frontendDist`
in `tauri.conf.json`), so `/api/...` hits the wrong origin and **every request 404s**.

The server *can* serve the SPA itself (`packages/x4-api/src/x4_api/api/app.py:113-115` mounts
`dist/` at `/`), but `_dashboard_dist()` (`app.py:120-121`) uses a `parents[4]` repo-relative
path that won't exist inside a frozen exe. Pick one:

- **(Recommended)** Point the Tauri window at `http://127.0.0.1:8765` and let the server serve
  both SPA + API (same origin, no CORS). Requires bundling `dist/` into the PyInstaller output
  and fixing `_dashboard_dist()` for frozen mode (`sys._MEIPASS`).
- Or keep `tauri://localhost` serving the UI and switch the fetches to an absolute base URL +
  enable CORS on the API.

### 4. Cosmetics & installer polish

- Replace the placeholder icon (`src-tauri/icons/`) with a real brand mark via `tauri icon`.
- Bump `version` in `tauri.conf.json` (currently `0.0.1`).
- Choose Windows installer target (NSIS vs MSI) and the **WebView2 bootstrapper** policy so
  Windows 10 users without WebView2 get it auto-installed.
- (Optional) code signing to avoid SmartScreen warnings.

### 5. (Later) CI for cross-platform

The Tauri GitHub Action builds Windows/macOS/Linux on cloud runners — set up once the Windows
build is solid so you don't maintain per-OS toolchains.

## Minimum path to a working self-contained Windows build

1. PyInstaller spec → `x4c-server.exe` (with `dist/` bundled in).
2. Fix `_dashboard_dist()` for frozen mode + point the window at `:8765`.
3. Add `externalBin` to `tauri.conf.json`.
4. `npm --prefix packages/x4-desktop run build` → installer in
   `src-tauri/target/release/bundle/`.

## Verification

Test on a **clean VM with no Python / Node / uv / Rust** (only Windows + WebView2):

- App launches, server comes up on `:8765`.
- First-run **setup wizard** appears, native folder picker works.
- Picking install + save folders and running initialize builds `static.db`.
- After setup, the real app mounts and map/factions/etc. load data (confirms the
  API-origin fix).

## Critical files

- `packages/x4-desktop/src-tauri/src/main.rs` — sidecar spawn + `uv` fallback (§1, §2)
- `packages/x4-desktop/src-tauri/tauri.conf.json` — `externalBin`, `frontendDist`, version (§2, §3, §4)
- `packages/x4-api/src/x4_api/cli.py:160-172` — `serve` entry point to mirror in the spec (§1)
- `packages/x4-api/src/x4_api/api/app.py:113-121` — SPA mount + `_dashboard_dist()` (§3)
- `packages/x4-api/pyproject.toml` — add `pyinstaller` dev dep (§1)
- `packages/x4-dashboard/src/lib/*.ts` — relative `/api` fetches (§3)
