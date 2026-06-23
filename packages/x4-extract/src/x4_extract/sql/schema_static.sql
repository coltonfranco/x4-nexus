-- Static catalog extracted from game .cat/.dat archives.
-- Rebuilt on patch (content-hash mismatch). Natural string keys throughout — save files
-- reference these IDs directly; surrogate ints would force a translation table.

-- Ware group definitions from waregroups.xml.
-- wares.group_id references group_id here.
CREATE TABLE IF NOT EXISTS ware_groups (
    group_id         TEXT PRIMARY KEY,
    name             TEXT,
    tags             TEXT,               -- tradable | buildable | craftable
    factory_name     TEXT,               -- display name for stations producing this group
    icon             TEXT,
    factory_map_icon TEXT,
    factory_hud_icon TEXT,
    tier             INTEGER,            -- production tier (1=energy, 5=agricultural, etc.)
    priority         INTEGER             -- display sort priority
);

CREATE TABLE IF NOT EXISTS wares (
    ware_id             TEXT PRIMARY KEY,
    name                TEXT NOT NULL,
    shortname           TEXT,
    description         TEXT,
    group_id            TEXT,
    transport           TEXT,        -- container | solid | liquid | passenger
    volume              REAL NOT NULL,
    price_min           INTEGER,
    price_avg           INTEGER,
    price_max           INTEGER,
    storage_class       TEXT,
    tags                TEXT,        -- space-separated ware tags e.g. "equipment crafting"
    restriction_licence TEXT,        -- licence required to trade (NULL = unrestricted)
    component_ref       TEXT,        -- macro ref for modules (e.g. struct_arg_base_01_macro)
    use_threshold       REAL,        -- player relation threshold required for use
    icon_path           TEXT,        -- raw path from icons.xml; resolved to /static/icons/{id}.png at query time
    sortorder           INTEGER,     -- display sort order (101, 201, 301…)
    dismantlefactor     REAL,        -- recycling yield multiplier
    research_time       INTEGER      -- research duration in seconds
);
CREATE INDEX IF NOT EXISTS idx_wares_group ON wares(group_id);

CREATE TABLE IF NOT EXISTS ware_owners (
    ware_id    TEXT NOT NULL,
    faction_id TEXT NOT NULL,
    PRIMARY KEY (ware_id, faction_id)
);
CREATE INDEX IF NOT EXISTS idx_ware_owners_faction ON ware_owners(faction_id);

CREATE TABLE IF NOT EXISTS texts (
    page_id    INTEGER,
    text_id    INTEGER,
    text       TEXT NOT NULL,
    PRIMARY KEY (page_id, text_id)
);

CREATE TABLE IF NOT EXISTS ware_illegal (
    ware_id    TEXT NOT NULL,
    faction_id TEXT NOT NULL,
    PRIMARY KEY (ware_id, faction_id)
);

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
    file_path          TEXT,
    is_legacy          BOOLEAN DEFAULT 0,
    dlc                TEXT,
    kind               TEXT,
    size               TEXT,
    makerrace          TEXT,
    description        TEXT,
    shortname          TEXT,
    is_datavault       BOOLEAN,
    is_landmark        BOOLEAN,
    is_unique          BOOLEAN,
    icon               TEXT,
    hudicon            TEXT,
    factionhqicon      TEXT,
    subtype            TEXT,
    produces_ware_id   TEXT,
    storage_capacity   INTEGER,
    storage_type       TEXT,
    drone_capacity     INTEGER,
    workforce_capacity INTEGER,
    workforce_race     TEXT,
    workforce_growthrate REAL,
    hull               INTEGER,
    hull_min           INTEGER,
    hull_integrated    BOOLEAN,
    hull_invulnerable  BOOLEAN,
    hull_noscrap       BOOLEAN,
    explosiondamage    INTEGER,
    explosion_shield_damage INTEGER,
    secrecy_level      INTEGER,
    dock_allow         BOOLEAN,
    dock_allowbuild    BOOLEAN,
    dock_allowtrade    BOOLEAN,
    dock_allowunits    BOOLEAN,
    dock_external      BOOLEAN,
    dock_playeronly    BOOLEAN,
    dock_priority      INTEGER,
    dock_showroom      BOOLEAN,
    dock_size_tags     TEXT,
    equip_classes      TEXT,
    supply_classes     TEXT,
    production_research    BOOLEAN,
    production_show_active BOOLEAN,
    builder_units      INTEGER,
    build_has_storage  BOOLEAN,
    build_sets         TEXT,
    rotation_speed_max    REAL,
    rotation_accel_max    REAL,
    translation_speed_max REAL,
    translation_accel_max REAL,
    undock_distance    REAL,
    undock_speed       REAL,
    undock_rotate      BOOLEAN,
    autoaim_allow      BOOLEAN,
    ownership_claim    BOOLEAN,
    longrangescan_minlevel INTEGER,
    turrets_s          INTEGER DEFAULT 0,
    turrets_m          INTEGER DEFAULT 0,
    turrets_l          INTEGER DEFAULT 0,
    turrets_xl         INTEGER DEFAULT 0,
    shields_s          INTEGER DEFAULT 0,
    shields_m          INTEGER DEFAULT 0,
    shields_l          INTEGER DEFAULT 0,
    shields_xl         INTEGER DEFAULT 0,
    dock_s             INTEGER DEFAULT 0,
    dock_m             INTEGER DEFAULT 0,
    dock_l             INTEGER DEFAULT 0,
    dock_xl            INTEGER DEFAULT 0,
    hangar_s           INTEGER DEFAULT 0,
    hangar_m           INTEGER DEFAULT 0,
    snap_points        INTEGER DEFAULT 0,
    production_method  TEXT,
    icon_path          TEXT
);

