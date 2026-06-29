# x4-desktop — Tauri shell

A thin native window that runs **alongside the game on a second monitor**. It spawns the
local `x4-api` server and hosts the dashboard; nothing leaves the machine.

```
┌──────────────────────────────┐
│  Tauri window (WebView2)      │
│   └─ dashboard (React/Vite)   │  ← talks to /api via Vite proxy (dev) or directly
├──────────────────────────────┤
│  Rust shell (src/main.rs)     │  ← spawns + kills the server, native folder dialog
│   └─ child: x4-api (uvicorn)  │  ← 127.0.0.1:8765
└──────────────────────────────┘
```

On first launch the dashboard's **setup gate** (`/api/v1/setup/*`) walks the user through
picking their game install + save folders and building the static database. The Rust shell
exposes the native folder picker via the `dialog` plugin (`window.__TAURI__.dialog`); in a
plain browser the wizard falls back to a typed path.

## Prerequisites (DEV machine only — end users need none of this)

- **Rust toolchain** — https://rustup.rs. Build-time only; the shipped app is a compiled
  exe, so end users never install Rust.
- **Tauri prerequisites** for Windows: WebView2 runtime (present on Windows 11) and the
  MSVC build tools. See https://tauri.app/start/prerequisites/.
- `uv` and `npm` on PATH (already required by the repo).

## Run the dev window

```powershell
cd packages/x4-desktop
npm install             # installs @tauri-apps/cli
npm run dev             # = tauri dev
```

`tauri dev` starts the Vite dev server (`beforeDevCommand`), opens the window pointed at
http://localhost:5173, and `src/main.rs` spawns `uv run x4c serve` for the API. Closing the
window kills the server child.

> Don't already have a separate `vite`/`npm run dev` running on :5173 — Tauri starts its own
> on that port and loads it. A pre-existing instance makes Vite drift to :5174 while Tauri
> still loads :5173.

## Packaged build (follow-up)

`npm run build` (`tauri build`) compiles the shell and bundles the dashboard `dist/`. In a
release build the shell prefers a bundled **`x4c-server[.exe]`** sidecar next to the
executable (produced by PyInstaller — not wired up yet) and falls back to `uv run x4c serve`.
Packaging the Python server into that sidecar is the next pass; see the project notes.

## Icons

`src-tauri/icons/` holds a generated placeholder mark. Replace with a real brand icon via:

```powershell
pnpm tauri icon path/to/icon.png
```
