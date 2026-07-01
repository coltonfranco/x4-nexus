import { useQuery } from "@tanstack/react-query";
import { Currency } from "../Currency";
import { StatBar } from "../StatBar";
import { useMemo } from "react";
import { apiGet } from "../../lib/api";

type WareOfferRow = {
  station_id: string;
  station_name: string | null;
  sector_id: string | null;
  side: "buy" | "sell";
  price: number;
  quantity: number;
};

type Sector = { sector_id: string; name: string | null };

const pretty = (m: string) =>
  m.replace(/_macro$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function WareTradeOffers({ wareId }: { wareId: string }) {
  const { data: offers = [], isLoading } = useQuery<WareOfferRow[]>({
    queryKey: ["economy", "wares", wareId, "stations"],
    queryFn: () => apiGet<WareOfferRow[]>(`/api/v1/economy/wares/${encodeURIComponent(wareId)}/stations`),
  });

  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => apiGet<Sector[]>("/api/v1/map/sectors?limit=2000"),
    staleTime: 10 * 60_000,
  });

  const sectorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sectors) if (s.name) m.set(s.sector_id.toLowerCase(), s.name);
    return (id: string | null) => (id ? (m.get(id.toLowerCase()) ?? pretty(id)) : "Unknown");
  }, [sectors]);

  const bySector = (side: "buy" | "sell") => {
    const m = new Map<string, { qty: number; best: number; n: number }>();
    for (const o of offers.filter((x) => x.side === side)) {
      const key = o.sector_id ?? "—";
      const e = m.get(key) ?? { qty: 0, best: o.price, n: 0 };
      e.qty += o.quantity;
      e.best = side === "sell" ? Math.min(e.best, o.price) : Math.max(e.best, o.price);
      e.n += 1;
      m.set(key, e);
    }
    return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  };

  const demand = bySector("buy");
  const supply = bySector("sell");

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading trade offers…</p>;
  if (!offers || offers.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">No live trade offers found.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <DistColumn title="Top demand · where to sell" color="text-destructive" barColor="var(--destructive)" rows={demand} sectorName={sectorName} />
      <DistColumn title="Top supply · where to buy" color="text-success" barColor="var(--success)" rows={supply} sectorName={sectorName} />
    </div>
  );
}

function DistColumn({
  title, color, barColor, rows, sectorName,
}: {
  title: string;
  color: string;
  barColor: string;
  rows: [string, { qty: number; best: number; n: number }][];
  sectorName: (id: string | null) => string;
}) {
  const max = Math.max(1, ...rows.map(([, v]) => v.qty));
  return (
    <div className="border border-border/40 bg-muted/5 rounded-xl p-5 flex flex-col gap-4">
      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(([sid, v]) => (
            <div key={sid} className="flex items-end gap-4 text-sm group">
              <span className="w-40 mb-1 truncate font-medium group-hover:text-foreground transition-colors" title={sid}>
                {sectorName(sid === "—" ? null : sid)}
              </span>
              <div className="flex-1">
                <StatBar
                  value={v.qty}
                  max={max}
                  height={10}
                  color={barColor}
                  labelRight={v.qty.toLocaleString()}
                  className="w-full"
                />
              </div>
              <div className="w-20 mb-[1px] flex items-center justify-end text-xs">
                <Currency value={v.best} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