CREATE TABLE IF NOT EXISTS ships (
    ship_id          TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT,
    basename         TEXT,
    file_path        TEXT,
    is_legacy        BOOLEAN DEFAULT 0,
    dlc              TEXT,
    class_id         TEXT,      -- s | m | l | xl
    ship_type        TEXT,      -- fighter | miner | freighter | carrier | destroyer | gunboat | courier | scout | ...
    role             TEXT,      -- fighter | hauler | miner | builder | ... (primary purpose)
    faction_id       TEXT,
    hull             INTEGER,
    cargo_volume     INTEGER,
    dps_max          REAL,
    speed_min        REAL,
    speed_max        REAL,
    travel_min       REAL,
    travel_max       REAL,
    boost_min        REAL,
    boost_max        REAL,
    pitch_min        REAL,
    pitch_max        REAL,
    yaw_min          REAL,
    yaw_max          REAL,
    roll_min         REAL,
    roll_max         REAL,
    shield_capacity_min    REAL,
    shield_capacity_max    REAL,
    shield_recharge_min    REAL,
    shield_recharge_max    REAL,
    shield_delay_min       REAL,
    shield_delay_max       REAL,
    radar_range      REAL,
    accel_max        REAL,
    range_max        REAL,
    icon_path        TEXT,
    
    -- Physics
    mass             REAL,
    drag_forward     REAL,
    drag_reverse     REAL,
    drag_horizontal  REAL,
    drag_vertical    REAL,
    drag_pitch       REAL,
    drag_yaw         REAL,
    drag_roll        REAL,
    
    -- Inertia
    inertia_pitch    REAL,
    inertia_yaw      REAL,
    inertia_roll     REAL,
    
    -- Capacity
    people_capacity        INTEGER,
    missile_storage        INTEGER,
    drone_storage          INTEGER,
    countermeasure_storage INTEGER,
    deployable_storage     INTEGER,

    -- Equipment counts
    weapons_s      INTEGER DEFAULT 0,
    weapons_m      INTEGER DEFAULT 0,
    weapons_l      INTEGER DEFAULT 0,
    weapons_xl     INTEGER DEFAULT 0,
    
    turrets_s      INTEGER DEFAULT 0,
    turrets_m      INTEGER DEFAULT 0,
    turrets_l      INTEGER DEFAULT 0,
    turrets_xl     INTEGER DEFAULT 0,
    
    shields_s      INTEGER DEFAULT 0,
    shields_m      INTEGER DEFAULT 0,
    shields_l      INTEGER DEFAULT 0,
    shields_xl     INTEGER DEFAULT 0,
    
    engines_s      INTEGER DEFAULT 0,
    engines_m      INTEGER DEFAULT 0,
    engines_l      INTEGER DEFAULT 0,
    engines_xl     INTEGER DEFAULT 0,

    -- Docks & Internal Storage
    dock_s           INTEGER DEFAULT 0,
    dock_m           INTEGER DEFAULT 0,
    dock_l           INTEGER DEFAULT 0,
    dock_xl          INTEGER DEFAULT 0,
    storage_s        INTEGER DEFAULT 0,
    storage_m        INTEGER DEFAULT 0,
    storage_l        INTEGER DEFAULT 0,
    storage_xl       INTEGER DEFAULT 0,
    launch_tubes     INTEGER DEFAULT 0,

    -- Acceleration/Jerk Profile
    accel_forward    REAL,
    decel_forward    REAL,
    accel_boost      REAL,
    accel_travel     REAL,
    accel_strafe     REAL,
    accel_angular    REAL,
    accel_factor_reverse REAL,
    accel_factor_horizontal REAL,
    accel_factor_vertical REAL,

    -- Modifiers & Extras
    modifier_weapon_heat REAL,
    explosion_damage REAL,
    explosion_shield_damage REAL,
    explosion_shield_disruption REAL,
    variation        TEXT,
    travel_stability REAL,

    -- Gathering (miners)
    gatherrate_gas      REAL,
    gatherrate_ore      REAL,
    gatherrate_silicon   REAL,

    -- Combat flags
    can_be_captured     INTEGER,

    -- Direct radar / boost overrides
    radar_range_direct  REAL,
    boost_recharge_delay REAL,

    -- Rotation (Xenon / power users)
    rotation_speed_max  REAL,
    rotation_accel_max  REAL,

    secrecy_level  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ships_class ON ships(class_id);
CREATE INDEX IF NOT EXISTS idx_ships_faction ON ships(faction_id);

CREATE TABLE IF NOT EXISTS ship_software (
    ship_id    TEXT NOT NULL,
    ware_id    TEXT NOT NULL,
    compatible INTEGER NOT NULL DEFAULT 0,  -- 1 = equippable but not default
    is_default INTEGER NOT NULL DEFAULT 0,  -- 1 = fitted by default
    PRIMARY KEY (ship_id, ware_id)
);

CREATE TABLE IF NOT EXISTS factions (
    faction_id     TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    file_path      TEXT,
    is_legacy      BOOLEAN DEFAULT 0,
    color_hex      TEXT,
    primary_race   TEXT,
    description    TEXT,
    short_name     TEXT,
    prefix_name    TEXT,
    space_name     TEXT,
    home_space_name TEXT,
    behaviour_set  TEXT,
    police_faction TEXT,
    icon_active    TEXT,
    icon_inactive  TEXT,
    icon_banner    TEXT,
    tags           TEXT
);

CREATE TABLE IF NOT EXISTS clusters (
    cluster_id TEXT PRIMARY KEY,
    name       TEXT,
    file_path  TEXT,
    is_legacy  BOOLEAN DEFAULT 0,
    dlc        TEXT,
    name_id          TEXT,
    description_id   TEXT,
    environment      TEXT,
    sun_class        TEXT,
    population_id    TEXT,
    max_population   INTEGER,
    x REAL, y REAL, z REAL,
    qx REAL, qy REAL, qz REAL, qw REAL
);

CREATE TABLE IF NOT EXISTS sectors (
    sector_id     TEXT PRIMARY KEY,
    cluster_id    TEXT,
    name          TEXT,
    file_path     TEXT,
    is_legacy     BOOLEAN DEFAULT 0,
    dlc              TEXT,
    name_id          TEXT,
    description_id   TEXT,
    sunlight         REAL,
    economy          REAL,
    security         REAL,
    tags             TEXT,   -- space-separated flags: anarchy, allowrandomanomaly, etc.
    access_licence   TEXT,   -- licence required to enter (NULL = open access)
    x REAL, y REAL, z REAL,
    qx REAL, qy REAL, qz REAL, qw REAL,
    FOREIGN KEY (cluster_id) REFERENCES clusters(cluster_id)
);
CREATE INDEX IF NOT EXISTS idx_sectors_cluster ON sectors(cluster_id);

CREATE TABLE IF NOT EXISTS zones (
    zone_id   TEXT PRIMARY KEY,
    sector_id TEXT,
    file_path TEXT,
    is_legacy BOOLEAN DEFAULT 0,
    x REAL, y REAL, z REAL,
    qx REAL, qy REAL, qz REAL, qw REAL,
    FOREIGN KEY (sector_id) REFERENCES sectors(sector_id)
);
CREATE INDEX IF NOT EXISTS idx_zones_sector ON zones(sector_id);

CREATE TABLE IF NOT EXISTS gates (
    from_zone_id TEXT NOT NULL,
    to_zone_id   TEXT NOT NULL,
    file_path    TEXT,
    is_legacy    BOOLEAN DEFAULT 0,
    kind         TEXT,      -- gate | accelerator | highway
    PRIMARY KEY (from_zone_id, to_zone_id)
);

CREATE TABLE IF NOT EXISTS superhighways (
    from_zone_id TEXT NOT NULL,
    to_zone_id   TEXT NOT NULL,
    kind         TEXT NOT NULL,
    PRIMARY KEY (from_zone_id, to_zone_id)
);

CREATE TABLE IF NOT EXISTS regions (
    region_id    TEXT PRIMARY KEY,
    cluster_id   TEXT,
    sector_id    TEXT,
    x REAL, y REAL, z REAL,
    qx REAL, qy REAL, qz REAL, qw REAL
);

CREATE TABLE IF NOT EXISTS equip_engines (
    engine_id        TEXT PRIMARY KEY,
    name             TEXT,
    file_path        TEXT,
    is_legacy        BOOLEAN DEFAULT 0,
    dlc              TEXT,
    class_id         TEXT,      -- engine, thruster
    size             TEXT,      -- s, m, l, xl, spacesuit
    compat_tags      TEXT,      -- space-separated restrictive tags for ship compatibility (NULL = universal)
    faction_id       TEXT,
    mk               INTEGER,
    thrust_forward   REAL,
    thrust_reverse   REAL,
    thrust_strafe    REAL,
    thrust_pitch     REAL,
    thrust_yaw       REAL,
    thrust_roll      REAL,
    travel_thrust    REAL,
    travel_attack    REAL,
    travel_charge    REAL,
    travel_release   REAL,
    boost_thrust     REAL,
    boost_duration   REAL,
    boost_attack     REAL,
    boost_release    REAL
);

CREATE TABLE IF NOT EXISTS equip_shields (
    shield_id             TEXT PRIMARY KEY,
    name                  TEXT,
    file_path             TEXT,
    is_legacy             BOOLEAN DEFAULT 0,
    dlc                   TEXT,
    size                  TEXT,
    compat_tags           TEXT,      -- space-separated restrictive tags for ship compatibility (NULL = universal)
    faction_id            TEXT,
    mk                    INTEGER,
    capacity              REAL,
    recharge_rate         REAL,
    recharge_delay        REAL,
    disruption_stability  REAL
);

CREATE TABLE IF NOT EXISTS equip_bullets (
    bullet_id        TEXT PRIMARY KEY,
    name             TEXT, -- sometimes missing
    file_path        TEXT,
    is_legacy        BOOLEAN DEFAULT 0,
    dlc              TEXT,
    speed            REAL,
    lifetime         REAL,
    amount           INTEGER,
    barrelamount     INTEGER,
    angle            REAL,           -- spread / accuracy
    maxhits          INTEGER,        -- shots before despawn
    range_direct     REAL,           -- direct range override
    reload_rate      REAL,
    reload_time      REAL,           -- full reload time (missiles)
    damage           REAL,
    shield_damage    REAL,
    hull_damage      REAL,
    shield_disruption REAL,          -- shield disruption effect
    heat_value       REAL,
    explosion_hull   REAL,           -- AoE/missile explosion hull damage
    explosion_shield REAL,           -- AoE/missile explosion shield damage
    ammo_value       INTEGER,        -- ammo capacity
    ammo_reload      REAL,           -- ammo reload time
    missile_lifetime REAL,           -- missile-specific lifetime override
    missile_range    REAL,           -- missile-specific range override
    area_damage      REAL,           -- area-of-effect damage
    area_lifetime    REAL            -- area-of-effect lifetime
);

CREATE TABLE IF NOT EXISTS equip_weapons (
    weapon_id        TEXT PRIMARY KEY,
    name             TEXT,
    file_path        TEXT,
    is_legacy        BOOLEAN DEFAULT 0,
    dlc              TEXT,
    class_id         TEXT,
    size             TEXT,
    compat_tags      TEXT,      -- space-separated restrictive tags for ship compatibility (NULL = universal)
    faction_id       TEXT,
    mk               INTEGER,
    default_bullet_id TEXT,
    heat_overheat    REAL,
    heat_coolrate    REAL,
    heat_cooldelay   REAL,
    heat_reenable    REAL,
    rotation_speed   REAL,
    rotation_accel   REAL,
    reload_rate      REAL,
    reload_time      REAL,
    hull_max         INTEGER,
    ammo_capacity    INTEGER,
    missile_storage  INTEGER,
    FOREIGN KEY (default_bullet_id) REFERENCES equip_bullets(bullet_id)
);

CREATE TABLE IF NOT EXISTS equip_deployables (
    deployable_id    TEXT PRIMARY KEY,
    name             TEXT,
    file_path        TEXT,
    is_legacy        BOOLEAN DEFAULT 0,
    dlc              TEXT,
    class_id         TEXT,      -- satellite, navbeacon, resourceprobe, mine, countermeasure
    radar_range      REAL,
    hull             REAL,
    explosioneffect_strength REAL
);

CREATE TABLE IF NOT EXISTS equip_software (
    software_id      TEXT PRIMARY KEY,
    name             TEXT,
    file_path        TEXT,
    is_legacy        BOOLEAN DEFAULT 0,
    class_id         TEXT,      -- scanner, computer, radar
    scan_maxlevel    INTEGER,
    radar_range      REAL
);

-- Equipment mod wares (mod_weapon_*, mod_engine_*, mod_shield_*, mod_ship_*).
-- Stat multipliers sourced from equipmentmods.xml; name/price from wares.xml.
CREATE TABLE IF NOT EXISTS equip_mods (
    ware_id         TEXT PRIMARY KEY,
    name            TEXT,
    shortname       TEXT,
    description     TEXT,
    category        TEXT,    -- weapon | engine | shield | ship
    stat            TEXT,    -- damage | cooling | reload | speed | beamlength | ...
    quality         INTEGER, -- 1 | 2 | 3
    min_factor      REAL,
    max_factor      REAL,
    price_min       INTEGER,
    price_avg       INTEGER,
    price_max       INTEGER,
    production_time REAL
);
CREATE INDEX IF NOT EXISTS idx_equip_mods_category ON equip_mods(category);
CREATE INDEX IF NOT EXISTS idx_equip_mods_stat     ON equip_mods(stat);

-- Chance-based bonus stat effects that can roll when a mod is applied.
CREATE TABLE IF NOT EXISTS equip_mod_bonuses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ware_id     TEXT NOT NULL,
    stat        TEXT NOT NULL,    -- the bonus stat that may also be modified
    min_factor  REAL,
    max_factor  REAL,
    chance      REAL,             -- probability (0.0–1.0) of this bonus triggering
    max_rolls   INTEGER,          -- maximum number of bonus rolls
    weight      REAL,             -- relative selection weight when multiple bonuses compete
    FOREIGN KEY (ware_id) REFERENCES equip_mods(ware_id)
);
CREATE INDEX IF NOT EXISTS idx_equip_mod_bonuses_ware ON equip_mod_bonuses(ware_id);

