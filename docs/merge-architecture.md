# X4 Foundations: XML merge architecture & pipeline load order

> **Audience**: Anyone modifying or debugging the extraction pipeline (`crawler.py`,
> `pipeline.py`, individual extractors). Understanding X4's actual merge model
> is essential to avoid data loss, duplicates, and UNIQUE-constraint crashes.

---

## 1. The game's runtime load order

X4 loads game data from numbered `.cat`/`.dat` archive pairs in a strict order.
Later archives override or patch earlier ones at the same virtual path. The order
is:

```
01.cat   ─┐
02.cat    │  Base game archives (patches have higher numbers;
03.cat    │  e.g. 07/08/09 are likely update cats)
04.cat    │
...       │   "Last cat wins" for identical paths within this group
09.cat   ─┘
             │
             ▼
extensions/
  ego_dlc_boron/
    ext_01.cat  ─┐   DLC patches have their own sequence;
    ext_02.cat   │   later cats within the same DLC override earlier.
    ext_03.cat  ─┘
             │
  ego_dlc_pirate/
    ext_01.cat  ─┐
    ext_02.cat   │   Sorted alphabetically by extension folder name,
    ext_03.cat  ─┘   then by numeric order within each DLC.
             │
  ego_dlc_split/
    ext_01.cat ─┐
    ext_02.cat  │
    ext_03.cat ─┘
             │
  ego_dlc_terran/
    ext_01.cat ─┐
    ext_02.cat  │
    ext_03.cat ─┘
             │
  ego_dlc_timelines/  ...
             │
  ego_dlc_mini_01/    ...
             │
  ego_dlc_mini_02/    ...
             │
             ▼
extensions/
  ws_*/        Workshop mods (not yet supported)
    ext_01.cat ...
```

**Key invariant**: The load order is **deterministic** — base cats sorted
by numeric prefix, DLC cats sorted alphabetically by folder name, then by
ext number within each DLC. The same archive set always produces the same
merged XMLs.

---

## 2. How merging works at each step

There are **three** distinct merge mechanisms with different semantics:

### 2.1 Base game: "last cat wins" (full file replacement)

Within the base game cats, if the **same path** appears in 03.cat and 07.cat,
the 07.cat entry entirely replaces the 03.cat entry. This is how Egosoft ships
game patches: the update cat ships a complete copy of the changed XML file.

> **Implementation**: `crawler.py` Phase 1 builds a `base_entries: dict[str, CatEntry]`
> and iterates cats in sorted order, overwriting previous entries for the same path.
> Effectively a last-wins map.

### 2.2 DLC loading: two sub-modes

When a DLC archive contains a file at a path that **already exists** in the
base game (or was added by an earlier DLC), X4 checks whether the file starts with `<diff`:

#### 2.2a `<diff>` patches (RFC 5261-based)

