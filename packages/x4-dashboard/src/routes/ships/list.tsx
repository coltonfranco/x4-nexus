import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useSettings } from "../../lib/settingsStore";
import { Info, Wrench } from "lucide-react";
import { MultiSelect } from "../../components/ui/multi-select";
import { EntityIcon } from "../../components/EntityIcon";
import { FactionBadge } from "../../components/FactionBadge";
import { StatBar } from "../../components/StatBar";
import { Currency } from "../../components/Currency";
import { classShort, getClassColor, getTypeColor, formatLicence } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import type { FactionSummary } from "../../lib/map/types";
import { ShipClassBadge, ShipTypeBadge } from "../../components/ShipBadges";
import { Button } from "../../components/ui/button";
import { ShipDetailPanel } from "../../components/ShipDetailPanel";
import { DetailDialog } from "../../components/ui/detail-dialog";
import { Switch } from "../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { PageLoaderPreset } from "../../components/PageLoader";
import { PageSubtitle } from "../../components/ui/page-subtitle";
import { HUDCard } from "../../components/HUDCard";
import { FilterBar } from "../../components/FilterBar";
import { SearchInput } from "../../components/ui/search-input";
import { DataTable } from "../../components/DataTable";
import type { ColumnDef, ColumnGroup, RowGroup } from "../../components/DataTable";
import { useColumnVisibility } from "../../lib/useColumnVisibility";
import { apiGet } from "../../lib/api";
import { useKnownFactions } from "../../lib/useKnownFactions";
import { useFactionMap } from "../../lib/useFactionMap";
import { usePlayerLicences } from "../../lib/usePlayerLicences";
import { useGlobalLicences } from "../../lib/useGlobalLicences";

type ShipSummary = {
  ship_id: string;
  name: string;
  dlc: string | null;
  class_id: string;
  faction_id: string | null;
  role: string | null;
  ship_type: string | null;
  hull: number | null;
  shield_capacity_max: number | null;
  cargo_volume: number | null;
  dps_max: number | null;
  speed_min: number | null;
  speed_max: number | null;
  travel_max: number | null;
  boost_max: number | null;
  accel_max: number | null;
  shield_recharge_max: number | null;
  radar_range: number | null;
  range_max: number | null;
  icon_url: string | null;
  image_url: string | null;
  people_capacity: number | null;
  missile_storage: number | null;
  drone_storage: number | null;
  countermeasure_storage: number | null;
  deployable_storage: number | null;
  dock_s: number;
  dock_m: number;
  dock_l: number;
  dock_xl: number;
  storage_s: number;
  storage_m: number;
  storage_l: number;
  storage_xl: number;
  weapons_s: number;
  weapons_m: number;
  weapons_l: number;
  weapons_xl: number;
  turrets_s: number;
  turrets_m: number;
  turrets_l: number;
  turrets_xl: number;
  shields_s: number;
  shields_m: number;
  shields_l: number;
  shields_xl: number;
  engines_s: number;
  engines_m: number;
  engines_l: number;
  engines_xl: number;
  price_avg: number | null;
  is_owned: boolean;
  restriction_licence: string | null;
  has_blueprint: boolean;
  is_obtainable: boolean;
  can_be_captured: boolean;
};

const CLASSES = ["XS", "S", "M", "L", "XL"] as const;

const MAX_SPEED = 12_000;
const MAX_TRAVEL = 50_000;
const MAX_BOOST = 25_000;
const MAX_ACCEL = 500;
const MAX_HULL = 800_000;
const MAX_SHIELD = 2_500_000;
const MAX_SHIELD_RECHARGE = 10_000;
const MAX_CARGO = 60_000;
const MAX_RANGE = 30;
const MAX_RADAR = 40_000;

// ── Column metadata (for visibility MultiSelect) ─────────────────────────────

type ColumnMeta = {
  key: string;
  label: string;
  sortKey?: string;
  groupId: string;
  defaultVisible: boolean;
  align?: "left" | "right";
};

