-- Dynamic state extracted from a save file. Atomically swapped on each save load.
-- All cross-database joins go through natural string keys against `s.*`.

CREATE TABLE IF NOT EXISTS save_meta (
    save_path        TEXT PRIMARY KEY,
    save_name        TEXT,
    in_game_time_sec INTEGER,
    real_time_iso    TEXT,
    game_version     TEXT,
    player_credits   INTEGER,
    parsed_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stations (
    station_id            TEXT PRIMARY KEY,
    name                  TEXT,
    owner_faction         TEXT,
    sector_id             TEXT,
    zone_id               TEXT,
    x REAL, y REAL, z REAL,
    is_player_owned       INTEGER NOT NULL DEFAULT 0,
    is_under_construction INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stations_sector ON stations(sector_id);
CREATE INDEX IF NOT EXISTS idx_stations_faction ON stations(owner_faction);

CREATE TABLE IF NOT EXISTS station_modules (
    station_id       TEXT NOT NULL,
    module_id        TEXT NOT NULL,
    count            INTEGER NOT NULL,
    construction_pct REAL,
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
    state           TEXT
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
