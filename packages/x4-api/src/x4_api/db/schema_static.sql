-- Static catalog extracted from game .cat/.dat archives.
-- Rebuilt on patch (content-hash mismatch). Natural string keys throughout — save files
-- reference these IDs directly; surrogate ints would force a translation table.

CREATE TABLE IF NOT EXISTS wares (
    ware_id        TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    group_id       TEXT,
    transport      TEXT,        -- container | solid | liquid | passenger
    volume         REAL NOT NULL,
    price_min      INTEGER,
    price_avg      INTEGER,
    price_max      INTEGER,
    storage_class  TEXT,
    icon_path      TEXT         -- raw path from icons.xml; resolved to /static/icons/{id}.png at query time
);
CREATE INDEX IF NOT EXISTS idx_wares_group ON wares(group_id);

CREATE TABLE IF NOT EXISTS ware_production (
    ware_id        TEXT NOT NULL,
    method         TEXT NOT NULL,
    time_sec       REAL NOT NULL,
    amount         INTEGER NOT NULL,
    workforce      INTEGER,
    PRIMARY KEY (ware_id, method),
    FOREIGN KEY (ware_id) REFERENCES wares(ware_id)
);

CREATE TABLE IF NOT EXISTS ware_inputs (
    ware_id        TEXT NOT NULL,
    method         TEXT NOT NULL,
    input_ware_id  TEXT NOT NULL,
    amount         INTEGER NOT NULL,
    PRIMARY KEY (ware_id, method, input_ware_id)
);
CREATE INDEX IF NOT EXISTS idx_ware_inputs_input ON ware_inputs(input_ware_id);

CREATE TABLE IF NOT EXISTS modules (
    module_id          TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    kind               TEXT,      -- production | habitation | storage | dock | defence
    produces_ware_id   TEXT,
    storage_capacity   INTEGER,
    workforce_capacity INTEGER,
    icon_path          TEXT
);

CREATE TABLE IF NOT EXISTS ships (
    ship_id        TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    class_id       TEXT,      -- s | m | l | xl
    role           TEXT,      -- fighter | hauler | miner | builder | ...
    faction_id     TEXT,
    hull           INTEGER,
    cargo_volume   INTEGER,
    speed_max      REAL,
    icon_path      TEXT
);
CREATE INDEX IF NOT EXISTS idx_ships_class ON ships(class_id);
CREATE INDEX IF NOT EXISTS idx_ships_faction ON ships(faction_id);

CREATE TABLE IF NOT EXISTS factions (
    faction_id     TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    color_hex      TEXT,
    capital_sector TEXT,
    primary_race   TEXT
);

CREATE TABLE IF NOT EXISTS clusters (
    cluster_id TEXT PRIMARY KEY,
    name       TEXT,
    dlc        TEXT
);

CREATE TABLE IF NOT EXISTS sectors (
    sector_id     TEXT PRIMARY KEY,
    cluster_id    TEXT,
    name          TEXT,
    owner_faction TEXT,
    FOREIGN KEY (cluster_id) REFERENCES clusters(cluster_id)
);
CREATE INDEX IF NOT EXISTS idx_sectors_cluster ON sectors(cluster_id);

CREATE TABLE IF NOT EXISTS zones (
    zone_id   TEXT PRIMARY KEY,
    sector_id TEXT,
    x REAL, y REAL, z REAL,
    FOREIGN KEY (sector_id) REFERENCES sectors(sector_id)
);
CREATE INDEX IF NOT EXISTS idx_zones_sector ON zones(sector_id);

CREATE TABLE IF NOT EXISTS gates (
    from_zone_id TEXT NOT NULL,
    to_zone_id   TEXT NOT NULL,
    kind         TEXT,      -- gate | accelerator | highway
    PRIMARY KEY (from_zone_id, to_zone_id)
);

CREATE TABLE IF NOT EXISTS game_version (
    source        TEXT PRIMARY KEY,    -- "base" | "ego_dlc_terran" | ...
    content_hash  TEXT NOT NULL,
    extracted_at  TEXT NOT NULL,
    game_version  TEXT
);
