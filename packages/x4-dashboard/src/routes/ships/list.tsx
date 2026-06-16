import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useSettings } from "../../lib/settingsStore";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Info, Wrench, Search } from "lucide-react";
import { MultiSelect } from "../../components/ui/multi-select";
import { EntityIcon } from "../../components/EntityIcon";
import { FactionBadge } from "../../components/FactionBadge";
import { StatBar } from "../../components/StatBar";
import { Currency } from "../../components/Currency";
import { classShort, getClassColor, getTypeColor, formatLicence } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import type { FactionSummary } from '../../lib/map/types';
import { ShipClassBadge, ShipTypeBadge, ShipSubtypeBadge } from "../../components/ShipBadges";
import { Button } from "../../components/ui/button";
import { ShipDetailPanel } from "../../components/ShipDetailPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

import { Input } from "../../components/ui/input";
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
import { HUDCard } from "../../components/HUDCard";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

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

// ── Column definitions ────────────────────────────────────────────────────────

type ColumnMeta = {
  key: string;
  label: string;
  sortKey?: string;       // undefined = not sortable
  category: string;
  defaultVisible: boolean;
  leftAlign?: boolean;    // badge columns float left; stat columns float right
};

const ALL_COLUMNS: ColumnMeta[] = [
  // Info
  { key: "type",    label: "Type",    sortKey: "role",       category: "Info",     defaultVisible: true,  leftAlign: true },
  { key: "class",   label: "Class",   sortKey: "class_id",   category: "Info",     defaultVisible: true,  leftAlign: true },
  { key: "faction", label: "Faction", sortKey: "faction_id", category: "Info",     defaultVisible: true,  leftAlign: true },
  { key: "licence", label: "Licence", sortKey: "restriction_licence", category: "Info", defaultVisible: false, leftAlign: true },
  // Flight
  { key: "speed",  label: "Speed",  sortKey: "speed_max",  category: "Flight",  defaultVisible: true  },
  { key: "travel", label: "Travel", sortKey: "travel_max", category: "Flight",  defaultVisible: true  },
  { key: "boost",  label: "Boost",  sortKey: "boost_max",  category: "Flight",  defaultVisible: false },
  { key: "accel",  label: "Accel",  sortKey: "accel_max",  category: "Flight",  defaultVisible: false },
  // Defense
  { key: "hull",   label: "Hull",   sortKey: "hull",                  category: "Defense", defaultVisible: true  },
  { key: "shield", label: "Shield", sortKey: "shield_capacity_max",   category: "Defense", defaultVisible: true  },
  { key: "regen",  label: "Regen",  sortKey: "shield_recharge_max",   category: "Defense", defaultVisible: false },
  // Logistics
  { key: "cargo",  label: "Cargo",  sortKey: "cargo_volume", category: "Logistics", defaultVisible: false },
  { key: "radar",  label: "Radar",  sortKey: "radar_range",  category: "Logistics", defaultVisible: false },
  // Offense
  { key: "dps",    label: "DPS",       sortKey: "dps_max",    category: "Offense", defaultVisible: true  },
  { key: "range",  label: "Wpn Range", sortKey: "range_max",  category: "Offense", defaultVisible: false },
  // Economy
  { key: "price",  label: "Price",  sortKey: "price_avg", category: "Economy", defaultVisible: true  },
  // Crew & Storage
  { key: "crew",        label: "Crew",        sortKey: "people_capacity",        category: "Crew & Storage", defaultVisible: false },
  { key: "missiles",    label: "Missiles",    sortKey: "missile_storage",        category: "Crew & Storage", defaultVisible: false },
  { key: "drones",      label: "Drones",      sortKey: "drone_storage",          category: "Crew & Storage", defaultVisible: false },
  { key: "flares",      label: "Flares",      sortKey: "countermeasure_storage", category: "Crew & Storage", defaultVisible: false },
  { key: "deployables", label: "Deployables", sortKey: "deployable_storage",     category: "Crew & Storage", defaultVisible: false },
  // Docking
  { key: "dock_s", label: "S Dock",      sortKey: "dock_s",     category: "Carrier", defaultVisible: false },
  { key: "dock_m", label: "M Dock",      sortKey: "dock_m",     category: "Carrier", defaultVisible: false },
  { key: "bay_s",  label: "S Ship Cap",  sortKey: "storage_s",  category: "Carrier", defaultVisible: false },
  { key: "bay_m",  label: "M Ship Cap",  sortKey: "storage_m",  category: "Carrier", defaultVisible: false },
  // Equipment slots
  { key: "wpn_s",  label: "Wpn S", sortKey: "weapons_s",  category: "Slots · Weapons", defaultVisible: false },
  { key: "wpn_m",  label: "Wpn M", sortKey: "weapons_m",  category: "Slots · Weapons", defaultVisible: false },
  { key: "wpn_l",  label: "Wpn L", sortKey: "weapons_l",  category: "Slots · Weapons", defaultVisible: false },
  { key: "wpn_xl", label: "Wpn XL", sortKey: "weapons_xl", category: "Slots · Weapons", defaultVisible: false },
  { key: "tur_s",  label: "Tur S", sortKey: "turrets_s",  category: "Slots · Turrets", defaultVisible: false },
  { key: "tur_m",  label: "Tur M", sortKey: "turrets_m",  category: "Slots · Turrets", defaultVisible: false },
  { key: "tur_l",  label: "Tur L", sortKey: "turrets_l",  category: "Slots · Turrets", defaultVisible: false },
  { key: "tur_xl", label: "Tur XL", sortKey: "turrets_xl", category: "Slots · Turrets", defaultVisible: false },
  { key: "shd_s",  label: "Shd S", sortKey: "shields_s",  category: "Slots · Shields", defaultVisible: false },
  { key: "shd_m",  label: "Shd M", sortKey: "shields_m",  category: "Slots · Shields", defaultVisible: false },
  { key: "shd_l",  label: "Shd L", sortKey: "shields_l",  category: "Slots · Shields", defaultVisible: false },
  { key: "shd_xl", label: "Shd XL", sortKey: "shields_xl", category: "Slots · Shields", defaultVisible: false },
  { key: "eng_s",  label: "Eng S", sortKey: "engines_s",  category: "Slots · Engines", defaultVisible: false },
  { key: "eng_m",  label: "Eng M", sortKey: "engines_m",  category: "Slots · Engines", defaultVisible: false },
  { key: "eng_l",  label: "Eng L", sortKey: "engines_l",  category: "Slots · Engines", defaultVisible: false },
  { key: "eng_xl", label: "Eng XL", sortKey: "engines_xl", category: "Slots · Engines", defaultVisible: false },
];

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
const STORAGE_KEY = "ships-table-columns";