-- Terraforming system from libraries/terraforming.xml.
CREATE TABLE IF NOT EXISTS terraform_stats (
    stat_id     TEXT PRIMARY KEY,
    name        TEXT,
    icon        TEXT,
    default_val INTEGER
);

CREATE TABLE IF NOT EXISTS terraform_project_groups (
    group_id    TEXT PRIMARY KEY,
    name        TEXT
);

CREATE TABLE IF NOT EXISTS terraform_projects (
    project_id       TEXT PRIMARY KEY,
    group_id         TEXT,
    name             TEXT,
    description      TEXT,
    duration         INTEGER,
    repeat_cooldown  INTEGER,
    resilient        BOOLEAN,
    chance           REAL,
    resource_credits INTEGER,
    resource_maxprice INTEGER,
    resource_payout    INTEGER,
    resource_pricescale INTEGER,
    research         TEXT,
    showalways       BOOLEAN,
    version          INTEGER,
    FOREIGN KEY (group_id) REFERENCES terraform_project_groups(group_id)
);
CREATE INDEX IF NOT EXISTS idx_terraform_projects_group ON terraform_projects(group_id);

-- Prerequisite stat conditions a project requires before it can be undertaken.
CREATE TABLE IF NOT EXISTS terraform_sideeffects (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     TEXT NOT NULL,
    stat           TEXT NOT NULL,
    change         REAL,
    beneficial     INTEGER,
    chance         REAL,
    setback        TEXT,
    triggered_project TEXT,
    text           TEXT,
    FOREIGN KEY (project_id) REFERENCES terraform_projects(project_id)
);
CREATE INDEX IF NOT EXISTS idx_terraform_sideeffects_project ON terraform_sideeffects(project_id);

