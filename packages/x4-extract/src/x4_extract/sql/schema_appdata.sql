-- App data: user-authored content created in the dashboard, not derived from game files.
-- A single appdata.db at the data_dir root (sibling of static.db and dynamic/<key>.db).
-- It is NEVER touched by the extraction pipeline, so it survives static/dynamic rebuilds
-- and active-save switches. Non-versioned: schema is additive-only (IF NOT EXISTS), applied
-- idempotently like the other schemas.

-- A station design built in the station builder. References modules by their static macro id
-- (s.modules.module_id) but holds no FK to static.db — that DB is separately attached and may
-- be rebuilt; a node whose module_id no longer resolves is dropped on load (non-fatal).
CREATE TABLE IF NOT EXISTS builder_stations (
    id          TEXT PRIMARY KEY,                   -- uuid
    name        TEXT NOT NULL,
    notes       TEXT,
    grid_mode   INTEGER NOT NULL DEFAULT 1,
    -- Phase II preset/fork fields (unused in Phase I; reserved now to avoid a later migration):
    source_kind TEXT NOT NULL DEFAULT 'user',        -- 'user' | 'imported'
    source_ref  TEXT,                                -- game station_id this was forked from, if any
    created_at  TEXT NOT NULL,                       -- ISO timestamp
    updated_at  TEXT NOT NULL
);

-- One row per placed module (React Flow node).
CREATE TABLE IF NOT EXISTS builder_station_nodes (
    station_id       TEXT NOT NULL REFERENCES builder_stations(id) ON DELETE CASCADE,
    node_id          TEXT NOT NULL,                  -- the React Flow node id
    module_id        TEXT NOT NULL,                  -- joins s.modules.module_id (the macro id)
    pos_x            REAL NOT NULL,
    pos_y            REAL NOT NULL,
    handle_positions TEXT,                           -- JSON of node.data.handlePositions, nullable
    PRIMARY KEY (station_id, node_id)
);

-- One row per connection (React Flow edge).
CREATE TABLE IF NOT EXISTS builder_station_edges (
    station_id    TEXT NOT NULL REFERENCES builder_stations(id) ON DELETE CASCADE,
    edge_id       TEXT NOT NULL,
    source        TEXT NOT NULL,                     -- node_id
    target        TEXT NOT NULL,                     -- node_id
    source_handle TEXT,
    target_handle TEXT,
    PRIMARY KEY (station_id, edge_id)
);

CREATE INDEX IF NOT EXISTS idx_builder_nodes_station ON builder_station_nodes(station_id);
CREATE INDEX IF NOT EXISTS idx_builder_edges_station ON builder_station_edges(station_id);
