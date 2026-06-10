-- Dynamic state extracted from a save file. One database per save (dynamic/<key>.db).
-- All cross-database joins go through natural string keys against `s.*`.
--
-- Metadata policy: tables are WIDE on purpose — capture every usable attribute the
-- save exposes for an entity, not a curated subset. The long tail of sparse/rare
-- attributes goes into an `extra_json` column rather than being discarded. Only
-- graphical/3D/cosmetic fields are dropped.

-- Tiered-refresh bookkeeping. One row per tier; lets the pipeline skip rewriting a
-- tier (and its derived artifacts) when its content fingerprint is unchanged.
CREATE TABLE IF NOT EXISTS ingest_state (
    tier        TEXT PRIMARY KEY,   -- 'source' | 'structural' | 'volatile'
    fingerprint TEXT NOT NULL,
    ingested_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS save_meta (
    save_path        TEXT PRIMARY KEY,
    save_name        TEXT,
    in_game_time_sec INTEGER,
    real_time_iso    TEXT,
    game_version     TEXT,
    game_build       TEXT,
    player_credits   INTEGER,
    player_name      TEXT,
    extra_json       TEXT,
    parsed_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
    station_id            TEXT PRIMARY KEY,
    code                  TEXT,
    name                  TEXT,
    macro                 TEXT,
    owner_faction         TEXT,
    sector_id             TEXT,
    zone_id               TEXT,
    x REAL, y REAL, z REAL,
    state                 TEXT,
    build_pct             REAL,
    is_player_owned       INTEGER NOT NULL DEFAULT 0,
    is_under_construction INTEGER NOT NULL DEFAULT 0,
    extra_json            TEXT
);
CREATE INDEX IF NOT EXISTS idx_stations_sector ON stations(sector_id);
CREATE INDEX IF NOT EXISTS idx_stations_faction ON stations(owner_faction);

CREATE TABLE IF NOT EXISTS station_modules (
    station_id       TEXT NOT NULL,
    module_id        TEXT NOT NULL,
    macro            TEXT,
    count            INTEGER NOT NULL,
    construction_pct REAL,
    extra_json       TEXT,
    PRIMARY KEY (station_id, module_id)
);

CREATE TABLE IF NOT EXISTS station_offers (
    station_id     TEXT NOT NULL,
    ware_id        TEXT NOT NULL,
    side           TEXT NOT NULL CHECK(side IN ('buy','sell')),
    price          INTEGER NOT NULL,
    quantity       INTEGER NOT NULL,
    last_seen_tick INTEGER,
    PRIMARY KEY (station_id, ware_id, side)
);
-- Covering index drives the route-ranking self-join.
CREATE INDEX IF NOT EXISTS idx_offers_ware_side_price
    ON station_offers(ware_id, side, price, station_id, quantity);

CREATE TABLE IF NOT EXISTS construction_needs (
    station_id TEXT NOT NULL,
    ware_id    TEXT NOT NULL,
    required   INTEGER,
    delivered  INTEGER,
    PRIMARY KEY (station_id, ware_id)
);

CREATE TABLE IF NOT EXISTS trade_orders (
    order_id        TEXT PRIMARY KEY,
    ship_id         TEXT,
    owner_faction   TEXT,
    ware_id         TEXT,
    side            TEXT,
    buy_station_id  TEXT,
    sell_station_id TEXT,
    quantity        INTEGER,
    price           INTEGER,
    state           TEXT,
    extra_json      TEXT
);

CREATE TABLE IF NOT EXISTS sector_distance (
    from_sector_id TEXT NOT NULL,
    to_sector_id   TEXT NOT NULL,
    hops           INTEGER NOT NULL,
    gate_distance  REAL,
    PRIMARY KEY (from_sector_id, to_sector_id)
);

CREATE TABLE IF NOT EXISTS top_routes_per_ware (
    ware_id         TEXT NOT NULL,
    buy_station_id  TEXT NOT NULL,
    sell_station_id TEXT NOT NULL,
    margin          INTEGER NOT NULL,
    qty             INTEGER NOT NULL,
    raw_score       REAL NOT NULL,
    PRIMARY KEY (ware_id, buy_station_id, sell_station_id)
);
CREATE INDEX IF NOT EXISTS idx_top_routes_score
    ON top_routes_per_ware(ware_id, raw_score DESC);

-- Current faction-to-faction + player relations (overrides s.faction_relations).
-- `relation` is on the save's scale; the API normalizes to match static at query time.
CREATE TABLE IF NOT EXISTS faction_relations_current (
    faction_id       TEXT NOT NULL,
    other_faction_id TEXT NOT NULL,
    relation         REAL NOT NULL,
    extra_json       TEXT,
    PRIMARY KEY (faction_id, other_faction_id)
);
CREATE INDEX IF NOT EXISTS idx_fac_rel_cur_faction ON faction_relations_current(faction_id);

-- Single-row player account snapshot. Wide; extra_json captures the long tail.
CREATE TABLE IF NOT EXISTS player (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    player_id       TEXT,
    name            TEXT,
    credits         INTEGER,
    hq_station_id   TEXT,
    current_sector  TEXT,
    current_ship_id TEXT,
    extra_json      TEXT
);

CREATE TABLE IF NOT EXISTS player_blueprints (
    ware_id    TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS player_licences (
    licence_type TEXT NOT NULL,
    faction_id   TEXT NOT NULL,
    PRIMARY KEY (licence_type, faction_id)
);

-- Player + NPC ship instances (the live fleet). `macro` joins s.ships for catalog stats.
CREATE TABLE IF NOT EXISTS ships (
    ship_id       TEXT PRIMARY KEY,
    code          TEXT,
    name          TEXT,
    macro         TEXT,
    owner_faction TEXT,
    class_id      TEXT,
    sector_id     TEXT,
    zone_id       TEXT,
    x REAL, y REAL, z REAL,
    commander_id  TEXT,
    state         TEXT,
    is_player_owned INTEGER NOT NULL DEFAULT 0,
    extra_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_dyn_ships_owner  ON ships(owner_faction);
CREATE INDEX IF NOT EXISTS idx_dyn_ships_sector ON ships(sector_id);

CREATE TABLE IF NOT EXISTS ship_cargo (
    ship_id TEXT NOT NULL,
    ware_id TEXT NOT NULL,
    amount  INTEGER NOT NULL,
    PRIMARY KEY (ship_id, ware_id)
);