const ALL_COLUMNS: ColumnMeta[] = [
  // Classification
  { key: "type",    label: "Type",    sortKey: "role",               groupId: "classification", defaultVisible: true,  align: "left" },
  { key: "class",   label: "Class",   sortKey: "class_id",           groupId: "classification", defaultVisible: true,  align: "left" },
  { key: "faction", label: "Faction", sortKey: "faction_id",         groupId: "classification", defaultVisible: true,  align: "left" },
  { key: "licence", label: "Licence", sortKey: "restriction_licence", groupId: "classification", defaultVisible: true, align: "left" },
  { key: "price",  label: "Blueprint",  sortKey: "price_avg", groupId: "classification", defaultVisible: true  },
  // Flight
  { key: "speed",  label: "Speed",  sortKey: "speed_max",  groupId: "flight",  defaultVisible: true  },
  { key: "travel", label: "Travel", sortKey: "travel_max", groupId: "flight",  defaultVisible: true  },
  { key: "boost",  label: "Boost",  sortKey: "boost_max",  groupId: "flight",  defaultVisible: false },
  { key: "accel",  label: "Accel",  sortKey: "accel_max",  groupId: "flight",  defaultVisible: false },
  // Defense
  { key: "hull",   label: "Hull",   sortKey: "hull",                groupId: "defense", defaultVisible: true  },
  { key: "shield", label: "Shield", sortKey: "shield_capacity_max", groupId: "defense", defaultVisible: true  },
  { key: "regen",  label: "Regen",  sortKey: "shield_recharge_max", groupId: "defense", defaultVisible: false },
  // Logi
  { key: "cargo",  label: "Cargo",  sortKey: "cargo_volume", groupId: "logi", defaultVisible: false },
  { key: "radar",  label: "Radar",  sortKey: "radar_range",  groupId: "logi", defaultVisible: false },
  // Offense
  { key: "dps",   label: "DPS",       sortKey: "dps_max",   groupId: "offense", defaultVisible: true  },
  { key: "range", label: "Wpn Range", sortKey: "range_max", groupId: "offense", defaultVisible: false },
  // Capacity
  { key: "crew",        label: "Crew",        sortKey: "people_capacity",        groupId: "capacity", defaultVisible: false },
  { key: "missiles",    label: "Missiles",    sortKey: "missile_storage",        groupId: "capacity", defaultVisible: false },
  { key: "drones",      label: "Drones",      sortKey: "drone_storage",          groupId: "capacity", defaultVisible: false },
  { key: "flares",      label: "Flares",      sortKey: "countermeasure_storage", groupId: "capacity", defaultVisible: false },
  { key: "deployables", label: "Deployables", sortKey: "deployable_storage",     groupId: "capacity", defaultVisible: false },
  { key: "dock_s", label: "S Dock",     sortKey: "dock_s",    groupId: "capacity", defaultVisible: false },
  { key: "dock_m", label: "M Dock",     sortKey: "dock_m",    groupId: "capacity", defaultVisible: false },
  { key: "bay_s",  label: "S Ship Cap", sortKey: "storage_s", groupId: "capacity", defaultVisible: false },
  { key: "bay_m",  label: "M Ship Cap", sortKey: "storage_m", groupId: "capacity", defaultVisible: false },
  // Value (Removed old price since it's now blueprint)
  // Slot groups
  { key: "wpn_s",  label: "Wpn S",  sortKey: "weapons_s",  groupId: "slots-weapons", defaultVisible: false },
  { key: "wpn_m",  label: "Wpn M",  sortKey: "weapons_m",  groupId: "slots-weapons", defaultVisible: false },
  { key: "wpn_l",  label: "Wpn L",  sortKey: "weapons_l",  groupId: "slots-weapons", defaultVisible: false },
  { key: "wpn_xl", label: "Wpn XL", sortKey: "weapons_xl", groupId: "slots-weapons", defaultVisible: false },
  { key: "tur_s",  label: "Tur S",  sortKey: "turrets_s",  groupId: "slots-turrets", defaultVisible: false },
  { key: "tur_m",  label: "Tur M",  sortKey: "turrets_m",  groupId: "slots-turrets", defaultVisible: false },
  { key: "tur_l",  label: "Tur L",  sortKey: "turrets_l",  groupId: "slots-turrets", defaultVisible: false },
  { key: "tur_xl", label: "Tur XL", sortKey: "turrets_xl", groupId: "slots-turrets", defaultVisible: false },
  { key: "shd_s",  label: "Shd S",  sortKey: "shields_s",  groupId: "slots-shields", defaultVisible: false },
  { key: "shd_m",  label: "Shd M",  sortKey: "shields_m",  groupId: "slots-shields", defaultVisible: false },
  { key: "shd_l",  label: "Shd L",  sortKey: "shields_l",  groupId: "slots-shields", defaultVisible: false },
  { key: "shd_xl", label: "Shd XL", sortKey: "shields_xl", groupId: "slots-shields", defaultVisible: false },
  { key: "eng_s",  label: "Eng S",  sortKey: "engines_s",  groupId: "slots-engines", defaultVisible: false },
  { key: "eng_m",  label: "Eng M",  sortKey: "engines_m",  groupId: "slots-engines", defaultVisible: false },
  { key: "eng_l",  label: "Eng L",  sortKey: "engines_l",  groupId: "slots-engines", defaultVisible: false },
  { key: "eng_xl", label: "Eng XL", sortKey: "engines_xl", groupId: "slots-engines", defaultVisible: false },
];

const DEFAULT_VISIBLE = new Set(
  ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
);
const STORAGE_KEY = "ships-table-columns";

// ── Column groups (in mockup display order) ───────────────────────────────────

const COLUMN_GROUPS: ColumnGroup[] = [
  { id: "classification", label: "Classification" },
  { id: "flight",         label: "Flight" },
  { id: "defense",        label: "Defense" },
  { id: "logi",           label: "Logi" },
  { id: "offense",        label: "Offense" },
  { id: "capacity",       label: "Capacity" },
  { id: "slots-weapons",  label: "Wpn Slots" },
  { id: "slots-turrets",  label: "Tur Slots" },
  { id: "slots-shields",  label: "Shd Slots" },
  { id: "slots-engines",  label: "Eng Slots" },
];

