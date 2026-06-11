import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { MultiSelect } from "../components/ui/multi-select";
import { EntityIcon } from "../components/EntityIcon";
import { FactionBadge } from "../components/FactionBadge";
import { StatBar } from "../components/StatBar";
import { getTypeColor } from "../lib/formatters";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DropListContent, buildDropGroups } from "../components/DropListContent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
  hull: number | null;
  cargo_volume: number | null;
  speed_min: number | null;
  speed_max: number | null;
  icon_url: string | null;
  image_url: string | null;
};

type ShipDetail = ShipSummary & {
  travel_min: number | null;
  travel_max: number | null;
  boost_min: number | null;
  boost_max: number | null;
  pitch_min: number | null;
  pitch_max: number | null;
  yaw_min: number | null;
  yaw_max: number | null;
  roll_min: number | null;
  roll_max: number | null;
  shield_capacity_min: number | null;
  shield_capacity_max: number | null;
  shield_recharge_min: number | null;
  shield_recharge_max: number | null;
  shield_delay_min: number | null;
  shield_delay_max: number | null;
  radar_range: number | null;
  mass: number | null;
  drag_forward: number | null;
  drag_reverse: number | null;
  drag_horizontal: number | null;
  drag_vertical: number | null;
  drag_pitch: number | null;
  drag_yaw: number | null;
  drag_roll: number | null;
  inertia_pitch: number | null;
  inertia_yaw: number | null;
  inertia_roll: number | null;
  people_capacity: number | null;
  missile_storage: number | null;
  drone_storage: number | null;
  countermeasure_storage: number | null;
  deployable_storage: number | null;
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
  drop_list_id: string | null;
};

type FactionSummary = {
  faction_id: string;
  name: string;
  color_hex: string | null;
};

const CLASSES = ["XS", "S", "M", "L", "XL"] as const;

function classShort(class_id: string) {
  return class_id.replace("ship_", "").toUpperCase();
}

function classFull(class_id: string) {
  const short = classShort(class_id);
  switch (short) {
    case "XS": return "Extra Small";
    case "S": return "Small";
    case "M": return "Medium";
    case "L": return "Large";
    case "XL": return "Extra Large";
    default: return short;
  }
}

