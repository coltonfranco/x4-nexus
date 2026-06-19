# X4 Nexus — Developer Guide

How the project is laid out, what each package does, and exactly what you need installed
to run each one. For **code standards** (how to write code in this repo) see
[`AGENTS.md`](../AGENTS.md); this guide is about **setup and orchestration**.

> **Naming:** the product is **X4 Nexus**. The repository/uv-workspace is `x4-companion`,
> and the packages keep `x4-*` names (`x4-extract`, `x4-api`, `x4-dashboard`, `x4-desktop`).

---

## 1. The big picture

X4 Nexus is a **local** companion app for *X4: Foundations*. The game's own files are the
source of truth; everything runs on the player's machine, nothing is sent anywhere.

```
        ┌─────────────────────────────────────────────────────────────┐
        │  x4-desktop  (Tauri / Rust)         ← native window + tray   │
        │   ├─ WebView2 ── loads ──► x4-dashboard (React)              │
        │   └─ spawns child process ─────────────┐                     │
        └────────────────────────────────────────┼─────────────────────┘
                                                  ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  x4-api  (FastAPI / uvicorn @ :8765)   ← REST API + `x4c` CLI │
        │   ├─ /api/v1/...  ◄── dashboard fetches here                  │
        │   └─ uses ──►  x4-extract                                     │
        └────────────────────────────────────────┬─────────────────────┘
                                                  ▼
        ┌─────────────────────────────────────────────────────────────┐
        │  x4-extract  (Python)                                        │
        │   ├─ reads game .cat/.dat archives  ──►  static.db           │
        │   └─ streams *.xml.gz save files    ──►  dynamic/<save>.db   │
        └─────────────────────────────────────────────────────────────┘
                                                  ▲
                                       X4 game install + save folder
```

**Dependency direction is one-way:** `x4-desktop → x4-api → x4-extract`. Lower layers never
import higher ones.

---

## 2. The packages

| Package | Path | Language / tooling | Role |
|---|---|---|---|
| **x4-extract** | `packages/x4-extract` | Python 3.12 (uv) | Game-data extraction: archives → `static.db`, saves → `dynamic/*.db` |
| **x4-api** | `packages/x4-api` | Python 3.12 (uv) | REST API server + `x4c` CLI + first-run setup |
| **x4-dashboard** | `packages/x4-dashboard` | TypeScript / React / Vite (npm) | The UI |
| **x4-desktop** | `packages/x4-desktop` | Rust / Tauri v2 (npm + cargo) | Native desktop shell |

### 2.1 `x4-extract` — the data engine

The hard part of the project: turning Egosoft's archives and save files into queryable SQLite.

- **Owns:** `.cat/.dat` archive reading, DLC `<diff>` overlay merging, XML extraction,
  DDS→PNG icon conversion, the datalake crawler, the static pipeline, and the streaming
  save-file reader (`savefile/dispatch.py`) + dynamic pipeline + poller.
- **Outputs:** `static.db` (game reference data — wares, ships, map…) and per-save
  `dynamic/<save_key>.db` (live state).
- **Notable deps:** `lxml` (libxml2), `Pillow`, `texture2ddecoder`, `watchdog`,
  `pydantic-settings`.
- **Knows nothing about the API or the web.** It's a pure library + pipelines.

### 2.2 `x4-api` — the server and CLI

- **Owns:** the FastAPI app (`api/`), the `x4c` CLI (`cli.py`), settings/config
  (`config.py`, `appdata.py`), the DB access layer, the background save refresher, and the
  **first-run setup flow** (`api/v1/setup.py`, `init_job.py`).
- **Public contract:** everything under `/api/v1/` is versioned and treated as a published
  API (see `docs/openapi.yaml`). The dashboard calls the same endpoints any third party would.
- **Entry points:** `x4c serve` (HTTP server), plus build/ingest commands (see §6).
- **Depends on** `x4-extract`.

### 2.3 `x4-dashboard` — the UI

- React 18 + TanStack Query/Router + Tailwind, built with Vite.
- **All server state via TanStack Query**, hitting `/api/v1/...`. In dev, Vite proxies
  `/api` and `/static` to `:8765` (see `vite.config.ts`).
- The API client (`src/lib/apiClient.ts`) is **generated** from `docs/openapi.yaml`
  (`npm run codegen`) — don't hand-edit it.
