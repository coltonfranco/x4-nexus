# AGENTS.md — contribution and code standards for x4-companion

This document is the source of truth for **how code is written in this repo**. It is
tool-agnostic: Claude Code, Codex, Cursor, Gemini, and human contributors all read
the same standards from here. Skim it whole before opening a PR or asking an AI
assistant to implement anything.

The architectural **why** lives in `C:\Users\colto\.claude\plans\binary-seeking-nebula.md`
(referenced by [`docs/architecture.md`](docs/architecture.md)). This file is the
**how** — patterns, examples, and rules.

---

## 0. TL;DR for a new agent picking up work

1. Read this whole file.
2. Read [`docs/data-tiers.md`](docs/data-tiers.md) for the V1 scope.
3. Look at the four EXEMPLAR files — they define the patterns:
   - `packages/x4-api/src/x4_api/config.py` — env + path resolution
   - `packages/x4-api/src/x4_api/extract/catdat.py` — reading game archives
   - `packages/x4-api/src/x4_api/extract/wares.py` — static XML extractor
   - `packages/x4-api/src/x4_api/savefile/dispatch.py` — streaming save dispatch
   - `packages/x4-api/src/x4_api/savefile/extractors/meta.py` — save visitor
   - `packages/x4-api/src/x4_api/api/v1/wares.py` — REST endpoint
   - `packages/x4-api/tests/test_extract_wares.py` — test layout
4. Pick a task. Match the shape of the exemplar for that layer.
5. Run `pytest`, `ruff check`, `mypy` before declaring done.

---

## 1. What this project is

X4: Foundations companion dashboard. Two packages, one repo:

| Package | Purpose | Audience |
|---|---|---|
| `packages/x4-api/` | Extraction + REST API. **Public contract.** | Any modder; ships to PyPI when stable. |
| `packages/x4-dashboard/` | React client. One opinionated consumer. | The repo owner. Never published. |

The API is treated as a versioned public contract under `/api/v1/`. The dashboard
calls the **same** endpoints any third-party tool would call. There is no private
channel.

## 2. Repo navigation

```
x4-companion/
├── AGENTS.md                              ← this file
├── README.md                              ← user-facing quickstart
├── pyproject.toml                         ← uv workspace root
├── docs/
│   ├── architecture.md                    ← pointer to the build plan
│   ├── data-tiers.md                      ← V1 MUST / NICE / SKIP
│   └── openapi.yaml                       ← generated public contract
├── packages/
│   ├── x4-api/
│   │   ├── src/x4_api/{config,cli,api,db,extract,savefile,ingest,domain}/
│   │   └── tests/
│   └── x4-dashboard/
│       └── src/{routes,components,lib}/
└── scripts/                               ← PowerShell utilities
```

## 3. Dev environment

```powershell
# Python — uv handles venv + deps automatically
uv sync                                    # installs everything in the workspace
uv run pytest                              # run tests
uv run ruff check                          # lint
uv run mypy                                # type-check
uv run x4c doctor                          # verify env

# Frontend — pnpm preferred (npm/yarn also work)
cd packages/x4-dashboard
pnpm install
pnpm dev                                   # vite on :5173
```

Required env vars (see `.env.example`): `X4C_INSTALL_PATH` and `X4C_SAVE_PATH`.
The dev's actual save path is non-default (`C:\Users\colto\sss\Documents\Egosoft\X4\59308344`);
**never** assume the Egosoft default in code — always resolve via `config.resolve_save_path`.

## 4. Code standards

### 4.1 Python

- **Target: Python 3.12.** Use modern syntax (`X | None`, `from __future__ import annotations`
  in every module, `match` where it reads cleanly, `dataclass(slots=True, frozen=True)` for
  value objects).
- **Type hints everywhere.** mypy runs in strict mode. No `Any` without a comment explaining why.
- **Pydantic for boundaries.** Settings, HTTP request/response models, and other
  serialization boundaries use Pydantic v2. Pure internal data is dataclasses.
- **Pure functions where possible.** Extractors (`extract()`) take bytes and return data.
  Writes (`write()`) take a connection and data. Glue lives in `ingest/`.
- **Imports sorted** by `ruff` (isort rules). Local imports go through fully-qualified paths:
  `from x4_api.db.connection import open_db`, not relative imports.
- **No print statements.** Use `typer.echo` in CLI handlers, structured logging elsewhere
  (when we add a logger module — not yet).
- **Line length 100.** ruff handles it.
- **Docstrings**: module-level docstring explaining WHY the module exists and any
  non-obvious patterns. Function docstrings only when behavior is non-obvious from
  the signature.
- **No trailing comments narrating the code.** If a comment is required, it explains *why*
  (a constraint, an invariant, a subtle bug), never *what*.

### 4.2 TypeScript / React