CREATE TABLE IF NOT EXISTS terraform_rebates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     TEXT NOT NULL,
    ware_id        TEXT,
    ware_group     TEXT,
    value          REAL,
    FOREIGN KEY (project_id) REFERENCES terraform_projects(project_id)
);
CREATE INDEX IF NOT EXISTS idx_terraform_rebates_project ON terraform_rebates(project_id);

CREATE TABLE IF NOT EXISTS terraform_project_conditions (
    project_id  TEXT NOT NULL,
    stat        TEXT NOT NULL,
    min_val     INTEGER,
    max_val     INTEGER,
    min_value   INTEGER,    -- alternate form used in some entries
    max_value   INTEGER,
    PRIMARY KEY (project_id, stat),
    FOREIGN KEY (project_id) REFERENCES terraform_projects(project_id)
);

CREATE TABLE IF NOT EXISTS terraform_project_effects (
    project_id  TEXT NOT NULL,
    stat        TEXT NOT NULL,
    change      INTEGER NOT NULL,
    min_val     INTEGER,
    max_val     INTEGER,
    value       INTEGER,
    PRIMARY KEY (project_id, stat),
    FOREIGN KEY (project_id) REFERENCES terraform_projects(project_id)
);

CREATE TABLE IF NOT EXISTS terraform_project_resources (
    project_id  TEXT NOT NULL,
    ware_id     TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    PRIMARY KEY (project_id, ware_id),
    FOREIGN KEY (project_id) REFERENCES terraform_projects(project_id)
);