function formatDlc(dlc: string) {
  if (dlc === "base_game") return "Base Game";
  return dlc.charAt(0).toUpperCase() + dlc.slice(1) + " DLC";
}

function renderGroupHeaderContent(groupBy: string, groupKey: string, sampleShip: ShipSummary, factions: FactionSummary[]) {
  if (groupBy === "class_id") {
    return <ShipClassBadge class_id={sampleShip.class_id} className="text-xs" />;
  }
  if (groupBy === "role" && sampleShip.role) {
    return <ShipTypeBadge role={sampleShip.role} className="text-xs px-2 py-0.5" />;
  }
  if (groupBy === "ship_type" && sampleShip.ship_type) {
    return <ShipTypeBadge role={sampleShip.role} subtype={sampleShip.ship_type} className="text-xs px-2 py-0.5" />;
  }
  if (groupBy === "faction_id" && sampleShip.faction_id) {
    const faction = factions.find(f => f.faction_id === sampleShip.faction_id);
    if (faction) {
      return (
        <div className="flex items-center gap-2">
          <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: faction.color_hex ?? "#888", flexShrink: 0 }} />
          <span className="font-medium text-sm text-foreground">{faction.name}</span>
        </div>
      );
    }
  }
  return <span className="text-xs font-semibold text-foreground uppercase tracking-wider">{groupKey}</span>;
}

