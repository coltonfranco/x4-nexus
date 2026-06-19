# Save refresh lifecycle

How the live save layer decides **when to pull a timestamp, when to diff content, and when
to rebuild the per-save dynamic DB** — plus every trigger that drives those decisions and how
often it fires.

Scope: the dynamic (save-state) pipeline only. Static extraction (`static.db`) is covered in
[`data-tiers.md`](data-tiers.md); the save XML layout is in [`save-structure.md`](save-structure.md).

> **Why this matters:** the whole design exists to (a) keep the dashboard live without
> re-parsing a 200 MB save on every tick, and (b) **never open a save file X4 is mid-write** —
> on Windows that blocks X4's own write and surfaces in-game as "save failed".

---

## 1. The cost ladder

Every freshness check tries the cheapest rung that can answer "did this change?" and only
falls to the next when it can't.

| Rung | What it does | Opens save file? | Cost |
|------|--------------|------------------|------|
| **0. glob + stat folder** | `sorted(folder.glob("*.xml.gz"), key=mtime)` — pulls mtime of *every* save | No | ~µs |
| **1. stat candidate** | `(st_mtime_ns, st_size)` of one save vs. stored value | No | ~µs |
| **2. source fingerprint** | open file, hash `size + 64 KiB head + 64 KiB tail` (`pipeline.source_fingerprint`) | **Yes** (128 KiB) | ~ms |
| **3. full stream parse** | decompress the whole `.gz`, run all collectors (`pipeline.run`) | **Yes** (entire file) | seconds |
| **3b. per-tier fingerprint** | hash already-parsed rows per tier, decide which tables to rewrite | (in-memory) | cheap vs. rung 3 |

**Key property:** gzip isn't seekable, so **rung 3 is all-or-nothing** — once you decide to
parse, you parse the whole file. Rung 3b only decides how much DB *writing* follows, not the
parse cost. Following the newest save therefore costs the same per tick as pinning one.

---

## 2. Timestamps & identities that get stored

Per-save DB `ingest_state` table (one row per `tier`):

| `tier` key | Meaning | Rung that writes it |
|------------|---------|---------------------|
| `source_mtime`, `source_size` | last-ingested file stat — the rung-1 identity | 3 |
| `source` | last-ingested 128 KiB content fingerprint — the rung-2 identity | 3 |
| `structural`, `volatile` | per-tier content hashes of the ingested rows | 3b |
| `pipeline_version` | the `_PIPELINE_VERSION` the DB was built under | 3 |
| `ingest_ms` | wall-clock cost of the last parse (perf signal) | 3 |
| (`ingested_at` column) | per-row wall-clock of last write | 3 |

Other timestamps, stored elsewhere:

- `save_meta.parsed_at` — drives `/health` `save_age_sec`.
- Header fields (`in_game_time`, `real_time`, player credits) — cosmetic, cached in
  `catalog.db` keyed by `(path, mtime, size)`; read by streaming only up to `</info>`.

---

## 3. `pipeline.run` — the only place a rebuild can happen

`packages/x4-extract/src/x4_extract/dynamic/pipeline.py`

```
stat the file                                        ← rung 1 (timestamp pull)
A) if not force and version_ok and stat matches          → RETURN (no-op, never opens the file)
source_fingerprint(file)                             ← rung 2 (opens file, 128 KiB)
B) if not force and version_ok and fingerprint same      → re-stamp stat, RETURN (no parse)
── full stream parse ──                              ← rung 3
for tier in (STRUCTURAL, VOLATILE):
   C) if version_ok and tier fingerprint same            → skip (keep existing rows)
      else DELETE+rewrite tier, rebuild derived, compute delta events   ← rung 3b
re-stamp source + stat + pipeline_version + ingest_ms
```

### When a FULL PARSE (rung 3) happens — iff:

- `force=True`, **or**
- `pipeline_version` changed (`version_ok` False) — forces a parse of whatever save is opened
  **even if stat and fingerprint match** (so a `_PIPELINE_VERSION` bump re-ingests every save
  on next open), **or**
- stat moved **and** the 128 KiB fingerprint differs.

If stat moved but the fingerprint is **identical** (copy / restore / `touch`), gate **B**
re-stamps the stat and returns — **no parse**.

> **Dead path:** after dropping `force=True` from `activate`, **nothing passes `force`
> anymore**. The `force` parameter and its docstring mention are currently unused — clean up
> if touching this code.

### Per-tier rewrite (rung 3b)

`TIERS = (STRUCTURAL, VOLATILE)` (`dynamic/collector.py`). Inside a parse, a tier's tables are
DELETE+rewritten **only if that tier's combined content hash changed**:

- **VOLATILE** (ships, economy/offers, player, missions, relations) changes nearly every save →
  rewritten + delta events emitted → derived `compute_top_routes`.