A `<diff>` document contains `<add>`, `<replace>`, `<remove>` elements targeting
nodes by XPath `sel` attribute. This is the standard XML patch format described in
[RFC 5261](https://datatracker.ietf.org/doc/html/rfc5261) with X4-specific extensions.

```xml
<?xml version="1.0" encoding="utf-8"?>
<diff>
  <add sel="root/bar"><foo a="3"/></add>
  <replace sel="root/bar/foo[@a='1']/@a">3</replace>
  <remove sel="root/bar/foo[@a='1']"/>
</diff>
```

Patch operations:
- **`<add>`**: Insert child elements at the target. Supports `pos` (append, prepend,
  before, after) and `type="@attr"` for attribute additions.
- **`<replace>`**: Replace the targeted element/attribute/text node with new content.
- **`<remove>`**: Remove the targeted node. Has `ws` for whitespace control.

> **Implementation**: `crawler.py` → `_apply_diff()` uses lxml XPath to evaluate `sel`
> and applies operations in document order.

#### 2.2b Non-`<diff>` merge (additive root-children merge)

When a DLC contains a **full XML file** (no `<diff>` header) at an existing path,
X4 **appends all root-level child elements** of the DLC file to the base root.
This is confirmed by Egosoft modding documentation:

> *"note that it only works directly under the root node, in any other case you
> have to use diffs"* — UniTrader, Egosoft moderator

```xml
<!-- Base (libraries/factions.xml) -->
<factions>
  <faction id="argon" name="Argon Federation">
    <relations><relation faction="antigone" relation="0.8"/></relations>
  </faction>
</factions>

<!-- DLC file (full XML, no <diff>) -->
<factions>
  <faction id="terran" name="Terran Protectorate">...</faction>
  <faction id="argon" name="Argon Federation">   ← base entry re-included!
    <relations>
      <relation faction="antigone" relation="0.8"/>
      <relation faction="terran" relation="0.4"/>
    </relations>
  </faction>
</factions>

<!-- Merged result -->
<factions>
  <faction id="argon">...</faction>    ← from base
  <faction id="terran">...</faction>   ← from DLC (new)
  <faction id="argon">...</faction>    ← from DLC (DUPLICATE!)
</factions>
```

> **⚠ This is the root cause of the duplication problem.** The DLC ships a complete
> file including base entries alongside new ones. The additive merge appends
> **everything** under the DLC root — including the duplicates.

> **Implementation**: `crawler.py` → `_merge_additive()` parses both base and DLC XML,
> deep-copies DLC root children, and appends them to the base root. No deduplication.

### 2.3 New DLC paths (first-seen)

If a DLC introduces a file at a path never seen before (neither in base cats nor
in any earlier DLC), it is stored as-is. No merging needed.

---

## 3. Why DLC duplication happens (the specific problem)

A DLC that ships a full `factions.xml` (non-`<diff>`) typically needs to:

1. Add its own new factions (e.g., `terran`)
2. Add relations involving its new factions to existing factions
3. Update existing factions' relations to include the new ones

The most expedient way for Egosoft to ship this is to include a complete
`factions.xml` in the DLC that contains **both** the base entries (extended
with new relations) **and** the new entries. The merge produces duplicates of
every faction that appears in both base and DLC.

This is **not a bug in X4's runtime** — the game handles duplicates by
last-value-wins in most internal tables. It is a bug in the extraction pipeline's
assumption that merged XMLs are set-wise unique.

---

## 4. Current crawler implementation (crawler.py)

```
Phase 1: Build base_entries dict (last-wins per path)
  for each base cat (sorted numerically):
    for each XML entry:
      if not excluded dir:
        base_entries[path] = entry   // overwrites earlier

Phase 2: Apply DLC patches/merges (in DLC load order)
  resolved: dict[str, bytes] = {}
  for each DLC cat (sorted):
    for each XML entry:
      dlc_bytes = read_entry(entry)
      if path is brand new:
        resolved[path] = dlc_bytes
      elif dlc_bytes starts with "<diff":
        resolved[path] = _apply_diff(existing, dlc_bytes)
      else:
        resolved[path] = _merge_additive(existing, dlc_bytes)

Phase 3: Write raw.db
  for each path (base + new DLC):
    if resolved: write resolved bytes (patched/merged)
    else: write base entry bytes (unmodified)
```

Key implementation details:
- **`_is_diff()`**: checks for `b"<diff"` anywhere in bytes. Reliable heuristic.
- **`_apply_diff()`**: mutates base_root in place per operation.
- **`_merge_additive()`**: deep-copies and appends. No dedup.
- **Excluded dirs**: `aiscripts`, `md`, `cutscenes`, `fx`, `ui`.

---

## 5. Mitigation strategies for the duplication problem

### 5.1 Current approach: per-extractor INSERT OR IGNORE (band-aid)

Since we cannot tell at the XML merge layer whether a duplicate root child is
"intentional", the safest fix is to make extractors tolerant of duplicates:

| SQL | When to use |
|---|---|
| `INSERT OR IGNORE` | First-occurrence semantics. Base entry authoritative. |
| `INSERT OR REPLACE` | Last-occurrence semantics. DLC version may be more complete. |

**Already applied:**
- `factions.write()` — `INSERT OR IGNORE INTO factions`
- `factions.write()` — `INSERT OR IGNORE INTO faction_licences`

For **relations**, `INSERT OR IGNORE` is correct because:
- The DLC duplicate of a base faction has a superset of the same relations
- Ignoring the duplicate preserves the base relations (correct as-is)
- The DLC-unique relations come from the DLC's **new** faction entries,
  not from the duplicate base entry

### 5.2 Robust layer: deduplicate at the XML level (proactive)

A smarter `_merge_additive()` could detect duplicate top-level elements by
checking if a DLC root child's `id` attribute already exists. However, this
would **lose data** — the DLC duplicate may carry **additional relations, tags,
or DLC-specific licences** that the base entry lacks.

**Correct XML-layer approach**: Instead of skipping the DLC child entirely,
merge its sub-elements into the existing base child (e.g., add new `<relation>`
children that don't exist in the base entry). This is complex to get right
generically (different XML schemas use different key attributes), so the
per-extractor approach is the pragmatic choice for V1.

### 5.3 What NOT to do

- **Don't skip the non-diff merge entirely** — DLCs adding new factions,
  wares, ships, etc. would lose all their content.
- **Don't reorder the DLC cats** — load order is fixed by the game and
  determines which DLC wins in a conflict.
- **Don't suppress merging for specific paths** — the same path may use `<diff>`
  in one DLC and additive merge in another.

---

## 6. Workshop / mod merging (not yet implemented)

Workshop mods (`extensions/ws_*/ext_*.cat`) load **after** all official DLCs.
They follow the same two sub-modes (`<diff>` vs. additive merge) but can also
introduce entirely new virtual paths.

When workshop support is added, it must:
1. Process workshop cats **after** DLC cats (highest priority)
2. Apply `<diff>` patches and additive merges using the same logic
3. Support `content.xml`-based extension ordering (dependencies/replacements)

---

## 7. Files at risk from additive-merge duplication

| Library file | Duplicate risk | Protection needed |
|---|---|---|
| `libraries/factions.xml` | High (terran DLC includes all factions) | `INSERT OR IGNORE` |
| `libraries/wares.xml` | High (DLCs add wares) | `INSERT OR IGNORE` |
| `libraries/waregroups.xml` | Medium | `INSERT OR IGNORE` |
| `libraries/drops.xml` | Medium | `INSERT OR IGNORE` |
| `libraries/equipmentmods.xml` | Medium | `INSERT OR IGNORE` |
| `libraries/loadouts.xml` | Medium | `INSERT OR IGNORE` |
| `libraries/region_definitions.xml` | Low | `INSERT OR IGNORE` |
| `libraries/diplomacy.xml` | Medium | `INSERT OR IGNORE` |
| `libraries/terraforming.xml` | Low | `INSERT OR IGNORE` |
| `libraries/god.xml` | Low (unique station ids) | `INSERT OR IGNORE` |
| `libraries/colors.xml` | Low | `INSERT OR IGNORE` |
| `index/macros.xml` | Medium | `INSERT OR IGNORE` |
| `assets/**/*.xml` (individual) | None (per-file `<diff>`) | N/A |

---

## 8. References

- **Egosoft XML Patch Guide**: https://forum.egosoft.com/viewtopic.php?t=354310
  — community tutorial covering `<diff>` operations with examples.
- **RFC 5261**: https://datatracker.ietf.org/doc/html/rfc5261 — IETF standard
  for XML patch operations that X4's diff format is based on.
- **X4F Projector (bno1)**: https://github.com/bno1/X4FProjector — reference
  implementation of X4's XML merging logic.
- **Current implementation**: `packages/x4-extract/src/x4_extract/static/crawler.py`
  — the datalake crawler implementing the merge pipeline.
- **DLC duplication diagnosis**: `docs/dlc-duplication.md` — original discovery
  document for the duplicate-relation problem.