function formatDlc(dlc: string) {
  if (dlc === "base_game") return "Base Game";
  return dlc.charAt(0).toUpperCase() + dlc.slice(1) + " DLC";
}

function renderGroupHeaderContent(
  groupBy: string,
  groupKey: string,
  sampleShip: ShipSummary,
  factions: FactionSummary[]
) {
  if (groupBy === "class_id") {
    return <ShipClassBadge class_id={sampleShip.class_id} className="text-xs" />;
  }
  if (groupBy === "role" && sampleShip.role) {
    return <ShipTypeBadge role={sampleShip.role} className="text-xs px-2 py-0.5" />;
  }
  if (groupBy === "ship_type" && sampleShip.ship_type) {
    return (
      <ShipTypeBadge
        role={sampleShip.role}
        subtype={sampleShip.ship_type}
        className="text-xs px-2 py-0.5"
      />
    );
  }
  if (groupBy === "faction_id" && sampleShip.faction_id) {
    const faction = factions.find((f) => f.faction_id === sampleShip.faction_id);
    if (faction) {
      return (
        <div className="flex items-center gap-2">
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: faction.color_hex ?? "#888",
              flexShrink: 0,
            }}
          />
          <span className="font-medium text-sm text-foreground">
            {faction.name}
          </span>
        </div>
      );
    }
  }
  return (
    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
      {groupKey}
    </span>
  );
}

type SortKey =
  | "name" | "class_id" | "faction_id" | "restriction_licence"
  | "speed_max" | "travel_max" | "boost_max" | "accel_max"
  | "hull" | "shield_capacity_max" | "shield_recharge_max"
  | "cargo_volume" | "dps_max" | "range_max" | "radar_range"
  | "price_avg" | "role" | "ship_type"
  | "people_capacity" | "missile_storage" | "drone_storage"
  | "countermeasure_storage" | "deployable_storage"
  | "dock_s" | "dock_m" | "dock_l" | "dock_xl"
  | "storage_s" | "storage_m" | "storage_l" | "storage_xl"
  | "weapons_s" | "weapons_m" | "weapons_l" | "weapons_xl"
  | "turrets_s" | "turrets_m" | "turrets_l" | "turrets_xl"
  | "shields_s" | "shields_m" | "shields_l" | "shields_xl"
  | "engines_s" | "engines_m" | "engines_l" | "engines_xl";

type GroupByKey = "none" | "class_id" | "role" | "ship_type" | "faction_id" | "dlc";