- **STRUCTURAL** (sector/station layout, distances) rarely changes → usually skipped → derived
  `build_sector_distance` only when it did change.

So a parse can rewrite **0, 1, or 2** tiers. Delta/event computation runs **only for tiers that
changed**, so an idle re-ingest does no delta work. A parse that rewrites 0 tiers still happens
in full (you had to stream the file to learn the tiers were unchanged); it just re-stamps the
source/stat rows.

---

## 4. Triggers & frequency

### 4a. Background refresher thread (one per API process)

`packages/x4-api/src/x4_api/api/refresher.py` → `poller.watch_realtime`

| Trigger | Frequency | Ladder reached |
|---------|-----------|----------------|
| **Startup ingest** | once at server boot | rung-1 quiescence → `db_is_current` → `pipeline.run` (full parse if newest changed since last run) |
| **Watchdog FS event** | every write to any `*.xml.gz` — *fires repeatedly during one save* as X4 streams it | `wake` → `poll_once(min_quiet_sec=save_settle_sec)`. While mtime is fresh → **deferred at rung 1, no open** |
| **Deferred re-check** | `save_settle_sec` (2.5s) after a deferred tick | re-poll; proceeds past rung 1 once the file is quiet ≥ settle |
| **Backstop poll** | every `interval_sec` (default 60s from `poll_interval_sec`; runtime-tunable via `PUT /refresh-config`, floor 5s; **can be disabled** → watchdog-only) | catches a missed FS event |

`save_settle_sec` (the quiet window a changed save must hold before we open it) is what
prevents a parse from colliding with X4's write.

### 4b. Every API request (`get_db` dependency, all dynamic endpoints)

`resolve_serving_save` runs on **every request**: rung 0 (glob+stat) + rung 1
(`_db_matches_stat`) + possibly `_db_has_data` (which opens the *dynamic DB*, never the save
file). It **selects** which already-built DB to serve — it never opens a save, never diffs
content, never rebuilds.

### 4c. Client polls

| Endpoint | Interval | What it touches |
|----------|----------|-----------------|
| `/refresh-status` | **7s** (one query deduped across `useBackgroundRefresh`, `SaveSelector`, `useHasSave`) | `resolve_serving_save` (rung 0/1) + reads `events`/`ingest_state`. No save open. |
| `/saves` | **30s** (`SaveSelector`) | `list_saves`: rung 0 + per file — **quiescent** files get rung 2 currency + header read *on catalog cache-miss*; **non-quiescent** files get rung 1 only |
| `/health` | on mount/refocus, **no interval** (`routes/index.tsx`) | `save_meta.parsed_at` |

The only routine path that can open a save file is `/saves` every 30s, and only for a
**settled** file whose `(path, mtime, size)` catalog cache is stale. Non-quiescent (mid-write)
files are never opened — this is the guard that stopped in-game "save failed".

### 4d. User actions (one-shot)

| Action | Calls | Result |
|--------|-------|--------|
| Pick a specific save (pin) | `POST /saves/{key}/activate` → `pipeline.run` (no force) | full parse if that save is unbuilt/changed; near-instant if already current |
| "Latest (auto)" | `POST /saves/follow-latest` → clear pin → `pipeline.run` (no force) on newest | same ladder |
| Refresh button | re-invokes activate(current) or follow-latest | rung-1 no-op when unchanged; full parse only if content/version changed |

---

## 5. Which save the API serves (`resolve_serving_save`)

`dynamic/catalog.py`. Independent of *building* DBs — this only chooses which already-built DB
each request reads:

1. **Pinned** key (if set) → that save (its DB was built on activation).
2. Else the newest save whose DB is **current** (stat matches), within `serve_fallback_window_sec`
   of the newest file — handles autosave/quicksave rotation without flashing a stale slot.
3. Else (cold start / long gap) the most recent save with **any** ingested data (`_db_has_data`)
   — "stale-then-update" rather than blanking the dashboard; it advances in place once the
   newest save's DB becomes current.
4. Else `None` → the shared `_empty.db` (static-only endpoints still work).

`active_key` (in `/refresh-status`) tracks whichever save step 1–3 picked, so when serving
advances the client does one clean full refresh.

---

## 6. Steady-state summary

- **Game paused / idle:** the system sits entirely on rungs 0–1 — pure `stat()`, no file
  opens, no parses.
- **One real save write:** exactly **one** rung-3 parse, after the `save_settle_sec` settle,
  rewriting only the tiers that actually changed.
- **`_PIPELINE_VERSION` bump:** forces a one-time full re-parse of each save the next time it's
  opened, regardless of stat/fingerprint. Bump `_PIPELINE_VERSION` (`dynamic/pipeline.py`)
  whenever the collector set or dynamic schema changes, so already-ingested saves pick up new
  tables/columns instead of being skipped on stat.
