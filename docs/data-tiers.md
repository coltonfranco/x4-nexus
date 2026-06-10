# Data tiers

Authoritative inventory of game XML files and what `x4-api` exposes.

> **Note:** We have pivoted to an ELT (Extract-Load-Transform) pipeline to ensure we never leave useful metadata behind. The old "V1 MUST / V1 NICE" strict tiers are deprecated.

## The ELT Architecture

Static data extraction is split into two distinct layers.

### Layer 1: Raw Extraction (The "Data Lake")
We extract all non-binary metadata from the game files, applying DLC patches, and dumping the raw XML strings into a single SQLite table: `raw.db (raw_files)`.

**Command:** `uv run x4c rebuild-datalake`

We deliberately extract:
- `t/` (Language Localizations)
- `assets/` (Physical component macros, engines, shields, weapons)
- `libraries/` (Wares, modules, map defaults, equipment configs)
- `maps/` (Clusters, Sectors, Zones, Gates)
- `index/` (The master macro index)

We deliberately **exclude** (to save space and because they lack UI value):
- `aiscripts/` (AI behavior trees)
- `md/` (Mission Director scripts)
- `cutscenes/` (Camera scripts)
- `fx/` and `ui/`

### Layer 2: Transformation (The "Data Warehouse")
Transformation scripts query `raw.db`, traverse the deep nested macro hierarchies (e.g., Ship Macro -> Connections -> Shield Slot Macros), and populate the structured schema in `static.db`.

This ensures that rich, component-level metadata (like hitpoints, thruster pitch/yaw, shield regen, and equipment connections) is fully parsed without needing to read the `.cat` archives ever again.
