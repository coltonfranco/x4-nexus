import { useQuery } from "@tanstack/react-query";
import { EntityIcon } from "../EntityIcon";
import { FactionBadge } from "../FactionBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Currency } from "../Currency";
import { cn } from "../../lib/utils";
import { ProductionChain } from "./ProductionChain";
import { WareDropSources } from "./WareDropSources";
import { WareTradeOffers } from "./WareTradeOffers";
import { getWareGroupColor, RACE_COLORS, methodLabel } from "../../lib/constants";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { FactionSummary } from "../../lib/map/types";

type ProductionInput = { ware_id: string; amount: number };
type ProductionMethod = {
  method: string;
  time_sec: number;
  amount: number;
  workforce: number | null;
  inputs: ProductionInput[];
};

type WareDetail = {
  ware_id: string;
  name: string;
  group_id: string | null;
  category: string;
  transport: string | null;
  volume: number;
  price_min: number | null;
  price_avg: number | null;
  price_max: number | null;
  market_min: number | null;
  market_avg: number | null;
  market_max: number | null;
  sell_qty: number | null;
  buy_qty: number | null;
  net_demand: number | null;
  tags: string | null;
  icon_url: string | null;
  has_production: boolean;
  has_drops: boolean;
  storage_class: string | null;
  restriction_licence: string | null;
  use_threshold: number | null;
  description?: string | null;
  owners: string[];
  illegal_factions: string[];
  used_for: string[];
  production: ProductionMethod[];
  exclusive_race: string | null;
};

