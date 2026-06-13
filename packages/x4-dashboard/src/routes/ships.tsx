import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useSettings } from "../lib/settingsStore";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, Wrench, Info } from "lucide-react";
import { MultiSelect } from "../components/ui/multi-select";
import { EntityIcon } from "../components/EntityIcon";
import { FactionBadge } from "../components/FactionBadge";
import { StatBar } from "../components/StatBar";
import { classFull, classShort } from "../lib/formatters";
import { ShipClassBadge, ShipTypeBadge, ShipSubtypeBadge } from "../components/ShipBadges";
import { Button } from "../components/ui/button";
import { ShipImage } from "../components/ShipImage";
import { DropListContent, buildDropGroups } from "../components/DropListContent";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  SHIP_HULL_MAX, SHIP_SHIELD_MAX, SHIP_REGEN_MAX,
  SHIP_SPEED_MAX, SHIP_TRAVEL_MAX, SHIP_BOOST_MAX,
  SHIP_CARGO_MAX, SHIP_CREW_MAX,
  SHIP_MISSILE_MAX, SHIP_DPS_MAX
} from "./ships/builder";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
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
  cargo_volume: number | null;
  dps_max: number | null;
  speed_min: number | null;
  speed_max: number | null;
  icon_url: string | null;
  image_url: string | null;
  is_owned: boolean;
  restriction_licence: string | null;
  is_obtainable: boolean;
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
  dock_s: number;
  dock_m: number;
  dock_l: number;
  dock_xl: number;
  storage_s: number;
  storage_m: number;
  storage_l: number;
  storage_xl: number;
  launch_tubes: number;
  accel_forward: number | null;
  decel_forward: number | null;
  accel_boost: number | null;
  accel_travel: number | null;
  accel_strafe: number | null;
  accel_angular: number | null;
  accel_factor_reverse: number | null;
  accel_factor_horizontal: number | null;
  accel_factor_vertical: number | null;
  modifier_weapon_heat: number | null;
  explosion_damage: number | null;
  explosion_shield_damage: number | null;
  drop_list_id: string | null;
};

type FactionSummary = {
  faction_id: string;
  name: string;
  color_hex: string | null;
};

const CLASSES = ["XS", "S", "M", "L", "XL"] as const;


const MAX_SPEED = 600;
const MAX_HULL = 800_000;
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

