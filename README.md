# x4-companion

Second-monitor companion dashboard for X4: Foundations. Extracts the game's static catalog
and live save state into a normalized REST API, plus an opinionated React dashboard that
surfaces trade routes, production gaps, and construction needs.

**Four packages** (Python is a uv workspace; the dashboard and desktop shell are not):

| Package | Purpose | Published |
|---|---|---|
| `packages/x4-extract` | Game-data extraction: archives → `static.db`, saves → `dynamic/*.db` | With x4-api |
| `packages/x4-api` | REST API + `x4c` CLI. The public contract. | Will ship to PyPI when stable |
| `packages/x4-dashboard` | Opinionated React client. One consumer of the API. | Never |
| `packages/x4-desktop` | Tauri desktop shell (product: **X4 Nexus**). | App installer |

## Read this first

- **[`docs/developer-guide.md`](docs/developer-guide.md)** — what each package is and exactly
  what you need installed to run them. Start here for setup.
- **[AGENTS.md](AGENTS.md)** — coding standards, architecture, examples. Read before
  contributing or asking an AI assistant to contribute.
- **[`docs/architecture.md`](docs/architecture.md)** — links to the full build plan.

## Quick start

```powershell
# 1. Install Python 3.12 and uv (https://docs.astral.sh/uv/)
# 2. Set env vars — at minimum X4C_INSTALL_PATH and X4C_SAVE_PATH (see .env.example)
copy .env.example .env
notepad .env

# 3. Install
uv sync

# 4. Verify install paths
uv run x4c doctor

# 5. Extract static data (one-time + on patch)
uv run x4c rebuild-static
uv run x4c rebuild-icons

# 6. Parse the current save
uv run x4c ingest-save

# 7. Serve
uv run x4c serve
# → http://127.0.0.1:8765
```

## Status

Planning/scaffolding phase. The exemplar implementations of `config.py`, `extract/catdat.py`,
`extract/wares.py`, and `savefile/dispatch.py` establish patterns; the rest of the extractors
and endpoints follow the same shape and are open for implementation.

See [AGENTS.md](AGENTS.md) for the contribution playbook.