function getClassColor(class_id: string): string {
  const cls = classShort(class_id);
  switch (cls) {
    case "XS": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case "S": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "M": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "L": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "XL": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

const MAX_SPEED = 600;
const MAX_HULL = 800_000;
const MAX_CARGO = 60_000;

function formatDlc(dlc: string) {
  if (dlc === "base_game") return "Base Game";
  return dlc.charAt(0).toUpperCase() + dlc.slice(1) + " DLC";
}

function renderGroupHeaderContent(groupBy: string, groupKey: string, sampleShip: ShipSummary, factions: FactionSummary[]) {
  if (groupBy === "class_id") {
    return <Badge variant="outline" className={`text-xs ${getClassColor(sampleShip.class_id)}`}>{classFull(sampleShip.class_id)}</Badge>;
  }
  if (groupBy === "role" && sampleShip.role) {
    return <Badge variant="outline" className={`text-xs uppercase px-2 py-0.5 ${getTypeColor(sampleShip.role)}`}>{groupKey}</Badge>;
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

function ShipDropTable({ listId }: { listId: string }) {
  const { data, isLoading } = useQuery<{ wares: any[] }>({
    queryKey: ["drops", "list", listId],
    queryFn: () => fetch(`/api/v1/drops/lists/${listId}`).then((r) => r.json()),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (!data || data.wares.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">No loot data.</p>;

  const groups = buildDropGroups(data.wares);

  return (
    <div className="space-y-3">
      <DropListContent groups={groups} />
    </div>
  );
}

function ShipDetailPanel({ shipId, factions }: { shipId: string, factions: FactionSummary[] }) {
  const { data, isLoading } = useQuery<ShipDetail>({
    queryKey: ["ship", shipId],
    queryFn: () => fetch(`/api/v1/ships/${shipId}`).then((r) => r.json()),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;
  if (!data) return null;

  const slotSizes = ["s", "m", "l", "xl"] as const;
  const faction = data.faction_id ? factions.find(f => f.faction_id === data.faction_id) : undefined;

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row gap-6">
        {data.image_url ? (
          <div className="relative shrink-0 flex items-center justify-center w-full sm:w-64 h-48 bg-gradient-to-tr from-muted/10 to-muted/30 border border-border/60 rounded-xl p-4 shadow-inner overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_0%,transparent_70%)]" />
            <img
              src={data.image_url}
              alt={data.name}
              className="relative w-full h-full object-contain drop-shadow-[0_0_12px_rgba(0,0,0,0.6)] transition-transform hover:scale-105 duration-500"
              onError={(e) => (e.currentTarget.parentElement!.style.display = "none")}
            />
          </div>
        ) : (
          <div className="shrink-0 flex items-center justify-center w-24 h-24">
            <EntityIcon src={data.icon_url} alt={data.name} size={80} />
          </div>
        )}

        <div className="flex-1 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-3">
            {data.image_url && (
              <EntityIcon src={data.icon_url} alt="Ship Class Icon" size={28} className="opacity-70 shrink-0" />
            )}
            <h2 className="text-2xl font-bold tracking-tight truncate" title={data.name}>
              {data.name}
            </h2>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Badge variant="outline" className={`px-2.5 py-0.5 text-sm ${getClassColor(data.class_id)}`}>
              {classFull(data.class_id)}
            </Badge>
            {data.role && (
              <Badge variant="outline" className={`px-2.5 py-0.5 text-sm ${getTypeColor(data.role)}`}>
                {data.role.charAt(0).toUpperCase() + data.role.slice(1)}
              </Badge>
            )}
            {faction && <FactionBadge name={faction.name} color_hex={faction.color_hex} />}
            {data.dlc && <Badge variant="outline" className="px-2.5 py-0.5 text-sm">{data.dlc}</Badge>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">Stats</TabsTrigger>
          {data.drop_list_id && <TabsTrigger value="drops">Drops</TabsTrigger>}
        </TabsList>

          <TabsContent value="stats" className="space-y-6 pt-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Performance (Base Chassis + Loadout Ranges)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Speed", min: data.speed_min, max: data.speed_max, maxVal: MAX_SPEED, unit: "m/s", isLog: false },
                  { label: "Travel", min: data.travel_min, max: data.travel_max, maxVal: 10000, unit: "m/s", isLog: false },
                  { label: "Boost", min: data.boost_min, max: data.boost_max, maxVal: 3000, unit: "m/s", isLog: false },
                  { label: "Radar", min: null, max: data.radar_range, maxVal: 40000, unit: "km", isLog: false, format: (v: number) => (v / 1000).toFixed(0) },
                  { label: "Hull", min: null, max: data.hull, maxVal: MAX_HULL, unit: "HP", isLog: true },
                  { label: "Cargo", min: null, max: data.cargo_volume, maxVal: MAX_CARGO, unit: "m³", isLog: true },
                  { label: "Shield Cap", min: data.shield_capacity_min, max: data.shield_capacity_max, maxVal: 100000, unit: "MJ", isLog: true },
                  { label: "Shield Reg", min: data.shield_recharge_min, max: data.shield_recharge_max, maxVal: 1000, unit: "MW", isLog: true },
                ].map(({ label, min, max, maxVal, unit, isLog, format }) => (
                  <div key={label} className="bg-muted/10 rounded-lg p-3 border border-border/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                    <div className="flex items-end gap-1.5 mb-2">
                      <span className="text-sm font-bold tracking-tight">
                        {max != null ? (
                          min != null && min !== max ? (
                            `${format ? format(min) : min.toFixed(0)} - ${format ? format(max) : max.toFixed(0)}`
                          ) : (
                            format ? format(max) : (max > 1000 ? max.toLocaleString() : max.toFixed(0))
                          )
                        ) : "—"}
                      </span>
                      {max != null && <span className="text-xs text-muted-foreground pb-0.5">{unit}</span>}
                    </div>
                    {max != null && max > 0 && (
                      <StatBar 
                        value={isLog ? Math.log10(max + 1) : max} 
                        max={isLog ? Math.log10(maxVal + 1) : maxVal} 
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
  
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Equipment Slots</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left text-muted-foreground font-medium py-2 pl-4 text-xs">Type</th>
                      {slotSizes.map((s) => (
                        <th key={s} className="text-center text-muted-foreground font-medium py-2 w-12 text-xs">
                          {s.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        { label: "Weapons", key: "weapons" },
                        { label: "Turrets", key: "turrets" },
                        { label: "Shields", key: "shields" },
                        { label: "Engines", key: "engines" },
                      ] as const
                    ).map(({ label, key }) => (
                      <tr key={key} className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="py-2 pl-4 text-muted-foreground text-xs">{label}</td>
                        {slotSizes.map((s) => {
                          const val = (data as Record<string, unknown>)[`${key}_${s}`] as number;
                          return (
                            <td key={s} className="py-2 text-center text-sm">
                              {val > 0 ? (
                                <span className="font-medium">{val}</span>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
  
            {(data.people_capacity || data.missile_storage || data.drone_storage || data.countermeasure_storage || data.deployable_storage) && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Capacity</p>
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { label: "Crew", value: data.people_capacity },
                    { label: "Missiles", value: data.missile_storage },
                    { label: "Drones", value: data.drone_storage },
                    { label: "Flares", value: data.countermeasure_storage },
                    { label: "Deploy", value: data.deployable_storage },
                  ]
                    .filter((x) => x.value != null && x.value > 0)
                    .map(({ label, value }) => (
                      <div key={label} className="bg-muted/10 rounded-lg p-3 border border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                        <p className="text-xl font-bold tracking-tight">{value?.toLocaleString()}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}
  
            {data.mass != null && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Physics</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Mass", value: data.mass, unit: "kg" },
                    { label: "Forward drag", value: data.drag_forward, unit: "" },
                    { label: "Reverse drag", value: data.drag_reverse, unit: "" },
                    { label: "Pitch inertia", value: data.inertia_pitch, unit: "" },
                  ]
                    .filter((x) => x.value != null)
                    .map(({ label, value, unit }) => (
                      <div key={label} className="flex justify-between items-center text-sm bg-muted/5 rounded-md px-3 py-2 border border-border/40">
                        <span className="text-muted-foreground text-xs">{label}</span>
                        <span className="font-mono text-sm tabular-nums font-medium">
                          {(value as number).toLocaleString()}
                          {unit && <span className="text-muted-foreground text-xs ml-1 font-sans font-normal">{unit}</span>}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </TabsContent>

        {data.drop_list_id && (
          <TabsContent value="drops" className="pt-4">
            <p className="text-xs text-muted-foreground mb-4">
              Drop table: <span className="font-mono">{data.drop_list_id}</span>. Each row is an independent roll; within a row, one item is selected by weighted chance.
            </p>
            <ShipDropTable listId={data.drop_list_id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default function ShipsPage() {
  const [search, setSearch] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [selectedFaction, setSelectedFaction] = useState("all");
  const [selectedDlcs, setSelectedDlcs] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedShip, setSelectedShip] = useState<ShipSummary | null>(null);
  
  // State to track which groups are collapsed
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  type SortKey = "name" | "class_id" | "faction_id" | "speed_max" | "hull" | "cargo_volume" | "role";
  const [sortCol, setSortCol] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);

  type GroupByKey = "none" | "class_id" | "role" | "faction_id" | "dlc";
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");

  const { data: ships = [], isLoading } = useQuery<ShipSummary[]>({
    queryKey: ["ships"],
    queryFn: () => fetch("/api/v1/ships?limit=2000").then((r) => r.json()),
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  const factionMap = new Map(factions.map((f) => [f.faction_id, f]));

  const filtered = ships.filter((s) => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedClasses.size > 0 && !selectedClasses.has(classShort(s.class_id))) return false;
    if (selectedFaction !== "all" && s.faction_id !== selectedFaction) return false;
    if (selectedTypes.size > 0 && (!s.role || !selectedTypes.has(s.role))) return false;
    
    const dlcKey = s.dlc || "base_game";
    if (selectedDlcs.size > 0 && !selectedDlcs.has(dlcKey)) return false;

    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    
    if (aVal === null && bVal !== null) return sortDesc ? -1 : 1;
    if (aVal !== null && bVal === null) return sortDesc ? 1 : -1;
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

  const hasFilters = search || selectedClasses.size > 0 || selectedFaction !== "all" || selectedDlcs.size > 0 || selectedTypes.size > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-2xl font-bold">Ships</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {ships.length} ships in catalog
          {filtered.length !== ships.length && ` · ${filtered.length} matching`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-muted/20">
        <Input
          placeholder="Search ships…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />

        <div className="flex gap-1">
          {CLASSES.map((cls) => (
            <Button
              key={cls}
              variant={selectedClasses.has(cls) ? "default" : "outline"}
              size="sm"
              onClick={() => toggleClass(cls)}
              className="h-8 px-3 text-xs"
            >
              {classFull(`ship_${cls.toLowerCase()}`)}
            </Button>
          ))}
        </div>

        <Select value={selectedFaction} onValueChange={setSelectedFaction}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All factions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All factions</SelectItem>
            {factions.map((f) => (
              <SelectItem key={f.faction_id} value={f.faction_id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-48">
          <MultiSelect
            options={Array.from(new Set(ships.map(s => s.role).filter(Boolean) as string[])).sort().map(r => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
            selected={selectedTypes}
            onChange={setSelectedTypes}
            placeholder="Types..."
            className="h-8 text-xs bg-background"
          />
        </div>

        <div className="w-56">
          <MultiSelect
            options={Array.from(new Set(ships.map(s => s.dlc || "base_game"))).sort().map(d => ({ value: d, label: formatDlc(d) }))}
            selected={selectedDlcs}
            onChange={setSelectedDlcs}
            placeholder="Expansions..."
            className="h-8 text-xs bg-background"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Group By:</span>
          <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as GroupByKey); setCollapsedGroups(new Set()); }}>
            <SelectTrigger className="w-36 h-8 text-xs bg-background">
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

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setSelectedClasses(new Set());
              setSelectedFaction("all");
              setSelectedDlcs(new Set());
              setSelectedTypes(new Set());
            }}
            className="h-8 text-xs text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading ships…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No ships match your filters.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("name")}>
                  <div className="flex items-center gap-1">Name {sortCol === "name" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("role")}>
                  <div className="flex items-center gap-1">Type {sortCol === "role" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("class_id")}>
                  <div className="flex items-center gap-1">Class {sortCol === "class_id" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("faction_id")}>
                  <div className="flex items-center gap-1">Faction {sortCol === "faction_id" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("speed_max")}>
                  <div className="flex items-center gap-1">Speed {sortCol === "speed_max" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("hull")}>
                  <div className="flex items-center gap-1">Hull {sortCol === "hull" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("cargo_volume")}>
                  <div className="flex items-center gap-1">Cargo {sortCol === "cargo_volume" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
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
                        <TableCell colSpan={8} className="py-2.5 px-4">
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
                          className="cursor-pointer"
                          onClick={() => setSelectedShip(ship)}
                        >
                          <TableCell>
                            <EntityIcon src={ship.icon_url} alt={ship.name} size={28} />
                          </TableCell>
                          <TableCell className="font-medium">{ship.name}</TableCell>
                          <TableCell>
                            {ship.role ? (
                              <Badge variant="outline" className={`text-[10px] uppercase px-1.5 py-0 ${getTypeColor(ship.role)}`}>
                                {ship.role}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${getClassColor(ship.class_id)}`}>
                              {classFull(ship.class_id)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {faction ? (
                              <FactionBadge name={faction.name} color_hex={faction.color_hex} />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {ship.speed_max != null ? (
                              <StatBar
                                value={ship.speed_max}
                                max={MAX_SPEED}
                                label={ship.speed_min != null && ship.speed_min !== ship.speed_max ? `${ship.speed_min.toFixed(0)} - ${ship.speed_max.toFixed(0)} m/s` : `${ship.speed_max.toFixed(0)} m/s`}
                              />
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {ship.hull != null ? (
                              <StatBar
                                value={Math.log10(ship.hull + 1)}
                                max={Math.log10(MAX_HULL + 1)}
                                label={`${ship.hull.toLocaleString()} HP`}
                              />
                            ) : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                          <TableCell>
                            {ship.cargo_volume != null && ship.cargo_volume > 0 ? (
                              <StatBar
                                value={Math.log10(ship.cargo_volume + 1)}
                                max={Math.log10(MAX_CARGO + 1)}
                                label={`${ship.cargo_volume.toLocaleString()} m³`}
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
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