function ShipDropTable({ listId }: { listId: string }) {
  const { data, isLoading } = useQuery<{ wares: any[] }>({
    queryKey: ["drops", "list", listId],
    queryFn: () => fetch(`/api/v1/drops/lists/${listId}`).then((r) => r.json()),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2"><PageLoaderPreset preset="ships" className="py-12" /></p>;
  if (!data || data.wares.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">No loot data.</p>;

  const groups = buildDropGroups(data.wares);

  return (
    <div className="space-y-3">
      <DropListContent groups={groups} />
    </div>
  );
}

function ShipDetailStatRow({ label, min, max, maxVal, unit, isLog, format }: {
  label: string;
  min: number | null;
  max: number | null;
  maxVal: number;
  unit?: string;
  isLog?: boolean;
  format?: (v: number) => string;
}) {
  const displayVal = max != null ? (
    min != null && min !== max ? (
      `${format ? format(min) : min.toFixed(0)} - ${format ? format(max) : max.toFixed(0)}`
    ) : (
      format ? format(max) : (max >= 1000 ? (max/1000).toFixed(1) + 'k' : max.toFixed(max < 10 && max % 1 !== 0 ? 1 : 0))
    )
  ) : "—";

  const scaledValue = isLog ? Math.log10((max ?? 0) + 1) : (max ?? 0);
  const scaledMax = isLog ? Math.log10(maxVal + 1) : maxVal;
  const pct = Math.max(0, Math.min(100, (scaledValue / scaledMax) * 100));
  
  const barColor = 
    pct >= 66 ? "hsl(var(--success))" :
    pct >= 33 ? "hsl(var(--warning))" :
    "hsl(var(--destructive))";

  return (
    <div className="flex items-center gap-3 py-1 group">
      <span className="w-[110px] shrink-0 text-[10px] sm:text-[11px] uppercase font-bold tracking-wider text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
      
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[40px]">
        {max != null && max > 0 && (
          <div className="h-full rounded-full transition-all duration-300 opacity-90 group-hover:opacity-100" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        )}
      </div>
      
      <div className="w-[120px] shrink-0 flex justify-end items-baseline gap-1 text-right">
        <span className="font-mono text-[10px] sm:text-[11px] text-foreground font-medium whitespace-nowrap">
          {displayVal}
        </span>
        {unit && max != null && <span className="text-[9px] sm:text-[10px] text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

export function ShipDetailPanel({ shipId, factions }: { shipId: string, factions: FactionSummary[] }) {
  const { data, isLoading } = useQuery<ShipDetail>({
    queryKey: ["ship", shipId],
    queryFn: () => fetch(`/api/v1/ships/${shipId}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm"><PageLoaderPreset preset="ships" className="py-12" /></div>;
  if (!data) return null;

  const slotSizes = ["s", "m", "l", "xl"] as const;
  const faction = data.faction_id ? factions.find(f => f.faction_id === data.faction_id) : undefined;
  
  const cid = classShort(data.class_id).toLowerCase();

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row gap-6">
        <ShipImage
          imageUrl={data.image_url}
          iconUrl={data.icon_url}
          name={data.name}
          role={data.role}
          classId={data.class_id}
          className="shrink-0 w-full sm:w-64 h-48 p-4 shadow-inner border-border/60"
          imageClassName="transition-transform hover:scale-105 duration-500"
        />

        <div className="flex-1 flex flex-col justify-center min-w-0 py-1">
          <div>
            <div className="flex items-center gap-3 min-w-0">
              {data.image_url && (
                <EntityIcon src={data.icon_url} alt="Ship Class Icon" size={28} className="opacity-70 shrink-0" />
              )}
              <h2 className="text-2xl font-bold tracking-tight truncate" title={data.name}>
                {data.name}
              </h2>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <ShipClassBadge class_id={data.class_id} className="text-sm px-2.5 py-0.5" />
              <ShipTypeBadge role={data.role} subtype={data.ship_type} className="text-sm" />
              {faction && <FactionBadge name={faction.name} color_hex={faction.color_hex} faction_id={faction.faction_id} size="md" className="text-sm" />}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="stats">
        <div className="border-b border-border/40 pb-px">
          <TabsList className="bg-transparent border-none p-0 h-auto space-x-6">
            <TabsTrigger 
              value="stats" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground"
            >
              Stats
            </TabsTrigger>
            {data.drop_list_id && (
              <TabsTrigger 
                value="drops" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground"
              >
                Drops
              </TabsTrigger>
            )}
          </TabsList>
        </div>

          <TabsContent value="stats" className="space-y-6 pt-5">
            <div className="bg-muted/10 border border-border/50 rounded-lg overflow-hidden">
              <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-border/30">
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Bars represent maximum potential relative to the best {classShort(data.class_id)}-class ship
                </span>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 p-5 pt-4">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Flight</div>
                  <div className="flex flex-col gap-0.5">
                    <ShipDetailStatRow label="Top Speed" min={null} max={data.speed_max} maxVal={SHIP_SPEED_MAX[cid] || MAX_SPEED} unit="m/s" />
                    <ShipDetailStatRow label="Travel Speed" min={null} max={data.travel_max} maxVal={SHIP_TRAVEL_MAX[cid] || 10000} unit="m/s" />
                    <ShipDetailStatRow label="Boost Speed" min={null} max={data.boost_max} maxVal={SHIP_BOOST_MAX[cid] || 3000} unit="m/s" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Defense</div>
                  <div className="flex flex-col gap-0.5">
                    <ShipDetailStatRow label="Hull Capacity" min={null} max={data.hull} maxVal={SHIP_HULL_MAX[cid] || MAX_HULL} unit="HP" />
                    <ShipDetailStatRow label="Shield Cap" min={null} max={data.shield_capacity_max} maxVal={SHIP_SHIELD_MAX[cid] || 100000} unit="MJ" />
                    <ShipDetailStatRow label="Shield Regen" min={null} max={data.shield_recharge_max} maxVal={SHIP_REGEN_MAX[cid] || 1000} unit="MW/s" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Logistics</div>
                  <div className="flex flex-col gap-0.5">
                    <ShipDetailStatRow label="Cargo Bay" min={null} max={data.cargo_volume} maxVal={SHIP_CARGO_MAX[cid] || MAX_CARGO} unit="m³" />
                    <ShipDetailStatRow label="Crew Capacity" min={null} max={data.people_capacity} maxVal={SHIP_CREW_MAX[cid] || 40} unit="Crew" />
                    <ShipDetailStatRow label="Deployables" min={null} max={data.deployable_storage} maxVal={100} unit="Units" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Offense</div>
                  <div className="flex flex-col gap-0.5">
                    <ShipDetailStatRow label="Weapon DPS" min={null} max={data.dps_max} maxVal={SHIP_DPS_MAX[cid] || 5000} unit="/s" />
                    <ShipDetailStatRow label="Missile Cap" min={null} max={data.missile_storage} maxVal={SHIP_MISSILE_MAX[cid] || 100} unit="Ms" />
                    {data.modifier_weapon_heat && data.modifier_weapon_heat !== 1 ? (
                      <ShipDetailStatRow label="Heat Mod" min={null} max={data.modifier_weapon_heat} maxVal={2} format={v => `${v}x`} />
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-border/30 bg-muted/5 px-6 py-5 flex flex-col md:flex-row gap-10 justify-center">
                {/* Physics Stats */}
                <div className="flex flex-col gap-2 items-center md:items-start text-xs border-b md:border-b-0 md:border-r border-border/50 pb-4 md:pb-0 pr-0 md:pr-10">
                  <span className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase mb-1">Physics</span>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Mass</span><span className="font-semibold text-foreground">{(data.mass ?? 0).toLocaleString()} kg</span></div>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Pitch Inertia</span><span className="font-semibold text-foreground">{(data.inertia_pitch ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Fwd Drag</span><span className="font-semibold text-foreground">{(data.drag_forward ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Rev Drag</span><span className="font-semibold text-foreground">{(data.drag_reverse ?? 0).toLocaleString()}</span></div>
                </div>

                {/* Auxiliary Stats */}
                <div className="flex flex-col gap-2 items-center md:items-start text-xs">
                  <span className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase mb-1">Auxiliary</span>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Fwd Accel</span><span className="font-semibold text-foreground">{data.accel_forward ?? 0} m/s²</span></div>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Radar Range</span><span className="font-semibold text-foreground">{((data.radar_range ?? 0) / 1000).toFixed(0)} km</span></div>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Drone Bay</span><span className="font-semibold text-foreground">{data.drone_storage ?? 0}</span></div>
                  <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Flares</span><span className="font-semibold text-foreground">{data.countermeasure_storage ?? 0}</span></div>
                  {data.launch_tubes > 0 && <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Launch Tubes</span><span className="font-semibold text-foreground">{data.launch_tubes}</span></div>}
                </div>
              </div>
              
              {(data.dock_s > 0 || data.dock_m > 0 || data.dock_l > 0 || data.dock_xl > 0 || data.storage_s > 0 || data.storage_m > 0 || data.storage_l > 0 || data.storage_xl > 0) && (
                <div className="bg-muted/10 border-t border-border/30 p-4 flex flex-col md:flex-row items-center justify-center gap-x-8 gap-y-4">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Ship Docks / Hangars:</span>
                  <div className="flex flex-wrap items-center justify-center gap-8">
                    {(["s", "m", "l", "xl"] as const).map(s => {
                      const d = data[`dock_${s}` as keyof ShipDetail] as number;
                      const st = data[`storage_${s}` as keyof ShipDetail] as number;
                      if (d > 0 || st > 0) {
                        return (
                          <div key={s} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground font-semibold uppercase">{s === 'xl' ? 'Extra Large' : s === 'l' ? 'Large' : s === 'm' ? 'Medium' : 'Small'}:</span>
                            <span className="font-semibold text-foreground">
                              {d + st} Ships <span className="text-muted-foreground font-normal">({d > 0 ? `${d} Pad${d !== 1 ? 's' : ''}` : '0 Pads'}, {st > 0 ? `${st} Internal` : '0 Internal'})</span>
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Equipment Slots</p>
                <Button variant="default" size="sm" asChild className="h-7 text-xs px-3 shadow-sm">
                  <Link to="/ships/builder" search={{ ship_id: data.ship_id }}>
                    <Wrench className="h-3 w-3 mr-1.5" />
                    Build Loadout
                  </Link>
                </Button>
              </div>
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

  type SortKey = "name" | "class_id" | "faction_id" | "speed_max" | "hull" | "cargo_volume" | "dps_max" | "role" | "ship_type";
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

        <div className="w-48">
          <MultiSelect
            options={factions.map(f => ({
              value: f.faction_id,
              label: f.name,
              node: <FactionBadge name={f.name} color_hex={f.color_hex} size="md" className="font-normal" />
            }))}
            selected={selectedFactions}
            onChange={setSelectedFactions}
            placeholder="Factions..."
            className="h-8 text-xs bg-background"
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
            className="h-8 text-xs bg-background"
          />
        </div>

        {selectedTypes.size > 0 && availableSubTypes.length > 0 && (
          <div className="w-48">
            <MultiSelect
              options={availableSubTypes}
              selected={selectedSubTypes}
              onChange={setSelectedSubTypes}
              placeholder="Types..."
              className="h-8 text-xs bg-background"
            />
          </div>
        )}

        <div className="w-56">
          <MultiSelect
            options={Array.from(new Set(ships.map(s => s.dlc || "base_game"))).sort().map(d => ({ value: d, label: formatDlc(d) }))}
            selected={selectedDlcs}
            onChange={setSelectedDlcs}
            placeholder="Expansions..."
            className="h-8 text-xs bg-background"
          />
        </div>

        <Button
          variant={ownedOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setOwnedOnly(!ownedOnly)}
          className="h-8 text-xs px-3"
        >
          Owned Only
        </Button>

        <Button
          variant={obtainableOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setObtainableOnly(!obtainableOnly)}
          className="h-8 text-xs px-3"
        >
          Obtainable Only
        </Button>

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
              setSelectedFactions(new Set());
              setSelectedDlcs(new Set());
              setSelectedTypes(new Set());
              setSelectedSubTypes(new Set());
              setOwnedOnly(false);
              setObtainableOnly(false);
            }}
            className="h-8 text-xs text-muted-foreground"
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center"><PageLoaderPreset preset="ships" /></p>
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
                <TableHead className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort("dps_max")}>
                  <div className="flex items-center gap-1">DPS {sortCol === "dps_max" ? (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-20" />}</div>
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
                        <TableCell colSpan={10} className="py-2.5 px-4">
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
                              <ShipTypeBadge role={ship.role} subtype={ship.ship_type} className="text-[10px]" />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <ShipClassBadge class_id={ship.class_id} className="text-xs" />
                          </TableCell>
                          <TableCell>
                            {faction ? (
                              <FactionBadge name={faction.name} color_hex={faction.color_hex} faction_id={faction.faction_id} />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {ship.speed_max != null ? (
                              <StatBar
                                value={ship.speed_max}
                                max={MAX_SPEED}
                                label={`${ship.speed_max.toFixed(0)} m/s`}
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
                          <TableCell>
                            {ship.dps_max != null && ship.dps_max > 0 ? (
                              <StatBar
                                value={Math.log10(ship.dps_max + 1)}
                                max={Math.log10(50000 + 1)}
                                label={`${ship.dps_max.toLocaleString(undefined, {maximumFractionDigits: 0})}`}
                              />
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
