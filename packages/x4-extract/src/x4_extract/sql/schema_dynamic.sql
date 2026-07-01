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

-- Delta tracking. `row_state` is the last-seen content hash per logical entity; the
-- pipeline diffs each refresh's keyed rows against it to derive change events. `events`
-- is an append-only telemetry feed (new logbook entries, ship losses, relation shifts,
-- ...) classified by priority so consumers can surface alerts. See dynamic/delta.py.
CREATE TABLE IF NOT EXISTS row_state (
    entity_type TEXT NOT NULL,   -- 'ship' | 'message' | 'logbook' | 'faction_relation' | 'player' | ...
    entity_key  TEXT NOT NULL,   -- stable identity within entity_type
    row_hash    TEXT NOT NULL,   -- content hash; differs ⇒ a 'changed' event
    updated_at  TEXT NOT NULL,   -- ISO wall clock of the last add/change
    PRIMARY KEY (entity_type, entity_key)
);

CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    game_time    REAL,           -- in-game seconds when observed (best-effort)
    real_time    TEXT NOT NULL,  -- ISO wall clock when recorded
    entity_type  TEXT NOT NULL,
    entity_key   TEXT NOT NULL,
    change_kind  TEXT NOT NULL,  -- 'added' | 'changed' | 'removed'
    priority     TEXT NOT NULL,  -- 'info' | 'warn' | 'alert'
    category     TEXT,           -- 'combat' | 'economy' | 'diplomacy' | 'fleet' | 'log' | 'message'
    title        TEXT,
    text         TEXT,
    payload_json TEXT            -- the new row content (NULL for 'removed')
);
CREATE INDEX IF NOT EXISTS idx_events_game_time ON events(game_time);
CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);

