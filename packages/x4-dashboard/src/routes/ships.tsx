import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useSettings } from "../lib/settingsStore";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Wrench, Search } from "lucide-react";
import { MultiSelect } from "../components/ui/multi-select";
import { EntityIcon } from "../components/EntityIcon";
import { FactionBadge } from "../components/FactionBadge";
import { StatBar } from "../components/StatBar";
import { Currency } from "../components/Currency";
import { classFull, classShort, getClassColor } from "../lib/formatters";
import { cn } from "../lib/utils";
import type { FactionSummary } from '../lib/map/types';
import { ShipClassBadge, ShipTypeBadge, ShipSubtypeBadge } from "../components/ShipBadges";
import { Button } from "../components/ui/button";
import { ShipDetailPanel } from "../components/ShipDetailPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { PageLoaderPreset } from "../components/PageLoader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";

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
  icon_url: string | null;
  image_url: string | null;
  price_avg: number | null;
  is_owned: boolean;
  restriction_licence: string | null;
  is_obtainable: boolean;
};

const CLASSES = ["XS", "S", "M", "L", "XL"] as const;


const MAX_SPEED = 600;
const MAX_HULL = 800_000;
const MAX_SHIELD = 2_500_000;
const MAX_PRICE = 300_000_000;
const MAX_CARGO = 60_000;

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
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [selectedFactions, setSelectedFactions] = useState<Set<string>>(new Set());
  const [selectedDlcs, setSelectedDlcs] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedSubTypes, setSelectedSubTypes] = useState<Set<string>>(new Set());
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [obtainableOnly, setObtainableOnly] = useState(false);
  const [selectedShip, setSelectedShip] = useState<ShipSummary | null>(null);
  
  // State to track which groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  type SortKey = "name" | "class_id" | "faction_id" | "speed_max" | "hull" | "shield_capacity_max" | "cargo_volume" | "dps_max" | "price_avg" | "role" | "ship_type";
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

  const factionMap = new Map(factions.map((f) => [f.faction_id, f]));

  const filtered = ships.filter((s) => {
    // Fog of war: hide ships from unknown factions
    if (settings.fogOfWar && s.faction_id && knownFactions[s.faction_id] === false) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedClasses.size > 0 && !selectedClasses.has(classShort(s.class_id))) return false;
    if (selectedFactions.size > 0 && (!s.faction_id || !selectedFactions.has(s.faction_id))) return false;
    if (selectedTypes.size > 0 && (!s.role || !selectedTypes.has(s.role))) return false;
    if (selectedTypes.size > 0 && selectedSubTypes.size > 0 && (!s.ship_type || !selectedSubTypes.has(s.ship_type))) return false;
    
    const dlcKey = s.dlc || "base_game";
    if (selectedDlcs.size > 0 && !selectedDlcs.has(dlcKey)) return false;
    
    if (ownedOnly && !s.is_owned) return false;
    if (obtainableOnly && !s.is_obtainable) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    
    if (aVal === null && bVal !== null) return sortDesc ? 1 : -1;
    if (aVal !== null && bVal === null) return sortDesc ? -1 : 1;
    if (aVal === null && bVal === null) return 0;
    
    if (typeof aVal === "string" && typeof bVal === "string") {
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
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
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

  const hasFilters = search || selectedClasses.size > 0 || selectedFactions.size > 0 || selectedDlcs.size > 0 || selectedTypes.size > 0 || (selectedTypes.size > 0 && selectedSubTypes.size > 0) || ownedOnly || obtainableOnly;

  const availableSubTypes = selectedTypes.size > 0 
    ? Array.from(new Set(
        ships
          .filter(s => s.role && selectedTypes.has(s.role))
          .map(s => s.ship_type)
          .filter(Boolean) as string[]
      )).sort().map(r => {
        const matchingShip = ships.find(s => s.ship_type === r && s.role && selectedTypes.has(s.role));
        return { 
          value: r, 
          label: r.charAt(0).toUpperCase() + r.slice(1),
          node: <ShipSubtypeBadge role={matchingShip?.role} subtype={r} className="px-2.5 py-0.5 text-xs font-normal" />
        };
      })
    : [];

  // Child route (e.g. /ships/builder) — delegate to <Outlet />
  if (location.pathname !== "/ships") return <Outlet />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Ships</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {ships.length} ships in catalog
          {filtered.length !== ships.length && ` · ${filtered.length} matching`}
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-0 flex flex-col">
        <div className="flex flex-col h-full border border-border/50 relative" style={{ backgroundColor: 'rgba(16, 20, 34, 0.55)' }}>
          {/* Tech HUD Corner Accents */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary/60 pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary/60 pointer-events-none" />

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

            <div className="flex gap-1">
              {CLASSES.map((cls) => (
                <Button
                  key={cls}
                  variant={selectedClasses.has(cls) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleClass(cls)}
                  className="h-8 px-3 text-xs flex items-center gap-2"
                >
                  <div className={cn("w-1.5 h-1.5 bg-current", getClassColor(`ship_${cls.toLowerCase()}`).split(' ').find(c => c.startsWith('text-')))} />
                  {classFull(`ship_${cls.toLowerCase()}`)}
                </Button>
              ))}
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
                options={Array.from(new Set(ships.map(s => s.role).filter(Boolean) as string[])).sort().map(r => ({ 
                  value: r, 
                  label: r.charAt(0).toUpperCase() + r.slice(1),
                  node: <ShipTypeBadge role={r} className="px-2.5 py-0.5 text-xs font-normal" />
                }))}
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

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedClasses(new Set());
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
              <div className="flex items-center gap-2">
                <Switch id="owned-only" checked={ownedOnly} onCheckedChange={setOwnedOnly} />
                <label htmlFor="owned-only" className="text-xs text-muted-foreground cursor-pointer">
                  Owned Only
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Switch id="obtainable-only" checked={obtainableOnly} onCheckedChange={setObtainableOnly} />
                <label htmlFor="obtainable-only" className="text-xs text-muted-foreground cursor-pointer">
                  Obtainable
                </label>
              </div>

              <div className="h-6 w-px bg-border/50" />

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

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center"><PageLoaderPreset preset="ships" /></p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No ships match your filters.</p>
        ) : (
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider">NAME {sortCol === "name" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("role")}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider">TYPE {sortCol === "role" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("class_id")}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider">CLASS {sortCol === "class_id" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("faction_id")}>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wider">FACTION {sortCol === "faction_id" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-32 cursor-pointer hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort("speed_max")}>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider">SPEED {sortCol === "speed_max" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-32 cursor-pointer hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort("hull")}>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider">HULL {sortCol === "hull" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-32 cursor-pointer hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort("shield_capacity_max")}>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider">SHIELD {sortCol === "shield_capacity_max" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-32 cursor-pointer hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort("cargo_volume")}>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider">CARGO {sortCol === "cargo_volume" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-32 cursor-pointer hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort("dps_max")}>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider">DPS {sortCol === "dps_max" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-32 cursor-pointer hover:bg-muted/50 transition-colors text-right" onClick={() => handleSort("price_avg")}>
                  <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground uppercase tracking-wider">PRICE {sortCol === "price_avg" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="w-12" />
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
                        <TableCell colSpan={11} className="py-2.5 px-4">
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
                          <TableCell className="font-medium">{ship.name}</TableCell>
                          <TableCell>
                            {ship.role || ship.ship_type ? (
                              <ShipTypeBadge role={ship.role} subtype={ship.ship_type} className="text-xs" />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <ShipClassBadge class_id={ship.class_id} className="text-sm" />
                          </TableCell>
                          <TableCell>
                            {faction ? (
                              <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {ship.speed_max != null ? (
                                <StatBar
                                  value={ship.speed_max}
                                  max={MAX_SPEED}
                                  labelRight={`${ship.speed_max.toFixed(0)} m/s`}
                                />
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {ship.hull != null ? (
                                <StatBar
                                  value={Math.log10(ship.hull + 1)}
                                  max={Math.log10(MAX_HULL + 1)}
                                  labelRight={`${ship.hull.toLocaleString()} HP`}
                                />
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {ship.shield_capacity_max != null && ship.shield_capacity_max > 0 ? (
                                <StatBar
                                  value={Math.log10(ship.shield_capacity_max + 1)}
                                  max={Math.log10(MAX_SHIELD + 1)}
                                  labelRight={`${ship.shield_capacity_max.toLocaleString(undefined, {maximumFractionDigits: 0})} MJ`}
                                />
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {ship.cargo_volume != null && ship.cargo_volume > 0 ? (
                                <StatBar
                                  value={Math.log10(ship.cargo_volume + 1)}
                                  max={Math.log10(MAX_CARGO + 1)}
                                  labelRight={`${ship.cargo_volume.toLocaleString()}`}
                                />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {ship.dps_max != null && ship.dps_max > 0 ? (
                                <StatBar
                                  value={Math.log10(ship.dps_max + 1)}
                                  max={Math.log10(50000 + 1)}
                                  labelRight={`${ship.dps_max.toLocaleString(undefined, {maximumFractionDigits: 0})}`}
                                />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {ship.price_avg != null ? (
                              <Currency value={ship.price_avg} abbreviate icon={false} />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
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
          </Table>
        )}
      </div>
      </div>
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
