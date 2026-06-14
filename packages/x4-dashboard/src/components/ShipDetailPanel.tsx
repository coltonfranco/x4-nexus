import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Info, Wrench } from "lucide-react";
import { EntityIcon } from "./EntityIcon";
import { FactionBadge } from "./FactionBadge";
import { ShipClassBadge, ShipTypeBadge } from "./ShipBadges";
import { ShipImage } from "./ShipImage";
import { DropListContent, buildDropGroups } from "./DropListContent";

import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { StatBar } from "./StatBar";
import { PageLoaderPreset } from "./PageLoader";
import { classShort } from "../lib/formatters";
import type { FactionSummary } from '../lib/map/types';
import {
  SHIP_HULL_MAX, SHIP_SHIELD_MAX, SHIP_REGEN_MAX,
  SHIP_SPEED_MAX, SHIP_TRAVEL_MAX, SHIP_BOOST_MAX,
  SHIP_CARGO_MAX, SHIP_CREW_MAX,
  SHIP_MISSILE_MAX, SHIP_DPS_MAX
} from "../routes/ships/builder";

type ShipDetail = any; // large type — inferred from API
function ShipDetailStatRow({ label, min, max, maxVal, unit, isLog, format }: {
  label: string; min: number | null; max: number | null; maxVal: number;
  unit?: string; isLog?: boolean; format?: (v: number) => string;
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

  return (
    <div className="flex items-center gap-3 py-1 group">
      <span className="w-[110px] shrink-0 text-xs sm:text-[11px] uppercase font-bold tracking-wider text-muted-foreground group-hover:text-foreground transition-colors leading-tight">{label}</span>
      <div className="flex-1 min-w-[40px]">
        {max != null && max > 0 && (
          <StatBar value={scaledValue} max={scaledMax} width={100} height={6} className="w-full" />
        )}
      </div>
      <div className="w-[120px] shrink-0 flex justify-end items-baseline gap-1 text-right">
        <span className="font-mono text-xs sm:text-[11px] text-foreground font-medium whitespace-nowrap">{displayVal}</span>
        {unit && max != null && <span className="text-[9px] sm:text-xs text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function ShipDropTable({ listId }: { listId: string }) {
  const { data, isLoading } = useQuery<{ wares: any[] }>({
    queryKey: ["drops", "list", listId],
    queryFn: () => fetch(`/api/v1/drops/lists/${listId}`).then((r) => r.json()),
  });
  if (isLoading) return <PageLoaderPreset preset="ships" className="py-12" />;
  if (!data || data.wares.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">No loot data.</p>;
  const groups = buildDropGroups(data.wares);
  return <div className="space-y-3"><DropListContent groups={groups} /></div>;
}

export function ShipDetailPanel({ shipId, factions }: { shipId: string; factions: FactionSummary[] }) {
  const { data, isLoading } = useQuery<ShipDetail>({
    queryKey: ["ship", shipId],
    queryFn: () => fetch(`/api/v1/ships/${shipId}`).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm"><PageLoaderPreset preset="ships" className="py-12" /></div>;
  if (!data) return null;

  const slotSizes = ["s", "m", "l", "xl"] as const;
  const faction = data.faction_id ? factions.find((f: FactionSummary) => f.faction_id === data.faction_id) : undefined;
  const cid = classShort(data.class_id).toLowerCase();

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row gap-6">
        <ShipImage imageUrl={data.image_url} iconUrl={data.icon_url} name={data.name} role={data.role} classId={data.class_id} className="shrink-0 w-full sm:w-64 h-48 p-4 shadow-inner border-border/60" imageClassName="transition-transform hover:scale-105 duration-500" />
        <div className="flex-1 flex flex-col justify-center min-w-0 py-1">
          <div>
            <div className="flex items-center gap-3 min-w-0">
              {data.image_url && <EntityIcon src={data.icon_url} alt="Ship Class Icon" size={28} className="opacity-70 shrink-0" />}
              <h2 className="text-2xl font-bold tracking-tight truncate" title={data.name}>{data.name}</h2>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <ShipClassBadge class_id={data.class_id} className="text-sm px-2.5 py-0.5" />
              <ShipTypeBadge role={data.role} subtype={data.ship_type} className="text-sm" />
              {faction && <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} size="md" className="text-sm" />}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="stats">
        <div className="border-b border-border/40 pb-px">
          <TabsList className="bg-transparent border-none p-0 h-auto space-x-6">
            <TabsTrigger value="stats" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Stats</TabsTrigger>
            {data.drop_list_id && <TabsTrigger value="drops" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Drops</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="stats" className="space-y-6 pt-5">
          <div className="bg-muted/10 border border-border/50 rounded-lg overflow-hidden">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-border/30">
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold flex items-center gap-1.5"><Info className="w-3.5 h-3.5" />Bars represent maximum potential relative to the best {classShort(data.class_id)}-class ship</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 p-5 pt-4">
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Flight</div>
                <ShipDetailStatRow label="Top Speed" min={null} max={data.speed_max} maxVal={SHIP_SPEED_MAX[cid] || 600} unit="m/s" />
                <ShipDetailStatRow label="Travel Speed" min={null} max={data.travel_max} maxVal={SHIP_TRAVEL_MAX[cid] || 10000} unit="m/s" />
                <ShipDetailStatRow label="Boost Speed" min={null} max={data.boost_max} maxVal={SHIP_BOOST_MAX[cid] || 3000} unit="m/s" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Defense</div>
                <ShipDetailStatRow label="Hull Capacity" min={null} max={data.hull} maxVal={SHIP_HULL_MAX[cid] || 800_000} unit="HP" />
                <ShipDetailStatRow label="Shield Cap" min={null} max={data.shield_capacity_max} maxVal={SHIP_SHIELD_MAX[cid] || 100000} unit="MJ" />
                <ShipDetailStatRow label="Shield Regen" min={null} max={data.shield_recharge_max} maxVal={SHIP_REGEN_MAX[cid] || 1000} unit="MW/s" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Logistics</div>
                <ShipDetailStatRow label="Cargo Bay" min={null} max={data.cargo_volume} maxVal={SHIP_CARGO_MAX[cid] || 60_000} unit="m³" />
                <ShipDetailStatRow label="Crew Capacity" min={null} max={data.people_capacity} maxVal={SHIP_CREW_MAX[cid] || 40} unit="Crew" />
                <ShipDetailStatRow label="Deployables" min={null} max={data.deployable_storage} maxVal={100} unit="Units" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 border-b border-border/50 pb-1.5">Offense</div>
                <ShipDetailStatRow label="Weapon DPS" min={null} max={data.dps_max} maxVal={SHIP_DPS_MAX[cid] || 5000} unit="/s" />
                <ShipDetailStatRow label="Missile Cap" min={null} max={data.missile_storage} maxVal={SHIP_MISSILE_MAX[cid] || 100} unit="Ms" />
                {data.modifier_weapon_heat && data.modifier_weapon_heat !== 1 && <ShipDetailStatRow label="Heat Mod" min={null} max={data.modifier_weapon_heat} maxVal={2} format={(v: number) => `${v}x`} />}
              </div>
            </div>

            <div className="border-t border-border/30 bg-muted/5 px-6 py-5 flex flex-col md:flex-row gap-10 justify-center">
              <div className="flex flex-col gap-2 items-center md:items-start text-xs border-b md:border-b-0 md:border-r border-border/50 pb-4 md:pb-0 pr-0 md:pr-10">
                <span className="text-xs text-muted-foreground font-bold tracking-widest uppercase mb-1">Physics</span>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Mass</span><span className="font-semibold text-foreground">{(data.mass ?? 0).toLocaleString()} kg</span></div>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Pitch Inertia</span><span className="font-semibold text-foreground">{(data.inertia_pitch ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Fwd Drag</span><span className="font-semibold text-foreground">{(data.drag_forward ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Rev Drag</span><span className="font-semibold text-foreground">{(data.drag_reverse ?? 0).toLocaleString()}</span></div>
              </div>
              <div className="flex flex-col gap-2 items-center md:items-start text-xs">
                <span className="text-xs text-muted-foreground font-bold tracking-widest uppercase mb-1">Auxiliary</span>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Fwd Accel</span><span className="font-semibold text-foreground">{data.accel_forward ?? 0} m/s²</span></div>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Radar Range</span><span className="font-semibold text-foreground">{((data.radar_range ?? 0) / 1000).toFixed(0)} km</span></div>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Drone Bay</span><span className="font-semibold text-foreground">{data.drone_storage ?? 0}</span></div>
                <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Flares</span><span className="font-semibold text-foreground">{data.countermeasure_storage ?? 0}</span></div>
                {data.launch_tubes > 0 && <div className="flex justify-between w-48"><span className="text-muted-foreground uppercase">Launch Tubes</span><span className="font-semibold text-foreground">{data.launch_tubes}</span></div>}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Equipment Slots</p>
              <Button variant="default" size="sm" asChild className="h-7 text-xs px-3 shadow-sm">
                <Link to="/ships/builder" search={{ ship_id: data.ship_id }}>
                  <Wrench className="h-3 w-3 mr-1.5" />Build Loadout
                </Link>
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="text-left text-muted-foreground font-medium py-2 pl-4 text-xs">Type</th>
                    {slotSizes.map((s) => (<th key={s} className="text-center text-muted-foreground font-medium py-2 w-12 text-xs">{s.toUpperCase()}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {(["Weapons","Turrets","Shields","Engines"] as const).map((label) => {
                    const key = label.toLowerCase();
                    return (
                      <tr key={key} className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                        <td className="py-2 pl-4 text-muted-foreground text-xs">{label}</td>
                        {slotSizes.map((s) => {
                          const val = (data as Record<string, unknown>)[`${key}_${s}`] as number;
                          return (<td key={s} className="py-2 text-center text-sm">{val > 0 ? <span className="font-medium">{val}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}</td>);
                        })}
                      </tr>
                    );
                  })}
                  <tr className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                    <td className="py-2 pl-4 text-muted-foreground text-xs">Ship Storage</td>
                    {slotSizes.map((s) => {
                      const dock = (data as Record<string, unknown>)[`dock_${s}`] as number ?? 0;
                      const storage = (data as Record<string, unknown>)[`storage_${s}`] as number ?? 0;
                      const val = storage > 0 ? storage : dock;
                      return (<td key={s} className="py-2 text-center text-sm">{val > 0 ? <span className="font-medium">{val}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}</td>);
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {data.drop_list_id && (
          <TabsContent value="drops" className="pt-4">
            <p className="text-xs text-muted-foreground mb-4">Drop table: <span className="font-mono">{data.drop_list_id}</span>. Each row is an independent roll; within a row, one item is selected by weighted chance.</p>
            <ShipDropTable listId={data.drop_list_id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