export default function ShipsPage() {
  const { location } = useRouterState();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch {}
    return DEFAULT_VISIBLE;
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visibleColumns]));
  }, [visibleColumns]);
  const [selectedFactions, setSelectedFactions] = useState<Set<string>>(new Set());
  const [selectedDlcs, setSelectedDlcs] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedSubTypes, setSelectedSubTypes] = useState<Set<string>>(new Set());
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [obtainableOnly, setObtainableOnly] = useState(false);
  const [selectedShip, setSelectedShip] = useState<ShipSummary | null>(null);
  
  useEffect(() => {
    if (location.pathname !== "/ships") {
      setSelectedShip(null);
    }
  }, [location.pathname]);

  // State to track which groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // When a single class is selected, switch to per-class linear scaling
  const isLinear = selectedClass !== null;

  type SortKey = "name" | "class_id" | "faction_id" | "restriction_licence" | "speed_max" | "travel_max" | "boost_max" | "accel_max" | "hull" | "shield_capacity_max" | "shield_recharge_max" | "cargo_volume" | "dps_max" | "range_max" | "radar_range" | "price_avg" | "role" | "ship_type" | "people_capacity" | "missile_storage" | "drone_storage" | "countermeasure_storage" | "deployable_storage" | "dock_s" | "dock_m" | "dock_l" | "dock_xl" | "storage_s" | "storage_m" | "storage_l" | "storage_xl" | "weapons_s" | "weapons_m" | "weapons_l" | "weapons_xl" | "turrets_s" | "turrets_m" | "turrets_l" | "turrets_xl" | "shields_s" | "shields_m" | "shields_l" | "shields_xl" | "engines_s" | "engines_m" | "engines_l" | "engines_xl";
  const [sortCol, setSortCol] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);

  type GroupByKey = "none" | "class_id" | "role" | "ship_type" | "faction_id" | "dlc";
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");

  const { data: ships = [], isLoading } = useQuery<ShipSummary[]>({
    queryKey: ["ships"],
    queryFn: () => fetch("/api/v1/ships?limit=2000").then((r) => r.json()),
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  const { data: knownFactions = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["factions-known"],
    queryFn: () => fetch("/api/v1/factions/known").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: playerLicences = [] } = useQuery<{ licence_type: string; faction_id: string }[]>({
    queryKey: ["player-licences"],
    queryFn: () => fetch("/api/v1/player/licences").then((r) => r.json()),
    staleTime: 60_000,
  });

  const factionMap = new Map(factions.map((f) => [f.faction_id, f]));
  const licenceSet = new Set(playerLicences.map(l => `${l.faction_id}:${l.licence_type}`));
  const licenceTypeSet = new Set(playerLicences.map(l => l.licence_type));

  // Story/DLC licences appear on ≤2 factions and are effectively global
  const globalLicences = useMemo(() => {
    const count = new Map<string, Set<string>>();
    for (const s of ships) {
      const lic = s.restriction_licence;
      if (lic && lic !== "generaluseship" && lic !== "generaluseequipment" && s.faction_id) {
        if (!count.has(lic)) count.set(lic, new Set());
        count.get(lic)!.add(s.faction_id);
      }
    }
    return new Set([...count].filter(([, fids]) => fids.size <= 2).map(([lic]) => lic));
  }, [ships]);

  const filtered = ships.filter((s) => {
    // Fog of war: hide ships from unknown factions
    if (settings.fogOfWar && s.faction_id && knownFactions[s.faction_id] === false) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedClass && classShort(s.class_id) !== selectedClass) return false;
    if (selectedFactions.size > 0 && (!s.faction_id || !selectedFactions.has(s.faction_id))) return false;
    if (selectedTypes.size > 0 && (!s.role || !selectedTypes.has(s.role))) return false;
    if (selectedTypes.size > 0 && selectedSubTypes.size > 0 && (!s.ship_type || !selectedSubTypes.has(s.ship_type))) return false;
    
    const dlcKey = s.dlc || "base_game";
    if (selectedDlcs.size > 0 && !selectedDlcs.has(dlcKey)) return false;
    
    if (ownedOnly && !s.is_owned) return false;
    if (obtainableOnly && !s.is_obtainable) return false;

    return true;
  });

  // Per-class maxes for linear bar scaling — computed from ALL ships of the
  // selected class (ignoring role/faction/search filters) so the ceiling is stable.
  const classShips = isLinear
    ? ships.filter(s => classShort(s.class_id) === selectedClass)
    : [];
  const classMaxSpeed = isLinear ? Math.max(...classShips.map(s => s.speed_max ?? 0), 1) : 0;
  const classMaxTravel = isLinear ? Math.max(...classShips.map(s => s.travel_max ?? 0), 1) : 0;
  const classMaxBoost = isLinear ? Math.max(...classShips.map(s => s.boost_max ?? 0), 1) : 0;
  const classMaxAccel = isLinear ? Math.max(...classShips.map(s => s.accel_max ?? 0), 1) : 0;
  const classMaxHull = isLinear ? Math.max(...classShips.map(s => s.hull ?? 0), 1) : 0;
  const classMaxShield = isLinear ? Math.max(...classShips.map(s => s.shield_capacity_max ?? 0), 1) : 0;
  const classMaxShieldRecharge = isLinear ? Math.max(...classShips.map(s => s.shield_recharge_max ?? 0), 1) : 0;
  const classMaxCargo = isLinear ? Math.max(...classShips.map(s => s.cargo_volume ?? 0), 1) : 0;
  const classMaxDps = isLinear ? Math.max(...classShips.map(s => s.dps_max ?? 0), 1) : 0;
  const classMaxRange = isLinear ? Math.max(...classShips.map(s => s.range_max ?? 0), 1) : 0;
  const classMaxRadar = isLinear ? Math.max(...classShips.map(s => s.radar_range ?? 0), 1) : 0;

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    
    if (aVal === null && bVal !== null) return sortDesc ? 1 : -1;
    if (aVal !== null && bVal === null) return sortDesc ? -1 : 1;
    if (aVal === null && bVal === null) return 0;
    
    if (typeof aVal === "string" && typeof bVal === "string") {
      // For licence, sort by display-friendly name, with no-licence grouped together
      if (sortCol === "restriction_licence") {
        const fmt = (v: string) => {
          if (v === "generaluseship" || v === "generaluseequipment") return "";
          return formatLicence(v);
        };
        const aFmt = fmt(aVal);
        const bFmt = fmt(bVal);
        return sortDesc ? bFmt.localeCompare(aFmt) : aFmt.localeCompare(bFmt);
      }
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDesc ? bVal - aVal : aVal - bVal;
    }
    return 0;
  });

  const groupedShips = (() => {
    if (groupBy === "none") return { "": sorted };
    const groups: Record<string, ShipSummary[]> = {};
    sorted.forEach(ship => {
      let key = "";
      if (groupBy === "dlc") key = formatDlc(ship.dlc || "base_game");
      else if (groupBy === "class_id") key = classShort(ship.class_id);
      else if (groupBy === "role") key = ship.role ? ship.role.charAt(0).toUpperCase() + ship.role.slice(1) : "Unknown";
      else if (groupBy === "ship_type") key = ship.ship_type ? ship.ship_type.charAt(0).toUpperCase() + ship.ship_type.slice(1) : "Unknown";
      else if (groupBy === "faction_id") key = ship.faction_id ? (factionMap.get(ship.faction_id)?.name || ship.faction_id) : "No Faction";
      
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

    const orderedGroups: Record<string, ShipSummary[]> = {};
    orderedKeys.forEach(k => orderedGroups[k] = groups[k]);
    return orderedGroups;
  })();

  const toggleClass = (cls: string) => {
    setSelectedClass((prev) => prev === cls ? null : cls);
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortCol === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(key);
      setSortDesc(false);
    }
  };

  const hasFilters = search || selectedClass !== null || selectedFactions.size > 0 || selectedDlcs.size > 0 || selectedTypes.size > 0 || (selectedTypes.size > 0 && selectedSubTypes.size > 0) || ownedOnly || obtainableOnly;

  const availableSubTypes = selectedTypes.size > 0 
    ? Array.from(new Set(
        ships
          .filter(s => s.role && selectedTypes.has(s.role))
          .map(s => s.ship_type)
          .filter(Boolean) as string[]
      )).sort().map(r => {
        const matchingShip = ships.find(s => s.ship_type === r && s.role && selectedTypes.has(s.role));
        const baseColor = getTypeColor(matchingShip?.role || "default");
        const textColor = baseColor.split(' ').find(c => c.startsWith('text-'));
        return { 
          value: r, 
          label: r.charAt(0).toUpperCase() + r.slice(1),
          node: (
            <div className="flex items-center gap-2">
              <div className={cn("w-1.5 h-1.5 rounded-full bg-current opacity-50", textColor)} />
              <span className="capitalize">{r}</span>
            </div>
          )
        };
      })
    : [];


  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Ships</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold flex items-center">
          <span>{ships.length} ships in catalog{filtered.length !== ships.length && ` · ${filtered.length} matching`}</span>
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-0 flex flex-col">
        <HUDCard className="h-full">

          <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border/50 bg-muted/5 relative z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search ships…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 bg-muted/50 border-input focus-visible:ring-1 focus-visible:ring-primary/50 pl-9"
              />
            </div>

            <div className="flex -space-x-px">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedClass(null)}
                className={cn(
                  "h-8 px-4 text-xs rounded-r-none border focus:z-10 font-medium transition-colors",
                  selectedClass === null 
                    ? "bg-accent text-accent-foreground border-accent z-10" 
                    : "bg-transparent text-muted-foreground hover:bg-muted/50 border-input"
                )}
              >
                All
              </Button>
              {CLASSES.map((cls, idx) => {
                const isSelected = selectedClass === cls;
                const isLast = idx === CLASSES.length - 1;
                const baseColor = getClassColor(`ship_${cls.toLowerCase()}`);
                const textColor = baseColor.split(' ').find(c => c.startsWith('text-'));

                return (
                  <Button
                    key={cls}
                    variant="outline"
                    size="sm"
                    onClick={() => toggleClass(cls)}
                    className={cn(
                      "h-8 px-3 text-xs flex items-center gap-2 rounded-none border focus:z-10 transition-colors",
                      isLast && "rounded-r-md",
                      isSelected 
                        ? cn(baseColor, "z-10")
                        : "bg-transparent text-muted-foreground hover:bg-muted/50 border-input"
                    )}
                  >
                    <div className={cn("w-1.5 h-1.5 bg-current", textColor)} />
                    {cls}
                  </Button>
                );
              })}
            </div>

            <div className="w-48">
              <MultiSelect
                options={factions.map(f => ({
                  value: f.faction_id,
                  label: f.name,
                  node: <FactionBadge name={f.name} color_hex={f.color_hex} icon_url={f.icon_url} size="sm" className="font-normal" />
                }))}
                selected={selectedFactions}
                onChange={setSelectedFactions}
                placeholder="Factions..."
                className="h-8 text-xs text-muted-foreground bg-transparent"
              />
            </div>

            <div className="w-48">
              <MultiSelect
                options={Array.from(new Set(ships.map(s => s.role).filter(Boolean) as string[])).sort().map(r => {
                  const baseColor = getTypeColor(r);
                  const textColor = baseColor.split(' ').find(c => c.startsWith('text-'));
                  return { 
                    value: r, 
                    label: r.charAt(0).toUpperCase() + r.slice(1),
                    node: (
                      <div className="flex items-center gap-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full bg-current", textColor)} />
                        <span>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                      </div>
                    )
                  };
                })}
                selected={selectedTypes}
                onChange={setSelectedTypes}
                placeholder="Roles..."
                className="h-8 text-xs text-muted-foreground bg-transparent"
              />
            </div>

            {selectedTypes.size > 0 && availableSubTypes.length > 0 && (
              <div className="w-48">
                <MultiSelect
                  options={availableSubTypes}
                  selected={selectedSubTypes}
                  onChange={setSelectedSubTypes}
                  placeholder="Types..."
                  className="h-8 text-xs text-muted-foreground bg-transparent"
                />
              </div>
            )}

            <div className="w-56">
              <MultiSelect
                options={Array.from(new Set(ships.map(s => s.dlc || "base_game"))).sort().map(d => ({ value: d, label: formatDlc(d) }))}
                selected={selectedDlcs}
                onChange={setSelectedDlcs}
                placeholder="Expansions..."
                className="h-8 text-xs text-muted-foreground bg-transparent"
              />
            </div>

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
                className="h-8 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            )}

            <div className="ml-auto flex items-center gap-4">
              <div className="h-6 w-px bg-border/50" />

              <div className="w-44">
                <MultiSelect
                  options={ALL_COLUMNS.map(c => ({ value: c.key, label: c.label, group: c.category }))}
                  selected={visibleColumns}
                  onChange={setVisibleColumns}
                  placeholder="Columns..."
                  className="h-8 text-xs text-muted-foreground bg-transparent"
                  searchable
                  hideClear
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Group By</span>
                <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as GroupByKey); setCollapsedGroups(new Set()); }}>
                  <SelectTrigger className="w-28 h-8 text-xs text-muted-foreground bg-transparent border-transparent">
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
          </div>

      <div className="flex-1 overflow-auto px-6">
        {(() => {
          const activeColumns = ALL_COLUMNS.filter(c => visibleColumns.has(c.key) && c.key !== "price")
            .concat(visibleColumns.has("price") ? [ALL_COLUMNS.find(c => c.key === "price")!] : []);

          function renderColumnCell(col: ColumnMeta, ship: ShipSummary, faction: FactionSummary | undefined) {
            const cls = col.leftAlign ? "" : "text-right";
            switch (col.key) {
              case "type":
                return (
                  <TableCell key={col.key}>
                    {ship.role || ship.ship_type ? (
                      <ShipTypeBadge role={ship.role} subtype={ship.ship_type} className="text-xs" />
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "class":
                return (
                  <TableCell key={col.key}>
                    <ShipClassBadge class_id={ship.class_id} className="text-sm" />
                  </TableCell>
                );
              case "faction":
                return (
                  <TableCell key={col.key}>
                    {faction ? (
                      <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "licence": {
                const lic = ship.restriction_licence;
                const hasRestriction = lic && lic !== "generaluseship" && lic !== "generaluseequipment";
                const hasLicence = lic
                  ? (globalLicences.has(lic)
                      ? licenceTypeSet.has(lic)
                      : (ship.faction_id ? licenceSet.has(`${ship.faction_id}:${lic}`) : false))
                  : false;
                return (
                  <TableCell key={col.key}>
                    {hasRestriction ? (
                      <span
                        className={cn("text-xs cursor-default", hasLicence ? "text-success" : "text-destructive")}
                        title={hasLicence
                          ? `You have the ${formatLicence(lic)} licence.`
                          : `Requires ${formatLicence(lic)} licence — you do not have it.`}
                      >
                        {formatLicence(lic)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                );
              }
              case "price":
                return (
                  <TableCell key={col.key} className="text-right">
                    {ship.price_avg != null ? (
                      <Currency value={ship.price_avg} abbreviate icon={false} />
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "crew":
                return (
                  <TableCell key={col.key} className={cls}>
                    {ship.people_capacity != null && ship.people_capacity > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{ship.people_capacity.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "missiles":
                return (
                  <TableCell key={col.key} className={cls}>
                    {ship.missile_storage != null && ship.missile_storage > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{ship.missile_storage.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "drones":
                return (
                  <TableCell key={col.key} className={cls}>
                    {ship.drone_storage != null && ship.drone_storage > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{ship.drone_storage.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "flares":
                return (
                  <TableCell key={col.key} className={cls}>
                    {ship.countermeasure_storage != null && ship.countermeasure_storage > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{ship.countermeasure_storage.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "deployables":
                return (
                  <TableCell key={col.key} className={cls}>
                    {ship.deployable_storage != null && ship.deployable_storage > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{ship.deployable_storage.toLocaleString()}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              case "dock_s":
              case "dock_m":
              case "bay_s":
              case "bay_m": {
                const prefix = col.key.startsWith("bay") ? "storage" : "dock";
                const val = ship[`${prefix}_${col.key.slice(-1)}` as keyof ShipSummary] as number;
                return (
                  <TableCell key={col.key} className={cls}>
                    {val > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{val}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              }
              case "wpn_s": case "wpn_m": case "wpn_l": case "wpn_xl":
              case "tur_s": case "tur_m": case "tur_l": case "tur_xl":
              case "shd_s": case "shd_m": case "shd_l": case "shd_xl":
              case "eng_s": case "eng_m": case "eng_l": case "eng_xl": {
                const val = ship[col.sortKey as keyof ShipSummary] as number;
                return (
                  <TableCell key={col.key} className={cls}>
                    {val > 0 ? (
                      <span className="text-xs font-mono tabular-nums">{val}</span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                );
              }
              default: {
                // Stat-bar columns — key is the value-accessor + max config
                const cfg: Record<string, { valueKey: string; maxConst: number; classMax: number; unit: string; fmt: (v: number) => string }> = {
                  speed:  { valueKey: "speed_max",  maxConst: MAX_SPEED,            classMax: classMaxSpeed,           unit: "m/s",   fmt: v => v.toFixed(0) },
                  travel: { valueKey: "travel_max", maxConst: MAX_TRAVEL,           classMax: classMaxTravel,          unit: "m/s",   fmt: v => v.toFixed(0) },
                  boost:  { valueKey: "boost_max",  maxConst: MAX_BOOST,            classMax: classMaxBoost,           unit: "m/s",   fmt: v => v.toFixed(0) },
                  accel:  { valueKey: "accel_max",  maxConst: MAX_ACCEL,            classMax: classMaxAccel,           unit: "m/s²",  fmt: v => v.toFixed(1) },
                  hull:   { valueKey: "hull",       maxConst: MAX_HULL,             classMax: classMaxHull,            unit: "HP",    fmt: v => v.toLocaleString() },
                  shield: { valueKey: "shield_capacity_max", maxConst: MAX_SHIELD,  classMax: classMaxShield,          unit: "MJ",    fmt: v => v.toLocaleString(undefined, {maximumFractionDigits: 0}) },
                  regen:  { valueKey: "shield_recharge_max", maxConst: MAX_SHIELD_RECHARGE, classMax: classMaxShieldRecharge, unit: "MW/s", fmt: v => v.toFixed(0) },
                  cargo:  { valueKey: "cargo_volume", maxConst: MAX_CARGO,          classMax: classMaxCargo,           unit: "",      fmt: v => v.toLocaleString() },
                  dps:    { valueKey: "dps_max",    maxConst: 50000,                classMax: classMaxDps,             unit: "",      fmt: v => v.toLocaleString(undefined, {maximumFractionDigits: 0}) },
                  range:  { valueKey: "range_max",  maxConst: MAX_RANGE,            classMax: classMaxRange,           unit: "km",    fmt: v => v.toFixed(1) },
                  radar:  { valueKey: "radar_range", maxConst: MAX_RADAR,           classMax: classMaxRadar,           unit: "km",    fmt: v => (v / 1000).toFixed(0) },
                };
                const c = cfg[col.key];
                if (!c) return <TableCell key={col.key}><span className="text-muted-foreground text-xs">—</span></TableCell>;
                const raw = ship[c.valueKey as keyof ShipSummary] as number | null;
                if (raw == null || raw === 0) return <TableCell key={col.key} className={cls}><span className="text-muted-foreground text-xs">—</span></TableCell>;
                return (
                  <TableCell key={col.key} className={cls}>
                    <StatBar
                      value={isLinear ? raw : Math.log10(raw + 1)}
                      max={isLinear ? c.classMax : Math.log10(c.maxConst + 1)}
                      labelRight={`${c.fmt(raw)}${c.unit ? " " + c.unit : ""}`}
                    />
                  </TableCell>
                );
              }
            }
          }

          return (
            isLoading ? (
              <PageLoaderPreset preset="ships" />
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No ships match your filters.</p>
            ) : (
          <table className="w-full caption-bottom text-xs">
            <TableHeader className="sticky top-0 z-10 bg-background [&_th]:bg-background">
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider">NAME {sortCol === "name" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                {activeColumns.map(col => (
                  <TableHead
                    key={col.key}
                    className={`w-32 cursor-pointer hover:bg-muted/50 transition-colors ${col.leftAlign ? "" : "text-right"}`}
                    onClick={() => col.sortKey && handleSort(col.sortKey as SortKey)}
                  >
                    <div className={`flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider ${col.leftAlign ? "" : "justify-end"}`}>
                      {col.label.toUpperCase()} {col.sortKey && sortCol === col.sortKey ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : col.sortKey ? <ArrowUpDown className="h-3 w-3 opacity-20" /> : null}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="w-12">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center cursor-help">
                        <Info className="h-3.5 w-3.5 text-sky-400/80 hover:text-sky-400 transition-colors" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-64 text-xs leading-relaxed">
                      <p>Stat bars show each ship&rsquo;s <strong>theoretical maximum</strong> with the best available equipment for its class.</p>
                      {isLinear ? (
                        <p className="mt-1">Currently <strong>linear</strong> &mdash; comparing ships within the selected class.</p>
                      ) : (
                        <p className="mt-1">Currently <strong>logarithmic</strong> &mdash; comparing across all classes.</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(groupedShips).map(([groupKey, groupShips]) => {
                const isCollapsed = collapsedGroups.has(groupKey);
                return (
                  <React.Fragment key={groupKey}>
                    {groupBy !== "none" && (
                      <TableRow 
                        className="bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => toggleGroup(groupKey)}
                      >
                        <TableCell colSpan={3 + activeColumns.length} className="py-2.5 px-4">
                          <div className="flex items-center gap-2 select-none">
                            {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                            {renderGroupHeaderContent(groupBy, groupKey, groupShips[0], factions)}
                            <span className="ml-2 font-normal opacity-70 text-muted-foreground text-xs">({groupShips.length})</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                    {!isCollapsed && groupShips.map((ship) => {
                      const faction = ship.faction_id ? factionMap.get(ship.faction_id) : undefined;
                      return (
                        <TableRow
                          key={ship.ship_id}
                          className="cursor-pointer hover:bg-muted/20 transition-colors h-14 group"
                          onClick={() => setSelectedShip(ship)}
                          onMouseEnter={() => {
                            queryClient.prefetchQuery({
                              queryKey: ["ship", ship.ship_id],
                              queryFn: () => fetch(`/api/v1/ships/${ship.ship_id}`).then((r) => r.json()),
                              staleTime: 5 * 60_000,
                            });
                          }}
                        >
                          <TableCell>
                            <EntityIcon src={ship.icon_url} alt={ship.name} size={28} />
                          </TableCell>
                          <TableCell className="font-medium">
                            {ship.name}
                            {!ship.can_be_captured && (
                              <span
                                className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30"
                                title="This ship can never be captured or owned by the player."
                              >
                                NPC Only
                              </span>
                            )}
                          </TableCell>
                          {activeColumns.map(col => renderColumnCell(col, ship, faction))}
                          <TableCell>
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
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </table>
        ));
      })()}
      </div>
        </HUDCard>
      </div>

      <Dialog
        open={selectedShip !== null}
        onOpenChange={(open) => { if (!open) setSelectedShip(null); }}
      >
        <DialogContent className="sm:max-w-2xl md:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedShip?.name ?? "Ship details"}</DialogTitle>
            <DialogDescription>Detailed stats for {selectedShip?.name}</DialogDescription>
          </DialogHeader>
          {selectedShip && <ShipDetailPanel shipId={selectedShip.ship_id} factions={factions} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