CREATE TABLE IF NOT EXISTS terraform_project_deliveries (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id     TEXT NOT NULL,
    ship_macro     TEXT NOT NULL,
    amount         INTEGER NOT NULL,
    build_duration INTEGER,
    FOREIGN KEY (project_id) REFERENCES terraform_projects(project_id)
);

CREATE TABLE IF NOT EXISTS game_version (
    source        TEXT PRIMARY KEY,    -- "base" | "ego_dlc_terran" | ...
    content_hash  TEXT NOT NULL,
    extracted_at  TEXT NOT NULL,
    game_version  TEXT
);

-- NOTE: faction_relations moved to seed.db (gamestart snapshot, not reference). See docs/data-sources.md.

-- Race definitions from libraries/races.xml.
-- Shared by all factions of that lineage (e.g. 'argon' race → argon, antigone, …).
CREATE TABLE IF NOT EXISTS races (
    race_id         TEXT PRIMARY KEY,
    name            TEXT,
    description     TEXT,
    shortname       TEXT,
    spacename       TEXT,
    homespacename   TEXT,
    names_table     INTEGER,        -- localization table ID
    tags            TEXT,
    -- Character physics
    char_height         REAL,
    char_walk_speed     REAL,
    char_run_speed      REAL,
    char_slow_walk      REAL,
    char_acceleration   REAL,
    char_spacesuit_ref  TEXT,
    -- Event monitor (cutscene camera)
    event_adjust_y   REAL,
    event_adjust_z   REAL,
    event_face_key   TEXT,
    -- Icons
    icon_active     TEXT,
    icon_inactive   TEXT,
    -- Diplomacy agent icons
    agent_icon_male     TEXT,
    agent_icon_female   TEXT,
    -- Engine trail
    trail_brightness    REAL,
    trail_contrast      REAL,
    trail_saturation    REAL,
    trail_hue           INTEGER,
    -- Engine effect
    engine_color_index  INTEGER,
    -- Chair (for seated NPCs)
    chair_ref       TEXT
);