- Includes the **first-run setup gate + wizard** (`src/components/setup/`), which blocks the
  app until `static.db` is built.

### 2.4 `x4-desktop` — the native shell

- Tauri v2. A small Rust program (`src-tauri/src/main.rs`) that:
  1. spawns the API server as a child process (dev: `uv run x4c serve`; release: a bundled
     `x4c-server` sidecar, falling back to `uv`),
  2. opens a WebView2 window pointed at the dashboard,
  3. kills the server child when the window closes.
- Exposes the **native folder picker** to the wizard via the `dialog` plugin
  (`window.__TAURI__.dialog`); the wizard falls back to a typed path in a plain browser.
- See [`packages/x4-desktop/README.md`](../packages/x4-desktop/README.md) for shell details.

---

## 3. What you need installed

There are two very different audiences. **End users need none of the dev toolchain** — they
get a compiled app + WebView2 (already on Windows 11). The table below is about *your build
machine*.

| Tool | Needed by | Why | Install |
|---|---|---|---|
| **uv** | x4-extract, x4-api | Manages the Python 3.12 venv + deps; runs `x4c` | https://docs.astral.sh/uv/ |
| **Node.js + npm** | x4-dashboard, x4-desktop | Builds/serves the React app; runs the Tauri CLI | https://nodejs.org (LTS) |
| **Rust (rustup)** | x4-desktop | Tauri's shell *is* a Rust program; compiled on the build machine only | https://rustup.rs |
| **MSVC C++ Build Tools** | x4-desktop (Windows) | Provides `link.exe` + Windows SDK so Rust can produce a `.exe` | "Build Tools for Visual Studio 2022" → *Desktop development with C++* (free; no VS license needed) |
| **WebView2** | x4-desktop (runtime) | Renders the UI in the native window | Preinstalled on Windows 11 |

**Build-time vs. runtime, made explicit:**

|  | Your build machine | Your end users |
|---|---|---|
| uv / Python | ✅ (until PyInstaller packaging) | ❌ never |
| Node / npm | ✅ | ❌ never |
| Rust + MSVC tools | ✅ (Windows) | ❌ never |
| The app + WebView2 | — | ✅ only this |

> **Cross-platform note:** building the macOS/Linux versions happens on those OSes — the plan
> is to do it in **CI** (Tauri's GitHub Action builds all three on cloud runners), so you
> never install per-OS toolchains yourself.

---

## 4. First-time setup (from a fresh clone)

```powershell
# 1. Python workspace (x4-extract + x4-api)
uv sync                         # creates the venv, installs both packages + deps

# 2. Point at your game files — copy and fill in:
copy .env.example .env          # set X4C_INSTALL_PATH and X4C_SAVE_PATH
uv run x4c doctor               # verifies the paths and reports what it found

# 3. Build the static database (one-time, a few minutes)
uv run x4c rebuild-datalake     # game archives → raw.db
uv run x4c rebuild-static       # raw.db → static.db (+ icons)

# 4. Dashboard deps
npm --prefix packages/x4-dashboard install

# 5. (Optional) desktop shell deps — needs Rust + MSVC tools (see §3)
npm --prefix packages/x4-desktop install
```

> In a **packaged** build there's no `.env` step — the first-run **setup wizard** collects the
> folders and runs steps 3 automatically. See §7.

---

## 5. Running it (three ways)

**A) Full desktop app** (what ships to users):
```powershell
cd packages/x4-desktop
npm run dev        # = tauri dev: starts Vite, opens the window, spawns the API
```
> ⚠️ Run this from **cmd or PowerShell, not Git Bash** — Git Bash puts a coreutils `link.exe`
> on PATH that shadows the MSVC linker and breaks the Rust build.
> ⚠️ Don't already have a separate Vite running on `:5173` — Tauri starts its own there.

**B) Web only** (fastest iteration on the UI):
```powershell
uv run x4c serve                          # API on :8765, one terminal
npm --prefix packages/x4-dashboard run dev   # Vite on :5173, another terminal → open it
```

**C) API / CLI only** (backend work):
```powershell
uv run x4c serve            # http://127.0.0.1:8765 ; docs at /api/docs
```

---

## 6. Command cheat sheet