- **TypeScript strict mode** (already set in `tsconfig.json`).
- **Functional components only.** No class components.
- **TanStack Query for all server state.** Never `useEffect` + `fetch`.
- **TanStack Router for navigation.**
- **API client is GENERATED** from `docs/openapi.yaml`. Do not hand-edit `src/lib/apiClient.ts`.
- **CSS-in-JS not adopted.** Inline `style={}` is fine for v1; revisit when complexity
  warrants a styling layer.

### 4.3 SQL

- Schema lives in `.sql` files under `packages/x4-api/src/x4_api/db/`. The Python
  code applies them via `apply_schema()`.
- Use `IF NOT EXISTS` for idempotency.
- Indexes are explicit. The route-ranking covering index is the most important:
  `idx_offers_ware_side_price` includes `(station_id, quantity)` so SQLite never visits the table.
- Cross-database joins reference `s.<table>` (the ATTACH alias for static.db).
- Natural string keys throughout — surrogate ints would force re-keying every save.

## 5. Adding new code — walkthroughs

### 5.1 New static extractor (e.g. `factions.xml` → `factions` table)

Copy the shape of `packages/x4-api/src/x4_api/extract/wares.py`:

```python
# packages/x4-api/src/x4_api/extract/factions.py
from __future__ import annotations
import sqlite3
from dataclasses import dataclass, field
from typing import Any
from lxml import etree

@dataclass(slots=True)
class ExtractResult:
    factions: list[dict[str, Any]] = field(default_factory=list)

def extract(xml_bytes: bytes) -> ExtractResult:
    root = etree.fromstring(xml_bytes)
    out = ExtractResult()
    for f in root.iterfind("faction"):
        out.factions.append({
            "faction_id": f.get("id"),
            "name": f.get("name", f.get("id")),
            "color_hex": _color(f),
            "capital_sector": f.findtext("capital/sector"),
            "primary_race": f.get("primaryrace"),
        })
    return out

def write(conn: sqlite3.Connection, result: ExtractResult) -> None:
    conn.execute("DELETE FROM factions")
    conn.executemany(
        "INSERT INTO factions (faction_id, name, color_hex, capital_sector, primary_race) "
        "VALUES (:faction_id, :name, :color_hex, :capital_sector, :primary_race)",
        result.factions,
    )

def _color(f) -> str | None:
    el = f.find("color")
    return el.get("hex") if el is not None else None
```

Then a test that mirrors `tests/test_extract_wares.py`: hand-crafted XML, assert on
`extract()`, separately verify `write()` round-trips through SQLite.

The orchestrator in `ingest/static_pipeline.py` calls them — every static extractor
follows the same pattern, so the orchestrator stays mechanical.

### 5.2 New save-state visitor (e.g. station offers)

Copy `packages/x4-api/src/x4_api/savefile/extractors/meta.py`:

```python
# packages/x4-api/src/x4_api/savefile/extractors/stations.py
from __future__ import annotations
import sqlite3
from dataclasses import dataclass, field
from lxml import etree
from x4_api.savefile.dispatch import Registration, Target

@dataclass(slots=True)
class StationRow:
    station_id: str
    name: str | None
    owner_faction: str | None
    sector_id: str | None
    # ...

@dataclass(slots=True)
class StationCollector:
    rows: list[StationRow] = field(default_factory=list)

    def register(self) -> list[Registration]:
        # Stations are <component class="station"> nested under universe → cluster → sector
        return [Registration(
            target=Target(depth=5, tag="component", class_attr="station", parent_tag="sector"),
            visitor=self._on_station,
        )]

    def _on_station(self, elem: etree._Element) -> None:
        self.rows.append(StationRow(
            station_id=elem.get("id"),
            name=elem.get("name"),
            owner_faction=elem.get("owner"),
            sector_id=_find_sector_id_from_parents(elem),
        ))

    def flush(self, conn: sqlite3.Connection) -> None:
        conn.executemany(
            "INSERT OR REPLACE INTO stations (station_id, name, owner_faction, sector_id) "
            "VALUES (:station_id, :name, :owner_faction, :sector_id)",
            [vars(r) for r in self.rows],
        )
```

**Critical: the depth+class match must be exact.** Don't filter `<component>` alone —
X4 nests components recursively and you'll over-fire. Verify your `Target` against a
small fixture save in `tests/`.

The orchestrator in `ingest/dynamic_pipeline.py` builds a list of all collectors,
calls `stream_save(path, [r for c in collectors for r in c.register()])`, then
calls `c.flush(conn)` for each. One streaming pass, many visitors.

### 5.3 New REST endpoint (e.g. `/api/v1/factions`)

Copy `packages/x4-api/src/x4_api/api/v1/wares.py`:

```python
# packages/x4-api/src/x4_api/api/v1/factions.py
from __future__ import annotations
import sqlite3
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from x4_api.api.deps import get_db
from x4_api.api.schemas import PublicModel

router = APIRouter()

class FactionSummary(PublicModel):
    faction_id: str
    name: str
    color_hex: str | None

class FactionDetail(FactionSummary):
    capital_sector: str | None
    primary_race: str | None

@router.get("/factions", response_model=list[FactionSummary])
def list_factions(conn: Annotated[sqlite3.Connection, Depends(get_db)]) -> list[FactionSummary]:
    rows = conn.execute(
        "SELECT faction_id, name, color_hex FROM s.factions ORDER BY faction_id"
    ).fetchall()
    return [FactionSummary(**dict(r)) for r in rows]

@router.get("/factions/{faction_id}", response_model=FactionDetail)
def get_faction(
    faction_id: str,
    conn: Annotated[sqlite3.Connection, Depends(get_db)],
) -> FactionDetail:
    row = conn.execute(
        "SELECT * FROM s.factions WHERE faction_id = :id", {"id": faction_id}
    ).fetchone()
    if row is None:
        raise HTTPException(404, f"Unknown faction_id: {faction_id}")
    return FactionDetail(**dict(row))
```

Then **register it** in `packages/x4-api/src/x4_api/api/app.py`:

```python
from x4_api.api.v1 import factions  # add
fast.include_router(factions.router, prefix="/api/v1", tags=["factions"])
```

After adding endpoints, regenerate the OpenAPI schema:

```powershell
uv run x4c serve            # one shell
Invoke-WebRequest http://127.0.0.1:8765/api/openapi.json | `
  ConvertFrom-Json | ConvertTo-Yaml | Set-Content docs/openapi.yaml
```

Commit `docs/openapi.yaml` alongside the code change. PRs that change endpoints
without regenerating the schema will be rejected.

### 5.4 New dashboard page

```tsx
// packages/x4-dashboard/src/routes/factions.tsx
import { useQuery } from "@tanstack/react-query";

type FactionSummary = {
  faction_id: string;
  name: string;
  color_hex: string | null;
};