CREATE TABLE IF NOT EXISTS race_relations (
    race_id        TEXT NOT NULL,
    other_race_id  TEXT NOT NULL,
    relation       REAL NOT NULL,
    PRIMARY KEY (race_id, other_race_id)
);

CREATE TABLE IF NOT EXISTS faction_licences (
    licence_type   TEXT NOT NULL,
    faction_id     TEXT NOT NULL,
    name           TEXT,
    description    TEXT,
    icon           TEXT,
    precursor      TEXT,
    price          INTEGER,
    min_relation   REAL,
    PRIMARY KEY (licence_type, faction_id),
    FOREIGN KEY (faction_id) REFERENCES factions(faction_id)
);

-- Resource regions from region_definitions.xml, expanded per sector via map file region connections.
-- A single region definition (e.g. p1_40km_asteroid_field) may appear in multiple sectors.
-- sector_id is NULL for regions not found in any cluster map connection.
CREATE TABLE IF NOT EXISTS region_resources (
    region_name TEXT NOT NULL,
    sector_id   TEXT,
    ware        TEXT NOT NULL,
    yield       TEXT NOT NULL,     -- low | medium | high | veryhigh
    PRIMARY KEY (region_name, sector_id, ware)
);
CREATE INDEX IF NOT EXISTS idx_region_resources_sector ON region_resources(sector_id);
CREATE INDEX IF NOT EXISTS idx_region_resources_ware   ON region_resources(ware);

