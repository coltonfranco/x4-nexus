# x4-api

Public REST API and extraction toolkit for X4: Foundations static catalog and live save data.

This package is the **public contract** of the `x4-companion` project. It is published
independently and consumed by `x4-dashboard` (in this repo) plus any third-party tools.

See the repo-level [`AGENTS.md`](../../AGENTS.md) for architecture and contribution standards.

## Install

```bash
pip install x4-api    # once published
# or, from the workspace:
uv sync
```

## CLI

```bash
x4c doctor                  # verify install + save paths
x4c rebuild-static          # extract game XML → static.db
x4c rebuild-icons           # extract icon DDS → PNG
x4c ingest-save [PATH]      # parse the current save → dynamic.db
x4c serve                   # run the FastAPI server
```

## Python

```python
from x4_api.config import settings
from x4_api.db.connection import open_db

conn = open_db(settings.data_dir)
wares = conn.execute("SELECT ware_id, name FROM s.wares LIMIT 10").fetchall()
```

## API contract

All HTTP routes are prefixed `/api/v1/`. Breaking changes require a new version path.
The OpenAPI schema at `docs/openapi.yaml` is the authoritative contract.