export default function ShipsPage() {
  const { location } = useRouterState();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedFactions, setSelectedFactions] = useState<Set<string>>(new Set());
  const [selectedDlcs, setSelectedDlcs] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedSubTypes, setSelectedSubTypes] = useState<Set<string>>(new Set());
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [obtainableOnly, setObtainableOnly] = useState(false);
  const [selectedShip, setSelectedShip] = useState<ShipSummary | null>(null);
  const [sortCol, setSortCol] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");
  const [visibleColumns, setVisibleColumns] = useColumnVisibility(
    STORAGE_KEY,
    DEFAULT_VISIBLE
  );

  React.useEffect(() => {
    if (location.pathname !== "/ships") setSelectedShip(null);
  }, [location.pathname]);

  const isLinear = selectedClass !== null;

  const { data: ships = [], isLoading } = useQuery<ShipSummary[]>({
    queryKey: ["ships"],
    queryFn: () => apiGet<ShipSummary[]>("/api/v1/ships?limit=2000"),
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => apiGet<FactionSummary[]>("/api/v1/factions"),
  });

  const { data: knownFactions = {} } = useKnownFactions();

  const { data: playerLicences = [] } = usePlayerLicences();

  const factionMap = useFactionMap(factions);
  const licenceSet = useMemo(
    () => new Set(playerLicences.map((l) => `${l.faction_id}:${l.licence_type}`)),
    [playerLicences]
  );
  const licenceTypeSet = useMemo(
    () => new Set(playerLicences.map((l) => l.licence_type)),
    [playerLicences]
  );

  const globalLicences = useGlobalLicences(ships);

  const filtered = ships.filter((s) => {
    if (settings.fogOfWar && s.faction_id && knownFactions[s.faction_id] === false)
      return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    if (selectedClass && classShort(s.class_id) !== selectedClass) return false;
    if (
      selectedFactions.size > 0 &&
      (!s.faction_id || !selectedFactions.has(s.faction_id))
    )
      return false;
    if (selectedTypes.size > 0 && (!s.role || !selectedTypes.has(s.role)))
      return false;
    if (
      selectedTypes.size > 0 &&
      selectedSubTypes.size > 0 &&
      (!s.ship_type || !selectedSubTypes.has(s.ship_type))
    )
      return false;
    const dlcKey = s.dlc || "base_game";
    if (selectedDlcs.size > 0 && !selectedDlcs.has(dlcKey)) return false;
    if (ownedOnly && !s.is_owned) return false;
    if (obtainableOnly && !s.is_obtainable) return false;
    return true;
  });

  // Per-class maxima for linear scaling — computed from ALL ships of the selected
  // class (ignoring role/faction/search) so the ceiling stays stable while filtering.
  const classShips = isLinear
    ? ships.filter((s) => classShort(s.class_id) === selectedClass)
    : [];
  const classMaxSpeed  = isLinear ? Math.max(...classShips.map((s) => s.speed_max ?? 0), 1) : 0;
  const classMaxTravel = isLinear ? Math.max(...classShips.map((s) => s.travel_max ?? 0), 1) : 0;
  const classMaxBoost  = isLinear ? Math.max(...classShips.map((s) => s.boost_max ?? 0), 1) : 0;
  const classMaxAccel  = isLinear ? Math.max(...classShips.map((s) => s.accel_max ?? 0), 1) : 0;
  const classMaxHull   = isLinear ? Math.max(...classShips.map((s) => s.hull ?? 0), 1) : 0;
  const classMaxShield = isLinear ? Math.max(...classShips.map((s) => s.shield_capacity_max ?? 0), 1) : 0;
  const classMaxShieldRecharge = isLinear ? Math.max(...classShips.map((s) => s.shield_recharge_max ?? 0), 1) : 0;
  const classMaxCargo  = isLinear ? Math.max(...classShips.map((s) => s.cargo_volume ?? 0), 1) : 0;
  const classMaxDps    = isLinear ? Math.max(...classShips.map((s) => s.dps_max ?? 0), 1) : 0;
  const classMaxRange  = isLinear ? Math.max(...classShips.map((s) => s.range_max ?? 0), 1) : 0;
  const classMaxRadar  = isLinear ? Math.max(...classShips.map((s) => s.radar_range ?? 0), 1) : 0;

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    if (aVal === null && bVal !== null) return sortDesc ? 1 : -1;
    if (aVal !== null && bVal === null) return sortDesc ? -1 : 1;
    if (aVal === null && bVal === null) return 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      if (sortCol === "restriction_licence") {
        const fmt = (v: string) =>
          v === "generaluseship" || v === "generaluseequipment" ? "" : formatLicence(v);
        return sortDesc
          ? fmt(bVal).localeCompare(fmt(aVal))
          : fmt(aVal).localeCompare(fmt(bVal));
      }
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDesc ? bVal - aVal : aVal - bVal;
    }
    return 0;
  });

  const handleSort = (key: SortKey) => {
    if (sortCol === key) setSortDesc(!sortDesc);
    else { setSortCol(key); setSortDesc(false); }
  };

  const hasFilters =
    search ||
    selectedClass !== null ||
    selectedFactions.size > 0 ||
    selectedDlcs.size > 0 ||
    selectedTypes.size > 0 ||
    (selectedTypes.size > 0 && selectedSubTypes.size > 0) ||
    ownedOnly ||
    obtainableOnly;

  const availableSubTypes =
    selectedTypes.size > 0
      ? Array.from(
          new Set(
            ships
              .filter((s) => s.role && selectedTypes.has(s.role))
              .map((s) => s.ship_type)
              .filter(Boolean) as string[]
          )
        )
          .sort()
          .map((r) => {
            const matchingShip = ships.find(
              (s) => s.ship_type === r && s.role && selectedTypes.has(s.role)
            );
            const baseColor = getTypeColor(matchingShip?.role || "default");
            const textColor = baseColor.split(" ").find((c) => c.startsWith("text-"));
            return {
              value: r,
              label: r.charAt(0).toUpperCase() + r.slice(1),
              node: (
                <div className="flex items-center gap-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full bg-current opacity-50", textColor)} />
                  <span className="capitalize">{r}</span>
                </div>
              ),
            };
          })
      : [];

  // ── DataTable columns (memoized — render fns close over stat scaling values) ──

  const columns = useMemo<ColumnDef<ShipSummary>[]>(() => {
    function numCell(val: number | null | undefined) {
      if (val == null || val === 0)
        return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <span className="text-xs font-mono tabular-nums">
          {val.toLocaleString()}
        </span>
      );
    }

    function statBar(
      raw: number | null | undefined,
      maxConst: number,
      classMax: number,
      label: string
    ) {
      if (raw == null || raw === 0)
        return <span className="text-muted-foreground text-xs">—</span>;
      return (
        <StatBar
          value={isLinear ? raw : Math.log10(raw + 1)}
          max={isLinear ? classMax : Math.log10(maxConst + 1)}
          labelRight={label}
        />
      );
    }

    return [
      // ── Name (no groupId → rowSpan=2 in grouped header) ──
      {
        key: "name",
        label: "Name",
        sortKey: "name",
        align: "left",
        alwaysVisible: true,
        render: (ship) => (
          <span className="font-medium">
            {ship.name}
            {!ship.can_be_captured && (
              <span
                className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30"
                title="This ship can never be captured or owned by the player."
              >
                NPC Only
              </span>
            )}
          </span>
        ),
      },
      // ── Classification ──
      {
        key: "type",
        label: "Type",
        sortKey: "role",
        groupId: "classification",
        align: "left",
        render: (ship) =>
          ship.role || ship.ship_type ? (
            <ShipTypeBadge role={ship.role} subtype={ship.ship_type} className="text-xs" />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        key: "class",
        label: "Class",
        sortKey: "class_id",
        groupId: "classification",
        align: "left",
        render: (ship) => (
          <ShipClassBadge class_id={ship.class_id} className="text-sm" />
        ),
      },
      {
        key: "faction",
        label: "Faction",
        sortKey: "faction_id",
        groupId: "classification",
        align: "left",
        render: (ship) => {
          const faction = ship.faction_id
            ? factionMap.get(ship.faction_id)
            : undefined;
          return faction ? (
            <FactionBadge
              name={faction.name}
              color_hex={faction.color_hex}
              icon_url={faction.icon_url}
              faction_id={faction.faction_id}
            />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          );
        },
      },
      {
        key: "licence",
        label: "Licence",
        sortKey: "restriction_licence",
        groupId: "classification",
        align: "left",
        render: (ship) => {
          const lic = ship.restriction_licence;
          const hasRestriction =
            lic && lic !== "generaluseship" && lic !== "generaluseequipment";
          if (!hasRestriction)
            return <span className="text-muted-foreground text-xs">—</span>;
          const hasLicence = globalLicences.has(lic)
            ? licenceTypeSet.has(lic)
            : ship.faction_id
            ? licenceSet.has(`${ship.faction_id}:${lic}`)
            : false;
          return (
            <span
              className={cn(
                "text-xs cursor-default",
                hasLicence ? "text-emerald-400" : "text-red-400/80"
              )}
              title={
                hasLicence
                  ? `Licence owned (${formatLicence(lic)})`
                  : `Licence locked (requires ${formatLicence(lic)})`
              }
            >
              {formatLicence(lic)}
            </span>
          );
        },
      },
      {
        key: "price",
        label: "Blueprint",
        sortKey: "price_avg",
        groupId: "classification",
        align: "right",
        render: (ship) => {
          if (ship.has_blueprint) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-emerald-400" title={ship.price_avg ? `Blueprint owned · ${ship.price_avg.toLocaleString()} Cr` : "Blueprint owned"}>✓</span>
              </span>
            );
          }
          const lic = ship.restriction_licence;
          const hasRestriction = lic && lic !== "generaluseship" && lic !== "generaluseequipment";
          const hasLicence = !hasRestriction || (globalLicences.has(lic) ? licenceTypeSet.has(lic) : ship.faction_id ? licenceSet.has(`${ship.faction_id}:${lic}`) : false);
          const licenceLocked = !hasLicence;
          
          if (ship.price_avg && !licenceLocked) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-amber-400/80" title="Blueprint available for purchase">⊕</span>
                <Currency value={ship.price_avg} />
              </span>
            );
          }
          
          const isFreeDefault = !ship.price_avg && !licenceLocked && ship.is_obtainable;
          if (isFreeDefault) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-emerald-400/60" title="No blueprint required">—</span>
              </span>
            );
          }
          const reason = !ship.price_avg ? "Blueprint unobtainable" : "Blueprint locked behind licence";
          return (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-red-400/80" title={reason}>✗</span>
              {ship.price_avg ? <Currency value={ship.price_avg} /> : <span className="text-muted-foreground">—</span>}
            </span>
          );
        },
      },
      // ── Flight ──
      {
        key: "speed",
        label: "Speed",
        sortKey: "speed_max",
        groupId: "flight",
        align: "right",
        render: (ship) =>
          statBar(ship.speed_max, MAX_SPEED, classMaxSpeed, `${ship.speed_max?.toFixed(0) ?? "—"} m/s`),
      },
      {
        key: "travel",
        label: "Travel",
        sortKey: "travel_max",
        groupId: "flight",
        align: "right",
        render: (ship) =>
          statBar(ship.travel_max, MAX_TRAVEL, classMaxTravel, `${ship.travel_max?.toFixed(0) ?? "—"} m/s`),
      },
      {
        key: "boost",
        label: "Boost",
        sortKey: "boost_max",
        groupId: "flight",
        align: "right",
        render: (ship) =>
          statBar(ship.boost_max, MAX_BOOST, classMaxBoost, `${ship.boost_max?.toFixed(0) ?? "—"} m/s`),
      },
      {
        key: "accel",
        label: "Accel",
        sortKey: "accel_max",
        groupId: "flight",
        align: "right",
        render: (ship) =>
          statBar(ship.accel_max, MAX_ACCEL, classMaxAccel, `${ship.accel_max?.toFixed(1) ?? "—"} m/s²`),
      },
      // ── Defense ──
      {
        key: "hull",
        label: "Hull",
        sortKey: "hull",
        groupId: "defense",
        align: "right",
        render: (ship) =>
          statBar(ship.hull, MAX_HULL, classMaxHull, `${ship.hull?.toLocaleString() ?? "—"} HP`),
      },
      {
        key: "shield",
        label: "Shield",
        sortKey: "shield_capacity_max",
        groupId: "defense",
        align: "right",
        render: (ship) =>
          statBar(
            ship.shield_capacity_max,
            MAX_SHIELD,
            classMaxShield,
            `${ship.shield_capacity_max?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"} MJ`
          ),
      },
      {
        key: "regen",
        label: "Regen",
        sortKey: "shield_recharge_max",
        groupId: "defense",
        align: "right",
        render: (ship) =>
          statBar(
            ship.shield_recharge_max,
            MAX_SHIELD_RECHARGE,
            classMaxShieldRecharge,
            `${ship.shield_recharge_max?.toFixed(0) ?? "—"} MW/s`
          ),
      },
      // ── Logi ──
      {
        key: "cargo",
        label: "Cargo",
        sortKey: "cargo_volume",
        groupId: "logi",
        align: "right",
        render: (ship) =>
          statBar(ship.cargo_volume, MAX_CARGO, classMaxCargo, ship.cargo_volume?.toLocaleString() ?? "—"),
      },
      {
        key: "radar",
        label: "Radar",
        sortKey: "radar_range",
        groupId: "logi",
        align: "right",
        render: (ship) =>
          statBar(
            ship.radar_range,
            MAX_RADAR,
            classMaxRadar,
            `${ship.radar_range != null ? (ship.radar_range / 1000).toFixed(0) : "—"} km`
          ),
      },
      // ── Offense ──
      {
        key: "dps",
        label: "DPS",
        sortKey: "dps_max",
        groupId: "offense",
        align: "right",
        render: (ship) =>
          statBar(
            ship.dps_max,
            50000,
            classMaxDps,
            ship.dps_max?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—"
          ),
      },
      {
        key: "range",
        label: "Wpn Range",
        sortKey: "range_max",
        groupId: "offense",
        align: "right",
        render: (ship) =>
          statBar(
            ship.range_max,
            MAX_RANGE,
            classMaxRange,
            `${ship.range_max?.toFixed(1) ?? "—"} km`
          ),
      },
      // ── Capacity ──
      {
        key: "crew",
        label: "Crew",
        sortKey: "people_capacity",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.people_capacity),
      },
      {
        key: "missiles",
        label: "Missiles",
        sortKey: "missile_storage",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.missile_storage),
      },
      {
        key: "drones",
        label: "Drones",
        sortKey: "drone_storage",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.drone_storage),
      },
      {
        key: "flares",
        label: "Flares",
        sortKey: "countermeasure_storage",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.countermeasure_storage),
      },
      {
        key: "deployables",
        label: "Deployables",
        sortKey: "deployable_storage",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.deployable_storage),
      },
      {
        key: "dock_s",
        label: "S Dock",
        sortKey: "dock_s",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.dock_s),
      },
      {
        key: "dock_m",
        label: "M Dock",
        sortKey: "dock_m",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.dock_m),
      },
      {
        key: "bay_s",
        label: "S Ship Cap",
        sortKey: "storage_s",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.storage_s),
      },
      {
        key: "bay_m",
        label: "M Ship Cap",
        sortKey: "storage_m",
        groupId: "capacity",
        align: "right",
        render: (ship) => numCell(ship.storage_m),
      },
      // ── Slot columns ──
      ...([
        ["wpn_s",  "Wpn S",  "weapons_s",  "slots-weapons"],
        ["wpn_m",  "Wpn M",  "weapons_m",  "slots-weapons"],
        ["wpn_l",  "Wpn L",  "weapons_l",  "slots-weapons"],
        ["wpn_xl", "Wpn XL", "weapons_xl", "slots-weapons"],
        ["tur_s",  "Tur S",  "turrets_s",  "slots-turrets"],
        ["tur_m",  "Tur M",  "turrets_m",  "slots-turrets"],
        ["tur_l",  "Tur L",  "turrets_l",  "slots-turrets"],
        ["tur_xl", "Tur XL", "turrets_xl", "slots-turrets"],
        ["shd_s",  "Shd S",  "shields_s",  "slots-shields"],
        ["shd_m",  "Shd M",  "shields_m",  "slots-shields"],
        ["shd_l",  "Shd L",  "shields_l",  "slots-shields"],
        ["shd_xl", "Shd XL", "shields_xl", "slots-shields"],
        ["eng_s",  "Eng S",  "engines_s",  "slots-engines"],
        ["eng_m",  "Eng M",  "engines_m",  "slots-engines"],
        ["eng_l",  "Eng L",  "engines_l",  "slots-engines"],
        ["eng_xl", "Eng XL", "engines_xl", "slots-engines"],
      ] as const).map(
        ([key, label, statKey, groupId]): ColumnDef<ShipSummary> => ({
          key,
          label,
          sortKey: statKey,
          groupId,
          align: "right",
          render: (ship) => numCell(ship[statKey as keyof ShipSummary] as number),
        })
      ),
    ];
  }, [
    isLinear,
    classMaxSpeed, classMaxTravel, classMaxBoost, classMaxAccel,
    classMaxHull, classMaxShield, classMaxShieldRecharge,
    classMaxCargo, classMaxDps, classMaxRange, classMaxRadar,
    factionMap, globalLicences, licenceSet, licenceTypeSet,
  ]);

  // ── Row groups (when groupBy != "none") ──────────────────────────────────────

  const rowGroups = useMemo<RowGroup<ShipSummary>[] | undefined>(() => {
    if (groupBy === "none") return undefined;

    const groups: Record<string, ShipSummary[]> = {};
    sorted.forEach((ship) => {
      let key = "";
      if (groupBy === "dlc") key = formatDlc(ship.dlc || "base_game");
      else if (groupBy === "class_id") key = classShort(ship.class_id);
      else if (groupBy === "role")
        key = ship.role
          ? ship.role.charAt(0).toUpperCase() + ship.role.slice(1)
          : "Unknown";
      else if (groupBy === "ship_type")
        key = ship.ship_type
          ? ship.ship_type.charAt(0).toUpperCase() + ship.ship_type.slice(1)
          : "Unknown";
      else if (groupBy === "faction_id")
        key = ship.faction_id
          ? (factionMap.get(ship.faction_id)?.name || ship.faction_id)
          : "No Faction";
      if (!groups[key]) groups[key] = [];
      groups[key].push(ship);
    });

    const orderedKeys = Object.keys(groups).sort((a, b) => {
      if (groupBy === "class_id") {
        const order = ["XS", "S", "M", "L", "XL"];
        return order.indexOf(a) - order.indexOf(b);
      }
      return a.localeCompare(b);
    });

    return orderedKeys.map((key) => ({
      key,
      label: renderGroupHeaderContent(groupBy, key, groups[key][0], factions),
      rows: groups[key],
    }));
  }, [sorted, groupBy, factionMap, factions]);

  const toggleClass = (cls: string) => {
    setSelectedClass((prev) => (prev === cls ? null : cls));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Ships</h1>
        <PageSubtitle className="flex items-center">
          <span>
            {ships.length} ships in catalog
            {filtered.length !== ships.length && ` · ${filtered.length} matching`}
          </span>
        </PageSubtitle>
      </div>

      <FilterBar
        secondRow={
          <div className="flex items-center gap-2">
            <div className={cn("w-1.5 h-1.5 rounded-[2px]", isLinear ? "bg-amber-400/80" : "bg-primary/70")} />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {isLinear
                ? `Linear scale · comparing within ${selectedClass} class`
                : "Log scale · compares across all sizes"}
            </span>
          </div>
        }
      >
        {/* Search */}
        <SearchInput
          placeholder="Search ships…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />

        {/* Class pills */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedClass(null)}
            className={cn(
              "h-7 px-3 text-xs rounded-[4px] font-medium transition-colors",
              selectedClass === null
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-transparent text-muted-foreground hover:bg-muted/50 border-input"
            )}
          >
            All
          </Button>
          {CLASSES.map((cls) => {
            const isSelected = selectedClass === cls;
            const baseColor = getClassColor(`ship_${cls.toLowerCase()}`);
            const textColor = baseColor.split(" ").find((c) => c.startsWith("text-"));
            return (
              <Button
                key={cls}
                variant="outline"
                size="sm"
                onClick={() => toggleClass(cls)}
                className={cn(
                  "h-7 px-2.5 text-xs flex items-center gap-1.5 rounded-[4px] font-medium transition-colors",
                  isSelected
                    ? cn(baseColor)
                    : "bg-transparent text-muted-foreground hover:bg-muted/50 border-input"
                )}
              >
                <div className={cn("w-1.5 h-1.5 rounded-[2px] bg-current", textColor)} />
                {cls}
              </Button>
            );
          })}
        </div>

        {/* Factions */}
        <MultiSelect
          options={factions.map((f) => ({
            value: f.faction_id,
            label: f.name,
            node: (
              <FactionBadge
                name={f.name}
                color_hex={f.color_hex}
                icon_url={f.icon_url}
                size="sm"
                className="font-normal"
              />
            ),
          }))}
          selected={selectedFactions}
          onChange={setSelectedFactions}
          placeholder="Factions..."
          className="h-7 text-xs text-muted-foreground bg-transparent w-36"
        />

        {/* Roles */}
        <MultiSelect
          options={Array.from(
            new Set(ships.map((s) => s.role).filter(Boolean) as string[])
          )
            .sort()
            .map((r) => {
              const baseColor = getTypeColor(r);
              const textColor = baseColor.split(" ").find((c) => c.startsWith("text-"));
              return {
                value: r,
                label: r.charAt(0).toUpperCase() + r.slice(1),
                node: (
                  <div className="flex items-center gap-2">
                    <div className={cn("w-1.5 h-1.5 rounded-full bg-current", textColor)} />
                    <span className="capitalize">{r}</span>
                  </div>
                ),
              };
            })}
          selected={selectedTypes}
          onChange={setSelectedTypes}
          placeholder="Roles..."
          className="h-7 text-xs text-muted-foreground bg-transparent w-32"
        />

        {/* Sub-types (conditional) */}
        {selectedTypes.size > 0 && availableSubTypes.length > 0 && (
          <MultiSelect
            options={availableSubTypes}
            selected={selectedSubTypes}
            onChange={setSelectedSubTypes}
            placeholder="Types..."
            className="h-7 text-xs text-muted-foreground bg-transparent w-32"
          />
        )}

        {/* Expansions */}
        <MultiSelect
          options={Array.from(new Set(ships.map((s) => s.dlc || "base_game")))
            .sort()
            .map((d) => ({ value: d, label: formatDlc(d) }))}
          selected={selectedDlcs}
          onChange={setSelectedDlcs}
          placeholder="Expansions..."
          className="h-7 text-xs text-muted-foreground bg-transparent w-36"
        />

        {/* Toggles */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="owned-only" checked={ownedOnly} onCheckedChange={setOwnedOnly} />
            <label htmlFor="owned-only" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Owned Only
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="obtainable-only" checked={obtainableOnly} onCheckedChange={setObtainableOnly} />
            <label htmlFor="obtainable-only" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Obtainable
            </label>
          </div>
        </div>

        {/* Clear */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setSelectedClass(null);
              setSelectedFactions(new Set());
              setSelectedDlcs(new Set());
              setSelectedTypes(new Set());
              setSelectedSubTypes(new Set());
              setOwnedOnly(false);
              setObtainableOnly(false);
            }}
            className="h-7 text-xs text-muted-foreground"
          >
            Clear
          </Button>
        )}

        {/* Right: column visibility + group-by */}
        <div className="ml-auto flex items-center gap-3">
          <div className="h-5 w-px bg-border/50" />
          <MultiSelect
            options={ALL_COLUMNS.map((c) => ({
              value: c.key,
              label: c.label,
              group: c.groupId,
            }))}
            selected={visibleColumns}
            onChange={setVisibleColumns}
            placeholder="Columns..."
            className="h-7 text-xs text-muted-foreground bg-transparent w-36"
            searchable
            hideClear
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              Group By
            </span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByKey)}>
              <SelectTrigger className="w-24 h-7 text-xs text-muted-foreground bg-transparent border-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="class_id">Class</SelectItem>
                <SelectItem value="role">Type</SelectItem>
                <SelectItem value="faction_id">Faction</SelectItem>
                <SelectItem value="dlc">Expansion</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </FilterBar>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-2 flex flex-col min-h-0">
        <HUDCard className="h-full">
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <PageLoaderPreset preset="ships" />
            ) : (
              <DataTable
                key={groupBy}
                columns={columns}
                columnGroups={COLUMN_GROUPS}
                rows={rowGroups ? undefined : sorted}
                rowGroups={rowGroups}
                getRowKey={(ship) => ship.ship_id}
                sortKey={sortCol}
                sortDir={sortDesc ? "desc" : "asc"}
                onSortChange={(k) => handleSort(k as SortKey)}
                visibleColumns={visibleColumns}
                onRowClick={setSelectedShip}
                onRowHover={(ship) =>
                  queryClient.prefetchQuery({
                    queryKey: ["ship", ship.ship_id],
                    queryFn: () => apiGet(`/api/v1/ships/${ship.ship_id}`),
                    staleTime: 5 * 60_000,
                  })
                }
                rowPrefix={(ship) => (
                  <EntityIcon src={ship.icon_url} alt={ship.name} size={28} />
                )}
                rowSuffix={(ship) => (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    title="Build loadout"
                    asChild
                  >
                    <Link
                      to="/ships/builder"
                      search={{ ship_id: ship.ship_id }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Wrench className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                suffixHeader={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center cursor-help">
                        <Info className="h-3.5 w-3.5 text-sky-400/80 hover:text-sky-400 transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent
                      side="left"
                      className="max-w-64 text-xs leading-relaxed"
                    >
                      <p>
                        Stat bars show each ship&rsquo;s{" "}
                        <strong>theoretical maximum</strong> with the best
                        available equipment for its class.
                      </p>
                      {isLinear ? (
                        <p className="mt-1">
                          Currently <strong>linear</strong> &mdash; comparing
                          ships within the selected class.
                        </p>
                      ) : (
                        <p className="mt-1">
                          Currently <strong>logarithmic</strong> &mdash;
                          comparing across all classes.
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                }
                rowClassName="h-14"
                emptyMessage="No ships match your filters."
              />
            )}
          </div>
        </HUDCard>
      </div>

      <DetailDialog
        open={selectedShip !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedShip(null);
        }}
        title={selectedShip?.name ?? "Ship details"}
        description={`Detailed stats for ${selectedShip?.name}`}
      >
        {selectedShip && (
          <ShipDetailPanel
            shipId={selectedShip.ship_id}
            factions={factions}
          />
        )}
      </DetailDialog>
    </div>
  );
}
