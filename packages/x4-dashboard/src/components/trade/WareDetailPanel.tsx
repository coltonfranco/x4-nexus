import { useQuery } from "@tanstack/react-query";
import { EntityIcon } from "../EntityIcon";
import { FactionBadge } from "../FactionBadge";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Currency } from "../Currency";
import { ProductionChain } from "./ProductionChain";
import { WareDropSources } from "./WareDropSources";
import { WareTradeOffers } from "./WareTradeOffers";
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
  tags: string | null;
  icon_url: string | null;
  has_production: boolean;
  has_drops: boolean;
  storage_class: string | null;
  restriction_licence: string | null;
  use_threshold: number | null;
  owners: string[];
  illegal_factions: string[];
  production: ProductionMethod[];
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="shrink-0 flex items-center justify-center w-24 h-24 bg-muted/10 rounded-xl border border-border/60">
          <EntityIcon src={data.icon_url} alt={data.name} size={64} />
        </div>

        <div className="flex-1 flex flex-col justify-center min-w-0">
          <h2 className="text-2xl font-bold tracking-tight truncate" title={data.name}>
            {data.name}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <Badge variant="outline" className="px-2.5 py-0.5 text-sm capitalize">{data.category.replace("_", " ")}</Badge>
            {data.storage_class && <Badge variant="secondary" className="px-2.5 py-0.5 text-sm capitalize">{data.storage_class} Storage</Badge>}
            {data.transport && <Badge variant="outline" className="px-2.5 py-0.5 text-sm capitalize">Transport: {data.transport}</Badge>}
            {data.restriction_licence && <Badge variant="destructive" className="px-2.5 py-0.5 text-sm">Requires: {data.restriction_licence}</Badge>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Information</TabsTrigger>
          {data.has_production && <TabsTrigger value="production">Production</TabsTrigger>}
          {data.has_drops && <TabsTrigger value="drops">Drops</TabsTrigger>}
          <TabsTrigger value="trade">Trade</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6 pt-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Item Details</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted/10 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-1">Volume</p>
                <p className="text-sm font-bold tracking-tight">{data.volume.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">m³</span></p>
              </div>
              <div className="bg-muted/10 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-1">Min Price</p>
                {data.price_min != null ? <Currency value={data.price_min} /> : <span className="text-sm">—</span>}
              </div>
              <div className="bg-muted/10 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-1">Average Price</p>
                {data.price_avg != null ? <Currency value={data.price_avg} /> : <span className="text-sm">—</span>}
              </div>
              <div className="bg-muted/10 rounded-lg p-3 border border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-1">Max Price</p>
                {data.price_max != null ? <Currency value={data.price_max} /> : <span className="text-sm">—</span>}
              </div>
            </div>
          </div>

          {(data.illegal_factions.length > 0 || data.owners.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.illegal_factions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-3">Illegal To Factions</p>
                  <div className="flex flex-wrap gap-2">
                    {data.illegal_factions.map(fid => {
                      const f = factionMap.get(fid);
                      return f ? <FactionBadge key={fid} name={f.name} color_hex={f.color_hex} faction_id={f.faction_id} /> : <span key={fid} className="text-sm">{fid}</span>;
                    })}
                  </div>
                </div>
              )}
              {data.owners.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Traded By</p>
                  <div className="flex flex-wrap gap-2">
                    {data.owners.map(fid => {
                      const f = factionMap.get(fid);
                      return f ? <FactionBadge key={fid} name={f.name} color_hex={f.color_hex} faction_id={f.faction_id} /> : <span key={fid} className="text-sm">{fid}</span>;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {data.tags && (
             <div>
               <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Internal Tags</p>
               <div className="flex flex-wrap gap-1">
                 {data.tags.split(" ").map(t => (
                   <Badge key={t} variant="secondary" className="text-[10px] font-mono">{t}</Badge>
                 ))}
               </div>
             </div>
          )}
        </TabsContent>

        {data.has_production && (
          <TabsContent value="production" className="pt-4">
            <ProductionChain wareId={wareId} />
          </TabsContent>
        )}

        {data.has_drops && (
          <TabsContent value="drops" className="pt-4">
            <WareDropSources wareId={wareId} />
          </TabsContent>
        )}

        <TabsContent value="trade" className="pt-4">
          <WareTradeOffers wareId={wareId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
