import { useQuery } from "@tanstack/react-query";
import { Currency } from "../components/Currency";
import { useMemo, useState } from "react";
import { AlertTriangle, Boxes, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import { PageLoaderPreset } from "../components/PageLoader";
import { PageTabs, PageTab } from "../components/ui/page-tabs";

type WareMarket = {
  ware_id: string;
  ware_name: string | null;
  group_id: string | null;
  ref_price: number | null;
  sell_qty: number;
  buy_qty: number;
  sell_offers: number;
  buy_offers: number;
  best_buy_price: number | null;
  best_sell_price: number | null;
  avg_price: number;
  net_demand: number;
  price_index: number | null;
  classification: "shortage" | "balanced" | "surplus";
};

type WareOffer = {
  station_id: string;
  station_name: string | null;
  sector_id: string | null;
  side: "buy" | "sell";
  price: number;
  quantity: number;
};

type Sector = { sector_id: string; name: string | null };
type Filter = "shortage" | "surplus" | "all";

const fmt = (n: number) => n.toLocaleString();
const pretty = (m: string) =>
  m.replace(/_macro$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// Category stripe = "is it short or glutted" (amber/sky). Numbers use sign convention.
const STRIPE: Record<WareMarket["classification"], string> = {
  shortage: "bg-warning",
  surplus: "bg-info",
  balanced: "bg-muted-foreground/30",
};
const signColor = (n: number) =>
  n > 0 ? "text-success" : n < 0 ? "text-danger" : "text-muted-foreground";

export default function EconomyPage() {
  const [filter, setFilter] = useState<Filter>("shortage");
  const [open, setOpen] = useState<string | null>(null);

  const { data: market = [], isLoading } = useQuery<WareMarket[]>({
    queryKey: ["economy-wares"],
    queryFn: () => fetch("/api/v1/economy/wares?limit=2000").then((r) => r.json()),
  });
  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => fetch("/api/v1/map/sectors?limit=2000").then((r) => r.json()),
    staleTime: 10 * 60_000,
  });

  const sectorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sectors) if (s.name) m.set(s.sector_id.toLowerCase(), s.name);
    return (id: string | null) => (id ? (m.get(id.toLowerCase()) ?? pretty(id)) : "Unknown");
  }, [sectors]);

  const counts = useMemo(() => {
    const c = { shortage: 0, surplus: 0, all: market.length };
    for (const m of market) if (m.classification !== "balanced") c[m.classification]++;
    return c;
  }, [market]);

  const visible = useMemo(() => {
    const rows = filter === "all" ? market : market.filter((m) => m.classification === filter);
    return [...rows].sort((a, b) =>
      filter === "surplus" ? a.net_demand - b.net_demand : b.net_demand - a.net_demand
    );
  }, [market, filter]);

  const maxQty = Math.max(1, ...visible.map((m) => Math.max(m.sell_qty, m.buy_qty)));

  const TABS: { key: Filter; label: string; count: number; icon: typeof TrendingUp }[] = [
    { key: "shortage", label: "Shortages", count: counts.shortage, icon: TrendingUp },
    { key: "surplus", label: "Surplus", count: counts.surplus, icon: TrendingDown },
    { key: "all", label: "All", count: counts.all, icon: Boxes },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-warning" /> Supply Radar
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Galaxy-wide demand vs supply per ware · click a ware to see where it's concentrated
        </p>
        <PageTabs>
          {TABS.map((t) => {
            const active = filter === t.key;
            return (
              <PageTab
                key={t.key}
                active={active}
                onClick={() => setFilter(t.key)}
                className="flex items-center gap-1.5"
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                <span className={`tabular-nums rounded-full px-1.5 text-xs ${active ? "bg-primary-foreground/20" : "bg-muted-foreground/20"}`}>
                  {t.count}
                </span>
              </PageTab>
            );
          })}
        </PageTabs>
      </div>

      <div className="flex-1 overflow-auto p-4 pt-4">
        {isLoading ? (
          <PageLoaderPreset preset="economy" />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
            <Boxes className="h-10 w-10 opacity-30" />
            <p className="text-sm">No market data — activate a save with station offers.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-1">
            <div className="flex items-center gap-4 text-xs text-muted-foreground px-3 pb-1">
              <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-success" /> supply</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-sm bg-destructive" /> demand</span>
              <span className="ml-auto">+ = above-avg price / net demand</span>
            </div>

            {visible.map((m) => {
              const premium = m.price_index != null ? Math.round((m.price_index - 1) * 100) : null;
              const isOpen = open === m.ware_id;
              return (
                <div key={m.ware_id} className="rounded-md border border-border bg-card overflow-hidden">
                  <button
                    onClick={() => setOpen(isOpen ? null : m.ware_id)}
                    className="w-full grid grid-cols-[10rem_1fr_5rem_6rem_1rem] items-center gap-3 pr-3 py-2 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-9 w-1 rounded-r ${STRIPE[m.classification]}`} />
                      <span className="truncate text-sm font-medium" title={m.ware_id}>
                        {m.ware_name ?? m.ware_id}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Bar value={m.sell_qty} max={maxQty} color="bg-success" label="S" />
                      <Bar value={m.buy_qty} max={maxQty} color="bg-destructive" label="D" />
                    </div>
                    <div className="text-right">
                      {premium != null ? (
                        <span className={`text-sm font-semibold tabular-nums ${signColor(premium)}`}>
                          {premium > 0 ? "+" : ""}{premium}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      <div className="text-xs text-muted-foreground tabular-nums"><Currency value={m.avg_price} icon={false} dynamicColor className="text-muted-foreground" /></div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold tabular-nums ${signColor(m.net_demand)}`}>
                        {m.net_demand > 0 ? "+" : ""}{fmt(m.net_demand)}
                      </div>
                      <div className="text-xs text-muted-foreground">net demand</div>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && <WareDistribution wareId={m.ware_id} sectorName={sectorName} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function WareDistribution({ wareId, sectorName }: { wareId: string; sectorName: (id: string | null) => string }) {
  const { data: offers = [], isLoading } = useQuery<WareOffer[]>({
    queryKey: ["ware-offers", wareId],
    queryFn: () => fetch(`/api/v1/economy/wares/${encodeURIComponent(wareId)}/stations`).then((r) => r.json()),
  });

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
    return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);
  };

  const demand = bySector("buy");
  const supply = bySector("sell");

  if (isLoading) return <div className="px-4 py-3 text-xs text-muted-foreground border-t border-border">Loading…</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 py-3 border-t border-border bg-muted/10">
      <DistColumn title="Top demand · where to sell" color="text-danger" bar="bg-destructive/70" rows={demand} sectorName={sectorName} />
      <DistColumn title="Top supply · where to buy" color="text-success" bar="bg-success/70" rows={supply} sectorName={sectorName} />
    </div>
  );
}

function DistColumn({
  title, color, bar, rows, sectorName,
}: {
  title: string;
  color: string;
  bar: string;
  rows: [string, { qty: number; best: number; n: number }][];
  sectorName: (id: string | null) => string;
}) {
  const max = Math.max(1, ...rows.map(([, v]) => v.qty));
  return (
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${color}`}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">None.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map(([sid, v]) => (
            <div key={sid} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate" title={sid}>{sectorName(sid === "—" ? null : sid)}</span>
              <div className="flex-1 h-2 rounded-full bg-border/60 overflow-hidden">
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${(v.qty / max) * 100}%` }} />
              </div>
              <span className="w-16 text-right tabular-nums text-muted-foreground">{v.qty.toLocaleString()}</span>
              <span className="w-20 text-right tabular-nums text-muted-foreground/80">@<Currency value={v.best} abbreviate icon={false} />{v.n > 1 ? ` ·${v.n}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 text-xs text-muted-foreground tabular-nums">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-border/60 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}