export function WareDetailPanel({ wareId }: { wareId: string }) {
  const { data, isLoading } = useQuery<WareDetail>({
    queryKey: ["wares", wareId],
    queryFn: () => fetch(`/api/v1/wares/${wareId}`).then((r) => r.json()),
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
    staleTime: Infinity,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground text-sm">Loading details…</div>;
  if (!data) return null;

  const factionMap = new Map(factions.map(f => [f.faction_id, f]));
  const priceDiff = (data.market_avg != null && data.price_avg != null) ? data.market_avg - data.price_avg : 0;
  const showLive = data.market_avg != null && data.market_avg !== data.price_avg;

  return (
    <div className="flex flex-col h-full -mx-6 -my-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6 px-6 pt-6 pb-4">
        <div className="shrink-0 w-full sm:w-48 h-40 sm:h-48 flex items-center justify-center rounded-xl bg-muted/10 border border-border/60">
          {data.icon_url ? (
            <img src={data.icon_url} alt={data.name} className="w-32 h-32 object-contain transition-transform hover:scale-105 duration-500" />
          ) : (
            <EntityIcon src={null} alt={data.name} size={64} />
          )}
        </div>

        <div className="flex-1 flex flex-col justify-center min-w-0 py-1">
          <div className="flex items-center gap-3 min-w-0">
            {data.icon_url && <EntityIcon src={data.icon_url} alt={data.name} size={28} className="opacity-70 shrink-0" />}
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate" title={data.name}>
              {data.name}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {data.group_id && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium border capitalize ${getWareGroupColor(data.group_id)}`}>
                {data.group_id.replace("_", " ")}
              </span>
            )}
            {(() => {
              const exclusiveRace = data.exclusive_race ? RACE_COLORS[data.exclusive_race] : null;
              return exclusiveRace ? (
                <span
                  className={cn("inline-flex items-center px-2 py-0.5 rounded text-sm font-medium uppercase font-mono", exclusiveRace.bg, exclusiveRace.color)}
                >
                  {methodLabel(data.exclusive_race!)} Exclusive
                </span>
              ) : null;
            })()}
            {data.illegal_factions.length > 0 && (
              <TooltipProvider>
                <Tooltip delayDuration={150}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium border bg-destructive/10 text-destructive border-destructive/30 cursor-help">
                      Contraband
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="p-3 border border-border shadow-xl bg-popover text-popover-foreground">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Illegal To</p>
                    <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                      {data.illegal_factions.map(fid => {
                        const f = factionMap.get(fid);
                        return f ? <FactionBadge key={fid} name={f.name} color_hex={f.color_hex} icon_url={f.icon_url} faction_id={f.faction_id} /> : <span key={fid} className="text-sm">{fid}</span>;
                      })}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {data.restriction_licence && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-sm font-medium border bg-destructive/10 text-destructive border-destructive/30">
                Requires: {data.restriction_licence}
              </span>
            )}
          </div>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 max-w-xl">
            {showLive ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Live Price</span>
                {data.market_avg != null ? (
                  <div className="flex items-center gap-2">
                    <Currency value={data.market_avg} />
                    {priceDiff !== 0 && (
                      <span className={cn("flex items-center text-xs font-mono font-medium", priceDiff > 0 ? "text-success" : "text-destructive")}>
                        {priceDiff > 0 ? <ArrowUp className="w-3 h-3 mr-0.5" /> : <ArrowDown className="w-3 h-3 mr-0.5" />}
                        <Currency value={Math.abs(priceDiff)} icon={false} abbreviate={false} className="!text-inherit" />
                      </span>
                    )}
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Avg Price</span>
                {data.price_avg != null ? <Currency value={data.price_avg} /> : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Min Price</span>
              {data.price_min != null ? <Currency value={data.price_min} /> : <span className="text-xs text-muted-foreground">—</span>}
            </div>

            {showLive && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Base Price</span>
                {data.price_avg != null ? <Currency value={data.price_avg} /> : <span className="text-xs text-muted-foreground">—</span>}
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Max Price</span>
              {data.price_max != null ? <Currency value={data.price_max} /> : <span className="text-xs text-muted-foreground">—</span>}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Net Demand</span>
              {data.net_demand != null ? (
                <span className={cn("text-xs font-mono font-medium", data.net_demand > 0 ? "text-success" : data.net_demand < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {data.net_demand > 0 ? "+" : ""}{data.net_demand.toLocaleString()}
                </span>
              ) : <span className="text-xs text-muted-foreground">—</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0">Volume</span>
              <span className="text-sm font-medium tracking-tight">
                {data.volume.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">m³</span>
              </span>
            </div>
          </div>

          {data.owners.length > 0 && (
            <div className="mt-6 flex flex-col gap-3">
              <div className="flex gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider w-24 shrink-0 pt-1">Traded By</span>
                <div className="flex flex-wrap gap-1.5">
                  {data.owners.map(fid => {
                    const f = factionMap.get(fid);
                    return f ? <FactionBadge key={fid} name={f.name} color_hex={f.color_hex} icon_url={f.icon_url} faction_id={f.faction_id} /> : <span key={fid} className="text-sm">{fid}</span>;
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="trade" className="flex-1 flex flex-col">
        <div className="border-b border-border/40 pb-px mt-2 px-6">
          <TabsList className="bg-transparent border-none p-0 h-auto space-x-6 w-full justify-start">
            <TabsTrigger value="trade" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Trade Data</TabsTrigger>
            {data.has_production && <TabsTrigger value="production" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Production</TabsTrigger>}
            {data.has_drops && <TabsTrigger value="drops" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Drops</TabsTrigger>}
            {data.description && <TabsTrigger value="description" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Description</TabsTrigger>}
          </TabsList>
        </div>

        {data.description && (
          <TabsContent value="description" className="pt-5 px-6 pb-6 outline-none">
            <div className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {data.description}
            </div>
          </TabsContent>
        )}

        {data.has_production && (
          <TabsContent value="production" className="pt-5 px-6 pb-6 outline-none">
            <ProductionChain wareId={wareId} />
          </TabsContent>
        )}

        {data.has_drops && (
          <TabsContent value="drops" className="pt-5 px-6 pb-6 outline-none">
            <WareDropSources wareId={wareId} />
          </TabsContent>
        )}

        <TabsContent value="trade" className="pt-5 px-6 pb-6 outline-none">
          <WareTradeOffers wareId={wareId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