**Python (`uv run …`)** — from repo root:

| Command | What it does |
|---|---|
| `x4c doctor` | Verify install/save paths + data dir |
| `x4c serve [--reload]` | Run the API server (`:8765`) |
| `x4c rebuild-datalake` | Game archives → `raw.db` |
| `x4c rebuild-static` | `raw.db` → `static.db` (+ icons) |
| `x4c rebuild-icons` | DDS → PNG icons only |
| `x4c ingest-save [path]` | Parse a save → `dynamic/<key>.db` (default: newest) |
| `x4c watch` | Keep the active save's DB fresh until interrupted |
| `pytest` / `ruff check` / `mypy` | Test / lint / type-check |

**Dashboard (`npm --prefix packages/x4-dashboard …`):**

| Command | What it does |
|---|---|
| `run dev` | Vite dev server (`:5173`) with `/api` proxy |
| `run build` | Production build → `dist/` |
| `run codegen` | Regenerate `apiClient.ts` from `docs/openapi.yaml` |

**Desktop (`npm --prefix packages/x4-desktop …`):**

| Command | What it does |
|---|---|
| `run dev` | `tauri dev` — window + API + Vite |
| `run build` | `tauri build` — compiled app + installer |

> After adding/changing an API endpoint, regenerate `docs/openapi.yaml` (see AGENTS.md §5.3)
> and re-run the dashboard `codegen`.

---

## 7. First-run setup flow (how a fresh user gets going)

The main app requires a populated `static.db`; save data builds on top of it. On a clean
install there are no configured folders and no database, so:

1. The server **boots unconfigured** (`install_path` is optional). `x4-api` stays up and
   serves only the setup endpoints + health.
2. The dashboard's **setup gate** (`components/setup/SetupGate.tsx`) polls
   `GET /api/v1/setup/status`. While `needs_setup` is true it shows the **wizard** instead of
   the app.
3. The wizard collects the **game install folder** and **save folder** (native picker in the
   desktop app; typed path in a browser), validating each via `POST /setup/validate-path`.
4. `POST /setup/config` persists the choices to `%APPDATA%/x4-companion/config.json` **and**
   applies them to the live server — no restart needed.
5. `POST /setup/initialize` runs the datalake → static build in a background thread; the
   wizard shows progress by polling status. When `static_ready` flips true, the gate mounts
   the real app.

**Settings precedence** (highest → lowest): constructor args → env vars → `.env` →
`config.json` (app-data) → defaults. So the dev's `.env` always wins; a packaged user's
wizard choices persist in app-data.

---

## 8. Where things live at runtime

| What | Dev (source checkout) | Packaged app |
|---|---|---|
| Config (`config.json`) | `%APPDATA%/x4-companion/` | `%APPDATA%/x4-companion/` |
| `static.db`, `raw.db`, `dynamic/`, icons | repo `data/` | `%APPDATA%/x4-companion/data/` |
| API port | `127.0.0.1:8765` | `127.0.0.1:8765` |
| Vite dev port | `127.0.0.1:5173` | n/a (server serves `dist/`) |

---

## 9. Building for distribution

- **Desktop app:** `npm --prefix packages/x4-desktop run build` (`tauri build`) compiles the
  shell and bundles the dashboard `dist/`, producing an installer under
  `packages/x4-desktop/src-tauri/target/release/bundle/`.
- **Server sidecar (follow-up):** the release shell prefers a bundled **`x4c-server[.exe]`**
  sidecar next to the executable so end users need no Python. Producing that with PyInstaller
  is the next packaging task; until then the release build falls back to `uv run x4c serve`.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `link: extra operand …` / "Try 'link --help'" during `tauri dev` | You're in **Git Bash**; coreutils `link` shadows MSVC's. Use cmd/PowerShell. |
| `link.exe not found` / linker errors | MSVC C++ Build Tools not installed (§3). |
| Vite drifts to `:5174`, window blank | A stale Vite holds `:5173`. Kill it before `tauri dev`. |
| `cargo: command not found` | Open a new shell after installing rustup, or add `~/.cargo/bin` to PATH. |
| Wizard never appears | You already have a built `static.db` + configured paths → setup is complete (expected). |
| `program not found: cargo metadata` | `cargo` isn't on this shell's PATH. |