export default function FactionsPage() {
  const { data } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });
  return (
    <ul>
      {data?.map((f) => (
        <li key={f.faction_id}>
          <span style={{ color: f.color_hex ?? "inherit" }}>{f.name}</span>
        </li>
      ))}
    </ul>
  );
}
```

Pages are always pure presentation + query hooks; computed economy logic stays in
the API.

## 6. Testing

- **Framework**: pytest with `asyncio_mode = "auto"` (configured in root `pyproject.toml`).
- **All tests run from repo root**: `uv run pytest`.
- **Layout**: tests mirror source (`tests/test_extract_wares.py` covers `extract/wares.py`).
- **Fixtures** in `packages/x4-api/tests/fixtures/` — tiny hand-crafted XML.
  No real game files, no real saves committed.
- **Coverage targets** (informal):
  - 100% on `extract/*.py` pure functions
  - Smoke test per endpoint (happy path + 404)
  - Performance test for routes query: `tests/test_routes_query_perf.py` asserts <2 s
    on a synthetic 500-station fixture
- **Golden-file regression**: snapshot extractor output against real game data; gate
  behind `@pytest.mark.golden` so CI doesn't require the game files. Regenerate after
  each X4 patch.

Run before declaring done:

```powershell
uv run pytest
uv run ruff check
uv run mypy
```

If any of those fail, fix root cause — don't suppress, don't `# type: ignore`,
don't `# noqa` without a reason in a comment.

## 7. API contract rules

The API is treated as a published library. These rules are non-negotiable:

1. **All URLs are versioned**: `/api/v1/...`. A breaking change requires a new path
   (`/api/v2/`) and supporting both during a deprecation window.
2. **Response models inherit from `PublicModel`**: `frozen=True`, `extra="forbid"`,
   explicit types on every field. Catches accidental schema drift.
3. **No "internal" endpoints.** If the dashboard needs something, expose it cleanly
   so third parties can use it too.
4. **OpenAPI schema is the contract.** `docs/openapi.yaml` is regenerated on every
   endpoint change and committed.
5. **List endpoints return `[]` on empty, never 404.** 404 is reserved for unknown
   resource IDs in detail endpoints.
6. **Pagination**: `limit` (1..2000, default 500) + `offset` (≥0, default 0).
   Use these names consistently.
7. **Error responses**: FastAPI's default `{"detail": "..."}` — don't customize the
   envelope.

## 8. Common pitfalls

These are real traps. Read before working on the relevant area.

### iterparse + nested `<component>` (savefile/)

`iterparse(tag="component")` filters tag names at every depth. X4 saves nest
`<component>` recursively under `<universe>` → `<cluster>` → `<sector>` → `<zone>` →
`<station>`. Filtering by tag alone over-fires, and lxml accumulates the entire
subtree before firing the outer `end` event — RSS spikes to 1–2 GB on a real save.

**Fix**: use `savefile.dispatch.Target` with `depth=` and `parent_tag=` matching.
The exemplar `meta.py` shows the pattern. Never call `iterparse` directly in a
visitor.

### 31M-row self-join on `station_offers`

A naive `station_offers JOIN station_offers ON ware_id` query produces ~31M pairs
across all wares before SQLite can prune. The route-ranking query is split between
**save-load materialization** (`ingest/materialize.py`) and **per-request scoring**
in Python (`domain/routes.py`). Don't try to compute everything in one big query.

### gzip streams aren't seekable

You cannot random-access a `.xml.gz` save file. Don't try to "jump to" a section —
stream the whole file every poll. If you ever need partial reloads, convert to
bgzip first (out of scope for v1).

### DLC overlay merging

`wares.xml` (and many other library XMLs) ship in DLC and workshop packages as
**diffs** against the base, using Egosoft's `<diff>` element with `add`/`remove`/
`replace` operations targeted by XPath. Extractors operate on **merged** XML;
the merging lives in `extract/diff_merge.py` (to be vendored from
`bno1/X4FProjector`). Don't reimplement diff logic in your extractor.

### Save folder defaults are wrong

The dev's actual save folder is `C:\Users\colto\sss\Documents\Egosoft\X4\59308344\save`
— not the Egosoft default. Always resolve via `config.resolve_save_path`. Never
hard-code a Documents path.

### DDS textures aren't browser-renderable

Icons are DirectX texture format. Browsers can't render them. The `extract/icons.py`
pipeline converts DDS → PNG once per content_hash. Don't try to serve DDS bytes
directly.

## 9. Definition of done (per milestone)

From the build plan, mapped to verifiable checks:

| Milestone | Done means |
|---|---|
| M0 Skeleton | `uv run x4c doctor` returns 0; `/api/v1/health` returns OK; `pytest` green; CI scaffold runs |
| M1 Static extraction | `uv run x4c rebuild-static` produces `static.db` with ~500 wares + modules + ships + factions + map; second run is no-op in <1s |
| M1.5 Icons | `uv run x4c rebuild-icons` produces ~990 PNGs; `GET /api/v1/wares/energycells` includes a working `icon_url` |
| M2 Save streaming | `uv run x4c ingest-save` on a 200 MB+ save completes in <60s, peak RSS <500 MB |
| M3 API + routes | `/api/v1/routes?ship_cargo=8000&ship_speed=420` returns ≤50 ranked routes in <2 s wall-clock |
| M4 Dashboard | Opening `localhost:8765` shows live routes/stations/chains; updates after a save tick |
| M5 Poller | Dashboard works for a full play session unattended |

Don't mark a milestone done until the verification command actually runs against
real data, not just synthetic fixtures.

## 10. Commit / PR conventions

- **Branch names**: `feat/<short>`, `fix/<short>`, `refactor/<short>`, `docs/<short>`.
- **Commit subject ≤72 chars**, imperative mood: `feat: extract factions.xml into static.db`.
- **PR titles** the same. Body explains *why*, not what (the diff shows what).
- **Tag PRs** with `[api]` or `[dashboard]` in the title so a future repo split is mechanical.
- **One concern per PR.** If you're tempted to add "while I'm here" cleanup, that's
  a separate PR.
- **Never bypass hooks** (`--no-verify`) unless explicitly authorized — fix the
  underlying issue.

## 11. AI assistant guidance

If you are an AI assistant working on this repo:

- Read this file and `docs/data-tiers.md` first.
- Read the four exemplar files before writing similar code.
- Use the exact patterns shown — consistency across the repo is more valuable than
  any individual cleverness.
- **Do not refactor exemplars** without explicit human direction.
- **Do not add features beyond the requested scope.** No "while we're here" changes.
- If you encounter a decision the standards don't cover, pick the simpler option
  and surface the choice in the PR description.
- If a test fails, fix the root cause — never delete or skip the test.
- If type-checking fails, fix the types — never `# type: ignore` without a
  one-line reason.
- The plan file at `C:\Users\colto\.claude\plans\binary-seeking-nebula.md` is the
  authority on architecture decisions. Don't second-guess it without raising the
  question.

When implementing a new module:

1. Look at the relevant exemplar.
2. Write the module + test in one go; they ship together.
3. Run `uv run pytest <new test>`, `uv run ruff check`, `uv run mypy`.
4. If you added a public endpoint, regenerate `docs/openapi.yaml`.
5. Stop. Ask the human if anything is unclear; do not silently make architectural
   decisions.
