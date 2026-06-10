-- Gamestart SEED: the universe instance snapshot at t=0. Distinct from static.db
-- (patch-scoped reference definitions) and dynamic/<key>.db (live save state).
--
-- The save supersedes everything here: once a save is loaded it is the source of truth
-- for stations, relations, and ownership. The seed is the backing store for the
-- "gamestart source" (the synthetic save) and the fallback when no save is active.
-- Rebuilt alongside static.db on game patch. See docs/data-sources.md.

-- NPC station instances placed in the universe at game start (from god.xml <stations>).
-- location macros follow god.xml casing (lowercase), e.g. "cluster_14_sector001_macro".
CREATE TABLE IF NOT EXISTS npc_stations (
    station_id       TEXT PRIMARY KEY,
    owner_faction    TEXT,
    race             TEXT,
    tags             TEXT,          -- JSON array e.g. '["shipyard"]', '["wharf"]'
    location_zone    TEXT,          -- zone macro id if placed in a zone, else NULL
    location_sector  TEXT,          -- sector macro id (derived from zone or direct sector placement)
    x                REAL,
    y                REAL,
    z                REAL
);
CREATE INDEX IF NOT EXISTS idx_npc_stations_owner  ON npc_stations(owner_faction);
CREATE INDEX IF NOT EXISTS idx_npc_stations_sector ON npc_stations(location_sector);

-- Faction diplomatic relations at game start. -1..1 scale (same as the save's current
-- values, so the API can COALESCE current-over-initial). No FK — factions live in static.db.
CREATE TABLE IF NOT EXISTS faction_relations (
    faction_id       TEXT NOT NULL,
    other_faction_id TEXT NOT NULL,
    initial_relation REAL NOT NULL,
    PRIMARY KEY (faction_id, other_faction_id)
);
CREATE INDEX IF NOT EXISTS idx_faction_relations_faction ON faction_relations(faction_id);

-- Gamestart territorial control, derived from god.xml station placements (highest-priority
-- non-hostile station owner wins the sector). Joins static.db sectors/clusters by id.
CREATE TABLE IF NOT EXISTS sector_ownership (
    sector_id     TEXT PRIMARY KEY,
    owner_faction TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sector_ownership_owner ON sector_ownership(owner_faction);

CREATE TABLE IF NOT EXISTS cluster_ownership (
    cluster_id    TEXT PRIMARY KEY,
    owner_faction TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cluster_ownership_owner ON cluster_ownership(owner_faction);