-- Named loadout presets (game starts, tutorial ships, NPC configurations)
CREATE TABLE IF NOT EXISTS loadouts (
    loadout_id  TEXT PRIMARY KEY,
    ship_macro  TEXT NOT NULL,
    name        TEXT,
    description TEXT
);
CREATE INDEX IF NOT EXISTS idx_loadouts_ship ON loadouts(ship_macro);

CREATE TABLE IF NOT EXISTS loadout_equipment (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    loadout_id  TEXT NOT NULL REFERENCES loadouts(loadout_id),
    slot_path   TEXT,
    macro       TEXT NOT NULL,
    kind        TEXT NOT NULL,
    optional    INTEGER NOT NULL DEFAULT 0,
    quantity    INTEGER,
    weaponmode  TEXT,           -- attackenemies | defend | …
    ammunition  TEXT            -- missile macro for weapon slots
);
CREATE INDEX IF NOT EXISTS idx_loadout_equipment_loadout ON loadout_equipment(loadout_id);
CREATE INDEX IF NOT EXISTS idx_loadout_equipment_macro   ON loadout_equipment(macro);

-- NPC and player-buildable station type definitions (class="station" macros)
CREATE TABLE IF NOT EXISTS station_types (
    station_id     TEXT PRIMARY KEY,
    name           TEXT,
    file_path      TEXT,
    makerrace      TEXT,
    description    TEXT,
    icon           TEXT,
    hull           INTEGER,
    hull_integrated    BOOLEAN,
    workforce_max  INTEGER,
    workforce_race TEXT,
    drone_capacity INTEGER,
    storage_capacity   INTEGER,
    storage_type       TEXT,
    dock_allow     BOOLEAN,
    dock_allowtrade    BOOLEAN,
    dock_allowbuild    BOOLEAN,
    dock_external  BOOLEAN,
    dock_playeronly    BOOLEAN,
    dock_size_tags TEXT,
    equip_classes  TEXT,
    supply_classes TEXT,
    production_research BOOLEAN,
    secrecy_level  INTEGER,
    ownership_claim    BOOLEAN,
    build_sets     TEXT
);

-- NOTE: npc_stations moved to seed.db (gamestart placements, not reference). See docs/data-sources.md.

-- Diplomacy system from libraries/diplomacy.xml.
CREATE TABLE IF NOT EXISTS diplo_actions (
    action_id          TEXT PRIMARY KEY,
    category           TEXT,
    name               TEXT,
    description        TEXT,
    shortdescription   TEXT,
    hidden             INTEGER,
    is_unique          INTEGER,
    friendgroup        TEXT,
    cost_influence     INTEGER,
    cost_money         INTEGER,
    cost_maxinfluencefactor INTEGER,
    success_chance     INTEGER,
    success_weight     INTEGER,
    success_selectionbonus TEXT,
    success_text       TEXT,
    duration_sec       INTEGER,
    cooldown_sec       INTEGER,
    time_maxinfluencefactor INTEGER,
    agent_type         TEXT,
    agent_experience   INTEGER,
    risk               TEXT,
    reward_influence   INTEGER,
    reward_text        TEXT,
    icon_active        TEXT,
    icon_image         TEXT,
    triggers_event     INTEGER
);

-- Specific wares (or tag-based ware groups) required as bribes for an action.
CREATE TABLE IF NOT EXISTS diplo_action_bribe_wares (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id   TEXT NOT NULL,
    ware_id     TEXT,               -- specific ware; NULL if tag-based
    ware_tags   TEXT,               -- bribe tag; NULL if specific ware
    amount      INTEGER,
    FOREIGN KEY (action_id) REFERENCES diplo_actions(action_id)
);

-- Faction-specific preferred gift wares (one row per ware+faction pair).
CREATE TABLE IF NOT EXISTS diplo_gifts (
    ware_id     TEXT NOT NULL,
    faction_id  TEXT NOT NULL,
    PRIMARY KEY (ware_id, faction_id)
);
CREATE TABLE IF NOT EXISTS diplo_events (
    event_id           TEXT PRIMARY KEY,
    name               TEXT,
    description        TEXT,
    shortdescription   TEXT,
    duration_sec       INTEGER,
    icon_image         TEXT
);

CREATE TABLE IF NOT EXISTS diplo_event_options (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id           TEXT NOT NULL,
    option_id          TEXT NOT NULL,
    name               TEXT,
    description        TEXT,
    menuposition       INTEGER,
    agent_risk         TEXT,
    cost_influence     INTEGER,
    cost_money         INTEGER,
    success_weight     INTEGER,
    success_selectionbonus TEXT,
    relation_value     REAL,
    conclusion_text    TEXT,
    result_text        TEXT,
    FOREIGN KEY (event_id) REFERENCES diplo_events(event_id)
);
CREATE INDEX IF NOT EXISTS idx_diplo_event_options_event ON diplo_event_options(event_id);

