# x4-companion

Second-monitor companion dashboard for X4: Foundations. Extracts the game's static catalog
and live save state into a normalized REST API, plus an opinionated React dashboard that
surfaces trade routes, production gaps, and construction needs.

**This is a uv workspace with two packages:**

| Package | Purpose | Published |
|---|---|---|
| `packages/x4-api` | Extraction + REST API. The public contract. | Will ship to PyPI when stable |
| `packages/x4-dashboard` | Opinionated React client. One consumer of the API. | Never |

## Read this first

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
