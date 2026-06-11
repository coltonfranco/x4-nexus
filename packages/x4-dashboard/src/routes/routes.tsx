import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, Coins, Gauge, Package, Rocket, TrendingUp } from "lucide-react";

type TradeRoute = {
  ware_id: string;
  ware_name: string | null;
  buy_station_id: string;
  buy_sector: string | null;
  sell_station_id: string;
  sell_sector: string | null;
  buy_price: number | null;
  sell_price: number | null;
  margin: number;
  units_per_trip: number;
  profit_per_trip: number;
  hops: number | null;
  est_profit_per_hour: number;
};

type Sector = { sector_id: string; name: string | null };

const SHIPS = [
  { label: "Courier", sub: "S", cargo: 3000, speed: 580 },
  { label: "Trader", sub: "M", cargo: 8000, speed: 420 },
  { label: "Freighter", sub: "L", cargo: 22000, speed: 300 },
  { label: "Hauler", sub: "XL", cargo: 50000, speed: 250 },
] as const;

function pretty(macro: string | null): string {
  if (!macro) return "Unknown";
  return macro
    .replace(/_macro$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const fmt = (n: number) => n.toLocaleString();

const JUMP_OPTS: { label: string; val: number | null }[] = [
  { label: "∞", val: null },
  { label: "1★", val: 1 },
  { label: "2★", val: 2 },
  { label: "3★", val: 3 },
  { label: "4★", val: 4 },
  { label: "5★", val: 5 },
];

export default function RoutesPage() {
  const [ship, setShip] = useState<(typeof SHIPS)[number]>(SHIPS[1]);
  const [maxJumps, setMaxJumps] = useState<number | null>(null);

  const { data: routes = [], isLoading } = useQuery<TradeRoute[]>({
    queryKey: ["routes", ship.cargo, ship.speed],
    queryFn: () =>
      fetch(`/api/v1/routes?ship_cargo=${ship.cargo}&ship_speed=${ship.speed}&limit=40`).then((r) =>
        r.json()
      ),
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

  // Auto-trade jump limit (pilot stars). Repeat orders ignore it, so default ∞.
  const shown = useMemo(
    () => (maxJumps == null ? routes : routes.filter((r) => r.hops != null && r.hops <= maxJumps)),
    [routes, maxJumps]
  );
  const max = Math.max(1, ...shown.map((r) => r.est_profit_per_hour));

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border shrink-0 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-emerald-500" /> Trade Routes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Most profitable runs right now · ranked by profit / hour
          </p>
        </div>
        {/* Ship preset pills */}
        <div className="flex items-center gap-1.5">
          {SHIPS.map((s) => {
            const active = s.label === ship.label;
            return (
              <button
                key={s.label}
                onClick={() => setShip(s)}
                className={`flex flex-col items-center rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <span className="font-semibold flex items-center gap-1">
                  <Rocket className="h-3 w-3" />
                  {s.label} <span className="opacity-60">{s.sub}</span>
                </span>
                <span className="tabular-nums opacity-70">{fmt(s.cargo)} m³</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-trade jump limit */}
      <div className="px-6 py-2 border-b border-border flex items-center gap-2 text-xs shrink-0 flex-wrap">
        <span className="text-muted-foreground flex items-center gap-1">
          <Gauge className="h-3.5 w-3.5" /> Auto-trade range
        </span>
        {JUMP_OPTS.map((o) => {
          const active = maxJumps === o.val;
          return (
            <button
              key={o.label}
              onClick={() => setMaxJumps(o.val)}
              title={o.val == null ? "Unlimited (repeat orders)" : `Pilot ${o.label} — up to ${o.val} jump${o.val === 1 ? "" : "s"}`}
              className={`rounded-md px-2 py-1 tabular-nums transition-colors ${
                active ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        <span className="text-muted-foreground/60 ml-1">repeat orders ignore jump limits</span>
        <span className="ml-auto text-muted-foreground tabular-nums">{shown.length} routes</span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground p-6">Loading…</p>
        ) : shown.length === 0 ? (
          <EmptyState jumpLimited={maxJumps != null} />
        ) : (
          <div className="space-y-1.5 max-w-5xl mx-auto">
            {shown.map((r, i) => (
              <div
                key={`${r.ware_id}-${i}`}
                className="group relative grid grid-cols-[2rem_1fr_auto] items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-colors"
              >
                {/* rank */}
                <div
                  className={`text-center text-sm font-bold tabular-nums ${
                    i === 0 ? "text-amber-400" : i < 3 ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>

                {/* ware + flow */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span className="truncate">{r.ware_name ?? r.ware_id}</span>
                    <span className="flex items-center gap-1 text-xs text-emerald-500 tabular-nums">
                      <Coins className="h-3 w-3" />+{fmt(r.margin)}/u
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Package className="h-3 w-3" />
                      {fmt(r.units_per_trip)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 min-w-0">
                    <span className="truncate text-blue-400/90">
                      {sectorName(r.buy_sector)}
                      {r.buy_price != null && (
                        <span className="ml-1 opacity-70 tabular-nums">buy @{fmt(r.buy_price)}</span>
                      )}
                    </span>
                    <ArrowRight className="h-3 w-3 shrink-0 text-emerald-500" />
                    <span className="truncate text-amber-400/90">
                      {sectorName(r.sell_sector)}
                      {r.sell_price != null && (
                        <span className="ml-1 opacity-70 tabular-nums">sell @{fmt(r.sell_price)}</span>
                      )}
                    </span>
                    {r.hops != null && (
                      <span className="shrink-0 opacity-60">· {r.hops} jump{r.hops === 1 ? "" : "s"}</span>
                    )}
                  </div>
                </div>

                {/* profit/hr hero + bar */}
                <div className="w-40 shrink-0 text-right">
                  <div className="text-base font-bold tabular-nums text-emerald-400">
                    {fmt(r.est_profit_per_hour)}
                    <span className="text-xs font-normal text-muted-foreground"> /hr</span>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {fmt(r.profit_per_trip)} / trip
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                      style={{ width: `${(r.est_profit_per_hour / max) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ jumpLimited }: { jumpLimited: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground gap-2">
      <TrendingUp className="h-10 w-10 opacity-30" />
      {jumpLimited ? (
        <>
          <p className="text-sm">No routes within that jump range.</p>
          <p className="text-xs">Raise the pilot rank, pick ∞, or use repeat orders (no jump limit).</p>
        </>
      ) : (
        <>
          <p className="text-sm">No routes yet.</p>
          <p className="text-xs">Activate a save with station trade offers to see ranked routes.</p>
        </>
      )}
    </div>
  );
}