CREATE INDEX IF NOT EXISTS idx_diplo_gifts_faction ON diplo_gifts(faction_id);

-- Agent rank thresholds.
CREATE TABLE IF NOT EXISTS diplo_agent_ranks (
    min_value    INTEGER PRIMARY KEY,
    name         TEXT,
    event_bonus  REAL,
    icon         TEXT
);

-- Drop system from libraries/drops.xml.

-- Reusable loot pools referenced by droplists.
CREATE TABLE IF NOT EXISTS drop_baskets (
    basket_id    TEXT PRIMARY KEY,
    basket_type  TEXT NOT NULL    -- 'wares' | 'ammo'
);

-- Weighted entries within each basket.
CREATE TABLE IF NOT EXISTS drop_basket_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    basket_id   TEXT NOT NULL,
    ware_id     TEXT,             -- ware ID for wares baskets (inv_*)
    macro       TEXT,             -- missile macro for ammo baskets
    weight      INTEGER NOT NULL DEFAULT 1,
    min_amount  INTEGER NOT NULL DEFAULT 1,
    max_amount  INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (basket_id) REFERENCES drop_baskets(basket_id)
);
CREATE INDEX IF NOT EXISTS idx_drop_basket_entries_basket ON drop_basket_entries(basket_id);

-- Named drop tables (ship class drops, lockboxes, asteroid types, etc.).
CREATE TABLE IF NOT EXISTS drop_lists (
    list_id      TEXT PRIMARY KEY,
    category     TEXT    -- 'ship' | 'lockbox' | 'asteroid' | 'crystal' | 'story' | 'masstraffic' | 'other'
);

-- Mission group definitions from missiongroups.xml. Faction guild boards, war
-- missions, and story plot chains. The save references these implicitly through
-- faction/type affinity; this table provides the human-readable metadata.
CREATE TABLE IF NOT EXISTS mission_groups (
    group_id    TEXT PRIMARY KEY,
    name        TEXT,               -- localization macro e.g. "{30206,1}"
    faction     TEXT,               -- offering faction id (NULL for story-only groups)
    enemy       TEXT,               -- target faction for war missions
    is_story    INTEGER NOT NULL DEFAULT 0
);

-- Story mission chains available per gamestart (from gamestarts.xml).
CREATE TABLE IF NOT EXISTS gamestart_stories (
    gamestart_id TEXT NOT NULL,
    story_ref    TEXT NOT NULL,
    story_group  TEXT,
    story_index  INTEGER,
    PRIMARY KEY (gamestart_id, story_ref)
);

-- Resolved per-ware entries for each droplist. Baskets are expanded here so
-- queries can ask "what can drop ware X?" with a single index scan.
CREATE TABLE IF NOT EXISTS drop_list_wares (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id        TEXT NOT NULL,
    ware_id        TEXT NOT NULL,
    spawn_chance   INTEGER,          -- parent drop event spawn chance (0-100); NULL = always spawns
    item_chance    REAL,             -- probability of this item given the basket fired (0-100); NULL = all items guaranteed
    weight         INTEGER,          -- raw selection weight; kept for reference
    min_amount     INTEGER NOT NULL DEFAULT 1,
    max_amount     INTEGER NOT NULL DEFAULT 1,
    source_basket  TEXT,             -- basket_id if resolved from a basket; NULL if inline
    FOREIGN KEY (list_id) REFERENCES drop_lists(list_id)
);
CREATE INDEX IF NOT EXISTS idx_drop_list_wares_list ON drop_list_wares(list_id);
CREATE INDEX IF NOT EXISTS idx_drop_list_wares_ware ON drop_list_wares(ware_id);

CREATE TABLE IF NOT EXISTS orders (
    order_id TEXT PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id TEXT PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS behaviours (
    behaviour_id TEXT PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS roles (
    role_id TEXT PRIMARY KEY,
    name TEXT,
    tag TEXT
);

CREATE TABLE IF NOT EXISTS role_skills (
    role_id TEXT NOT NULL,
    skill_ref TEXT NOT NULL,
    relevance INTEGER NOT NULL,
    PRIMARY KEY (role_id, skill_ref),
    FOREIGN KEY (role_id) REFERENCES roles(role_id)
);