CREATE TABLE IF NOT EXISTS sector_state (
    sector_id       TEXT PRIMARY KEY,
    known_to_player INTEGER NOT NULL DEFAULT 0,
    extra_json      TEXT
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
    seed_id               TEXT,
    dynamic_tags          TEXT,
    known_to_player       INTEGER NOT NULL DEFAULT 0,
    basename              TEXT,
    nameindex             INTEGER,
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

-- Per-module construction-sequence layout: the placed-module graph of a station, as
-- the save records it under station/construction/sequence/entry. Unlike station_modules
-- (which aggregates by macro into counts), this preserves each placed module's identity,
-- its parent (the spanning tree that defines connections) and its station-frame position.
-- This is what lets the dashboard reconstruct an existing station in the builder with its
-- real layout + connections. `predecessor_index` references another entry's `entry_index`
-- within the same station (NULL for the root/fixed module). Positions are zone/station-frame
-- metres (any axis may be absent in the save → NULL). See docs/save-structure.md.
CREATE TABLE IF NOT EXISTS station_construction_entries (
    station_id             TEXT NOT NULL,
    entry_id               TEXT NOT NULL,   -- save-unique component id of the placed module
    entry_index            INTEGER,         -- sequence index within the station
    macro                  TEXT,            -- module macro → s.modules.module_id
    predecessor_index      INTEGER,         -- parent entry_index (NULL for root)
    connection             TEXT,            -- this module's connecting snap point
    predecessor_connection TEXT,            -- the parent's snap point it attaches to
    pos_x REAL, pos_y REAL, pos_z REAL,
    PRIMARY KEY (station_id, entry_id)
);
CREATE INDEX IF NOT EXISTS idx_station_entries_station ON station_construction_entries(station_id);

-- Full planned module list for a station under construction, aggregated by macro.
-- Source = the in-progress <build component="<station>"> task's sequence, which is the
-- complete plan (the station's own construction/sequence only holds the current stage).
-- Drives the construction "bill of materials" (joined to static module recipes at query
-- time). Empty for operational stations. See docs/save-structure.md.
CREATE TABLE IF NOT EXISTS station_build_plan (
    station_id TEXT NOT NULL,
    module_id  TEXT NOT NULL,
    macro      TEXT,
    count      INTEGER NOT NULL,
    PRIMARY KEY (station_id, module_id)
);

-- Per-station rollup for the "My Stations" overview (cheap list-level read, no joins).
-- Scalars derived during extraction; the per-module detail lives in station_modules /
-- station_build_plan. `workforce_*` are live (current headcount + productivity bonus);
-- `account_amount` is the station's own credits (player stations only).
-- `account_min`/`account_max` are the station manager's operating budget thresholds
-- (from <account min=… max=…>); NULL when the station has no account element.
CREATE TABLE IF NOT EXISTS station_overview (
    station_id           TEXT PRIMARY KEY,
    module_count         INTEGER,   -- realized/in-progress modules (station_modules)
    planned_module_count INTEGER,   -- full plan from in-progress build task (NULL if not building)
    account_amount       INTEGER,   -- station's own credits
    account_min          INTEGER,   -- operating budget lower threshold
    account_max          INTEGER,   -- operating budget upper threshold (manager target)
    workforce_current    INTEGER,   -- live workforce headcount (summed across races)
    workforce_bonus      REAL,      -- workforce productivity bonus (~0..1)
    production_product    TEXT       -- current production originalproduct
);
-- Migration for DBs created before account_min/account_max were added
-- is handled in Python (db.py, after the schema script runs) because
-- ALTER TABLE ADD COLUMN IF NOT EXISTS is not universally available.

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

-- Live, depleting mineable resources per sector (aggregated across resource areas).
-- `current`/`max` are the regenerating stockpile the player actually mines; `yield_tier`
-- is the categorical density (matches static region_resources vocabulary). VOLATILE:
-- `current` falls as fields are mined and recovers over `recharge_time`.
CREATE TABLE IF NOT EXISTS sector_resources (
    sector_id     TEXT NOT NULL,
    ware          TEXT NOT NULL,
    current       INTEGER,
    max           INTEGER,
    yield_tier    TEXT,
    recharge_time INTEGER,
    PRIMARY KEY (sector_id, ware)
);
CREATE INDEX IF NOT EXISTS idx_sector_resources_ware ON sector_resources(ware);

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
    manual_distance  REAL,
    fast_travel_time REAL,
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

CREATE TABLE IF NOT EXISTS player_inventory (
    ware_id TEXT PRIMARY KEY,
    amount  INTEGER NOT NULL
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
    level         REAL,
    thruster      TEXT,
    is_player_owned INTEGER NOT NULL DEFAULT 0,
    extra_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_dyn_ships_owner  ON ships(owner_faction);
CREATE INDEX IF NOT EXISTS idx_dyn_ships_sector ON ships(sector_id);

-- Live mission instances from <savegame>/<missions>/<mission>.
-- VOLATILE — missions are accepted/abandoned/completed every session.
CREATE TABLE IF NOT EXISTS missions (
    mission_id         TEXT PRIMARY KEY,
    name               TEXT,
    description        TEXT,
    faction            TEXT,
    type               TEXT,
    level              TEXT,
    is_active          INTEGER NOT NULL DEFAULT 0,
    priority           INTEGER,
    abortable          INTEGER,
    associated_entity  TEXT,
    group_id           TEXT,              -- story / war guild group
    is_story           INTEGER NOT NULL DEFAULT 0,  -- computed from group during extraction
    caption            TEXT,              -- contact person name
    icon               TEXT,              -- briefing portrait
    time               REAL,              -- in-game timestamp
    rewardtext         TEXT,              -- reward description
    reward_credits     INTEGER,           -- credit reward
    opposing_faction   TEXT,              -- enemy faction
    activation         TEXT,              -- activation trigger
    alert              TEXT,              -- alert level
    extra_json         TEXT
);

-- Per-mission objectives from <mission>/<briefing>/<objective> (or direct child).
CREATE TABLE IF NOT EXISTS mission_objectives (
    mission_id  TEXT NOT NULL,
    step        INTEGER,
    type        TEXT,
    text        TEXT,
    is_active   INTEGER NOT NULL DEFAULT 0,
    target_id            TEXT,       -- first <targets>/<target id="...">
    progress_current     INTEGER,    -- from <progress current="...">
    progress_max         INTEGER,    -- from <progress max="...">
    progress_name        TEXT,       -- from <progress name="...">
    encyclopedia_type    TEXT,       -- from <encyclopedia type="...">
    encyclopedia_item    TEXT,       -- from <encyclopedia item="...">
    PRIMARY KEY (mission_id, step)
);

-- Available mission offers from <savegame>/<missions>/<offer>.
-- Each offer represents a mission the player can accept at a station.
-- `is_repeatable` distinguishes guild/war board missions (with a briefing/mission
-- template child) from one-shot tutorials and plot invitations.
CREATE TABLE IF NOT EXISTS mission_offers (
    offer_id        TEXT PRIMARY KEY,
    name            TEXT,
    description     TEXT,
    faction         TEXT,
    type            TEXT,
    level           TEXT,
    actor           TEXT,              -- NPC actor ref
    station_id      TEXT,              -- first <location component="...">
    bbs_station_id  TEXT,              -- from <bbs>/<space component="...">
    is_repeatable   INTEGER NOT NULL DEFAULT 0,
    rewardtext      TEXT,              -- from nested briefing/mission rewardtext
    opposing_faction TEXT,             -- parsed from extra_json (war guild / one-shot)
    group_id        TEXT,              -- war guild group (e.g. ter_war_xenon)
    reward_credits  INTEGER,           -- parsed from extra_json
    component_id    TEXT,              -- entity ref for one-shot missions
    distance        INTEGER,           -- mission distance in metres
    thread_type     TEXT,              -- "sequential" for war mission chains
    duration        REAL,              -- mission time limit (seconds)
    extra_json      TEXT
);

CREATE TABLE IF NOT EXISTS player_stats (
    stat_id  TEXT PRIMARY KEY,
    value    REAL
);

-- Player logbook entries from <savegame>/<log>/<entry>. Attributes vary by event type;
-- common fields get explicit columns, everything else lands in extra_json.
CREATE TABLE IF NOT EXISTS logbook (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    time        REAL NOT NULL,
    title       TEXT NOT NULL,
    text        TEXT NOT NULL,
    category    TEXT,
    subcategory TEXT,
    faction     TEXT,
    extra_json  TEXT
);
CREATE INDEX IF NOT EXISTS idx_logbook_time ON logbook(time DESC);
CREATE INDEX IF NOT EXISTS idx_logbook_category ON logbook(category);

-- Player message inbox from <savegame>/<messages>/<entry>. Wide capture: every attribute
-- on the entry element is preserved; unrecognised fields land in extra_json.
CREATE TABLE IF NOT EXISTS player_messages (
    id            INTEGER PRIMARY KEY,
    time          REAL NOT NULL,
    title         TEXT NOT NULL,
    text          TEXT,
    source        TEXT,
    highpriority  INTEGER,
    interact      TEXT,
    component     TEXT,
    read          INTEGER,
    extra_json    TEXT
);
CREATE INDEX IF NOT EXISTS idx_player_msgs_time ON player_messages(time DESC);

-- NPCs (crew, marines, station personnel) from <component class="npc">.
-- `entity_type`/`entity_post` capture the assigned role (officer/aipilot/engineer/defence).
-- `seed` is the deterministic NPC seed for skill generation.
-- `connection` is the assigned slot on the ship/station (e.g. con_pilot_01).
-- Skill values are 0–15 (0–5 stars × 3 pips per star).
-- `blackboard_json` captures the NPC's blackboard key/value pairs.
-- `location_ship_id`/`location_station_id` point to the enclosing ship/station (ancestor walk).
CREATE TABLE IF NOT EXISTS npc (
    id                  TEXT PRIMARY KEY,
    name                TEXT,
    code                TEXT,
    macro               TEXT,
    owner_faction       TEXT,
    entity_type         TEXT,
    entity_post         TEXT,
    seed                TEXT,
    connection          TEXT,
    location_ship_id    TEXT,
    location_station_id TEXT,
    skill_piloting      INTEGER,
    skill_morale        INTEGER,
    skill_engineering   INTEGER,
    skill_management    INTEGER,
    skill_boarding      INTEGER,
    blackboard_json     TEXT,
    employment          TEXT NOT NULL DEFAULT 'other',  -- 'owned' | 'hireable' | 'other'
    extra_json          TEXT
);
CREATE INDEX IF NOT EXISTS idx_npc_owner ON npc(owner_faction);
CREATE INDEX IF NOT EXISTS idx_npc_employment ON npc(employment);
CREATE INDEX IF NOT EXISTS idx_npc_location_ship ON npc(location_ship_id);
CREATE INDEX IF NOT EXISTS idx_npc_location_station ON npc(location_station_id);

-- Ship equipment slots (player-owned only). One row per installed engine/weapon/turret/
-- shield/missile. `slot_type` is the component class; `slot_connection` is the hardpoint
-- name; `macro` is the installed equipment ware. Linked to ships via ship_id.
CREATE TABLE IF NOT EXISTS ship_loadouts (
    ship_id          TEXT NOT NULL,
    slot_type        TEXT NOT NULL,   -- engine, weapon, turret, shieldgenerator, missilelauncher
    slot_connection  TEXT NOT NULL,   -- e.g. con_engine_01, weaponcon_01
    macro            TEXT NOT NULL,
    ammunition       INTEGER,
    extra_json       TEXT,
    PRIMARY KEY (ship_id, slot_type, slot_connection)
);
CREATE INDEX IF NOT EXISTS idx_loadouts_ship ON ship_loadouts(ship_id);

-- Player/AI deployables: satellites, resource probes, nav beacons, mines, lockboxes.
-- `known_to_player` indicates fog-of-war visibility. Location walks ancestors to zone.
CREATE TABLE IF NOT EXISTS deployables (
    id                TEXT PRIMARY KEY,
    class             TEXT NOT NULL,   -- satellite, resourceprobe, navbeacon, mine, lockbox
    code              TEXT,
    macro             TEXT,
    owner_faction     TEXT,
    sector_id         TEXT,
    zone_id           TEXT,
    x REAL, y REAL, z REAL,
    known_to_player   INTEGER NOT NULL DEFAULT 0,
    extra_json        TEXT
);
CREATE INDEX IF NOT EXISTS idx_deployables_owner ON deployables(owner_faction);
CREATE INDEX IF NOT EXISTS idx_deployables_class ON deployables(class);
CREATE INDEX IF NOT EXISTS idx_deployables_sector ON deployables(sector_id);

CREATE TABLE IF NOT EXISTS ship_cargo (
    ship_id TEXT NOT NULL,
    ware_id TEXT NOT NULL,
    amount  INTEGER NOT NULL,
    PRIMARY KEY (ship_id, ware_id)
);

-- Player P&L from <savegame>/<economylog>. Each <log> is one economic *event* under an
-- <entries type=...> group; we keep only the small, player-relevant `money` and `trade`
-- groups (the `cargo`/`tradeoffer` firehose — ~2.1M rows / ~200 MB — is out of scope).
--
-- APPEND-ONLY: unlike every other dynamic table these are never DELETEd on a tier rewrite.
-- The owning EconomyLogCollector returns () from tables() and flushes with INSERT OR IGNORE,
-- so re-ingesting the same save (or a rotated successor) accumulates rather than clobbers.
-- Owner/buyer/seller are `[0x..]` component ids that join to stations.station_id /
-- ships.ship_id; ids that resolve to neither are empire/faction-level accounts (e.g. the
-- player faction's aggregate net worth).

-- Matched transactions: who bought what from whom, at what price/quantity.
CREATE TABLE IF NOT EXISTS economy_trade (
    time   REAL NOT NULL,   -- in-game seconds (high precision ⇒ effectively unique per trade)
    ware   TEXT,
    buyer  TEXT,            -- component id of the buying entity
    seller TEXT,            -- component id of the selling entity
    price  INTEGER,         -- unit price in credits
    v      INTEGER,         -- quantity traded
    b INTEGER, bmax INTEGER, s INTEGER, smax INTEGER,  -- buyer/seller cargo context at trade
    extra_json TEXT
);
-- Dedup key for the append-only INSERT OR IGNORE. COALESCE is required: SQLite treats NULLs
-- as DISTINCT in a UNIQUE index, so a bare unique would let rows with a NULL key column
-- (e.g. seller) re-insert on every overlapping rolling-window re-ingest.
CREATE UNIQUE INDEX IF NOT EXISTS ux_economy_trade ON economy_trade(
    time, COALESCE(buyer,''), COALESCE(seller,''), COALESCE(ware,''),
    COALESCE(price,-1), COALESCE(v,-1)
);
CREATE INDEX IF NOT EXISTS idx_economy_trade_ware   ON economy_trade(ware);
CREATE INDEX IF NOT EXISTS idx_economy_trade_buyer  ON economy_trade(buyer);
CREATE INDEX IF NOT EXISTS idx_economy_trade_seller ON economy_trade(seller);

-- Per-account money events: balance/net-worth trajectory per player station/ship/empire.
-- `type` is the reason (trade/transfer/orderqueue_*/NULL baseline); v/v2 are money values
-- (interpretation — running balance vs delta — resolved in the API layer).
CREATE TABLE IF NOT EXISTS economy_money (
    owner   TEXT NOT NULL,  -- component id whose account this is
    time    REAL NOT NULL,  -- in-game seconds
    type    TEXT,           -- event reason; NULL for bucket baseline rows
    v       INTEGER,
    v2      INTEGER,
    partner TEXT,           -- counterparty component id (for trade/transfer events)
    extra_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_economy_money ON economy_money(
    owner, time, COALESCE(type,''), COALESCE(v,-1), COALESCE(v2,-1), COALESCE(partner,'')
);
CREATE INDEX IF NOT EXISTS idx_economy_money_owner ON economy_money(owner);
