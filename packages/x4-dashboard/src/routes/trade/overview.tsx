import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Wallet, Landmark, ArrowLeftRight, Building2, Rocket,
  ArrowUpRight, ArrowDownLeft, Activity, Flame, Boxes, AlertTriangle, RefreshCw,
} from "lucide-react";
import { HUDCard } from "../../components/HUDCard";
import { Currency } from "../../components/Currency";
import { EntityIcon } from "../../components/EntityIcon";
import { PageLoaderPreset } from "../../components/PageLoader";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { NetWorthChart } from "../../components/NetWorthChart";
import type { NetWorthPoint } from "../../components/NetWorthChart";
import { formatAge } from "../../lib/formatters";

// ── Types (mirror /api/v1/economy/* + /player) ───────────────────────────────────

type Account = {
  owner: string; name: string | null; kind: "station" | "ship" | "account";
  faction: string | null; is_player: boolean;
  net_worth: number | null; net_worth_assets: number | null;
  live_cash: number | null;
  account_amount: number | null; account_min: number | null; account_max: number | null;
  latest_time: number | null; event_count: number;
};
type WarePnl = {
  ware: string | null; ware_name: string | null; icon_url: string | null;
  income: number; spend: number; net: number; sell_count: number; buy_count: number;
};
type Trade = {
  time: number; ware: string | null; ware_name: string | null; price: number | null;
  quantity: number | null; buyer_name: string | null; buyer_is_player: boolean;
  seller_name: string | null; seller_is_player: boolean;
};
type WareMarket = {
  ware_id: string; ware_name: string | null; net_demand: number;
  price_index: number | null; classification: "shortage" | "balanced" | "surplus";
  buy_qty: number; sell_qty: number;
};
type Player = { name: string | null; credits: number | null };
type NetWorthBreakdown = {
  cash: number;
  station_accounts: number;
  ship_hulls: number;
  ship_equipment: number;
  station_modules: number;
  inventory: number;
  total: number;
};

const KIND_ICON = { station: Building2, ship: Rocket, account: Landmark } as const;

function useJson<T>(key: string, url: string) {
  // Throw on a bad response so react-query keeps `data` undefined (the `= []`/`?.` defaults
  // then apply). Returning null here would defeat those defaults and crash on `.map`/`.length`.
  const q = useQuery<T>({
    queryKey: [key],
    queryFn: async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url} → ${r.status}`);
      return r.json() as Promise<T>;
    },
    staleTime: 30_000,
    // The desktop shell launches the API and the webview together; tolerate the ~1s
    // window where uvicorn isn't bound yet so the first paint self-heals without a reload.
    retry: 6,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 5000),
  });
  return { ...q, isError: q.isError, error: q.error };
}

// ── Page ─────────────────────────────────────────────────────────────────────────

export default function TradeOverviewPage() {
  const { data: player, isLoading: playerLoading } = useJson<Player>("player-credits", "/api/v1/player");
  const { data: accounts = [], isLoading: acctLoading, isError: acctErr, error: acctErrMsg, refetch: refetchAcct } = useJson<Account[]>("economy-accounts", "/api/v1/economy/accounts?player_only=true");
  const { data: networth = [], isLoading: nwLoading, isError: nwErr, error: nwErrMsg, refetch: refetchNw } = useJson<NetWorthPoint[]>("economy-networth", "/api/v1/economy/networth?player_only=true");
  const { data: pnl = [], isLoading: pnlLoading, isError: pnlErr, error: pnlErrMsg, refetch: refetchPnl } = useJson<WarePnl[]>("economy-pnl", "/api/v1/economy/pnl");
  const { data: trades = [], isLoading: tradesLoading, isError: tradesErr, error: tradesErrMsg, refetch: refetchTrades } = useJson<Trade[]>("economy-trades-recent", "/api/v1/economy/trades?player_only=true&limit=40");
  const { data: market = [], isLoading: marketLoading, isError: marketErr, error: marketErrMsg, refetch: refetchMarket } = useJson<WareMarket[]>("economy-market", "/api/v1/economy/wares?sort=net_demand&limit=400");
  const { data: netWorthBreakdown, isLoading: nwBreakdownLoading, isError: nwBreakdownErr, error: nwBreakdownErrMsg, refetch: refetchNwBreakdown } = useJson<NetWorthBreakdown>("economy-networth-current", "/api/v1/economy/networth/current");

  const isLoading = playerLoading || acctLoading || nwLoading || pnlLoading || tradesLoading || marketLoading || nwBreakdownLoading;

  const errors = useMemo(() => {
    const e: { key: string; msg: string }[] = [];
    if (acctErr && acctErrMsg) e.push({ key: "accounts", msg: String(acctErrMsg) });
    if (nwErr && nwErrMsg) e.push({ key: "networth", msg: String(nwErrMsg) });
    if (pnlErr && pnlErrMsg) e.push({ key: "pnl", msg: String(pnlErrMsg) });
    if (tradesErr && tradesErrMsg) e.push({ key: "trades", msg: String(tradesErrMsg) });
    if (marketErr && marketErrMsg) e.push({ key: "market", msg: String(marketErrMsg) });
    if (nwBreakdownErr && nwBreakdownErrMsg) e.push({ key: "networth-breakdown", msg: String(nwBreakdownErrMsg) });
    return e;
  }, [acctErr, acctErrMsg, nwErr, nwErrMsg, pnlErr, pnlErrMsg, tradesErr, tradesErrMsg, marketErr, marketErrMsg, nwBreakdownErr, nwBreakdownErrMsg]);

  // Credit balance = the player's master account (kind='account', the faction-level
  // aggregate tracked by the economylog). Falls back to the old net_worth sort if absent.
  const masterAccount = useMemo(
    () => accounts.find((a) => a.kind === "account" && a.net_worth != null)
        ?? [...accounts].filter((a) => a.net_worth != null).sort((a, b) => (b.net_worth ?? 0) - (a.net_worth ?? 0))[0],
    [accounts],
  );

  // Empire value from the comprehensive backend calculation
  const empireValue = netWorthBreakdown?.total ?? 0;

  const creditSeries = useMemo(
    () => networth
      .filter((p) => p.owner === masterAccount?.owner && p.v != null && p.type != null)
      .sort((a, b) => a.time - b.time),
    [networth, masterAccount],
  );

  const totals = useMemo(() => {
    const income = pnl.reduce((s, p) => s + p.income, 0);
    const spend = pnl.reduce((s, p) => s + p.spend, 0);
    const tradeCount = pnl.reduce((s, p) => s + p.sell_count + p.buy_count, 0);
    return { income, spend, net: income - spend, volume: income + spend, tradeCount };
  }, [pnl]);

  const maxAbsNet = useMemo(() => Math.max(1, ...pnl.map((p) => Math.abs(p.net))), [pnl]);

  const currentTime = useMemo(() => {
    return Math.max(
      0,
      ...accounts.map((a) => a.latest_time ?? 0),
      ...trades.map((t) => t.time)
    );
  }, [accounts, trades]);

  const shortages = useMemo(() => market.filter((m) => m.classification === "shortage").slice(0, 6), [market]);
  const surpluses = useMemo(
    () => market.filter((m) => m.classification === "surplus").sort((a, b) => a.net_demand - b.net_demand).slice(0, 6),
    [market],
  );

  const { stationAccounts, shipAccounts, otherAccounts, totalVisibleAccounts } = useMemo(() => {
    const stations = accounts
      .filter((a) => a.kind === "station")
      .sort((a, b) => (b.account_amount ?? 0) - (a.account_amount ?? 0));
    const ships = accounts
      .filter((a) => a.kind === "ship" && ((a.net_worth ?? 0) > 0 || (a.live_cash ?? 0) > 0))
      .sort((a, b) => (b.live_cash ?? b.net_worth ?? 0) - (a.live_cash ?? a.net_worth ?? 0));
    const others = accounts
      .filter((a) => a.kind !== "station" && a.kind !== "ship")
      .sort((a, b) => (b.net_worth ?? 0) - (a.net_worth ?? 0));
    return {
      stationAccounts: stations,
      shipAccounts: ships,
      otherAccounts: others,
      totalVisibleAccounts: stations.length + ships.length + others.length,
    };
  }, [accounts]);

  if (isLoading) return <div className="p-6"><PageLoaderPreset preset="economy" /></div>;

  if (errors.length > 0) {
    const retryAll = () => {
      if (acctErr) refetchAcct();
      if (nwErr) refetchNw();
      if (pnlErr) refetchPnl();
      if (tradesErr) refetchTrades();
      if (marketErr) refetchMarket();
      if (nwBreakdownErr) refetchNwBreakdown();
    };
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-3 p-6">
          <AlertTriangle className="h-10 w-10 text-[var(--danger)] opacity-60" />
          <p className="text-sm font-semibold text-[var(--danger)]">API errors — check server logs</p>
          <div className="text-xs space-y-1 max-w-md mb-2">
            {errors.map((e) => (
              <div key={e.key} className="flex gap-2">
                <span className="font-mono text-[var(--danger)] shrink-0">{e.key}</span>
                <span className="text-muted-foreground truncate">{e.msg}</span>
              </div>
            ))}
          </div>
          <button
            onClick={retryAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const allEmpty = accounts.length === 0 && pnl.length === 0 && market.length === 0 && trades.length === 0;

  if (allEmpty) {
    return (
      <div className="flex flex-col h-full">
        <Header />
        <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-3">
          <TrendingUp className="h-12 w-12 opacity-30" />
          <p className="text-sm max-w-md text-center">
            No economy history yet. Ingest a save (or restart the API server after updating) to populate your finances.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
        {/* KPI hero row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi icon={Wallet} label="Global Credits" tone="gold">
            <Currency value={player?.credits ?? null} icon={false} className="text-2xl" />
          </Kpi>
          <TooltipProvider>
            <UiTooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <div className="cursor-help">
                  <Kpi icon={Landmark} label="Empire Value" tone="gold">
                    <Currency value={empireValue} icon={false} className="text-2xl" />
                  </Kpi>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="w-[320px] p-3 text-sm space-y-2 bg-popover text-popover-foreground border border-border shadow-lg">
                <div className="flex justify-between items-center font-medium border-b border-border pb-1">
                  <span>Empire Value</span>
                  <Currency value={empireValue} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Global Credits</span>
                  <Currency value={netWorthBreakdown?.cash ?? null} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Station Accounts</span>
                  <Currency value={netWorthBreakdown?.station_accounts ?? null} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground mt-2">
                  <span>Total Value of Ships</span>
                  <Currency value={(netWorthBreakdown?.ship_hulls ?? 0) + (netWorthBreakdown?.ship_equipment ?? 0)} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground pl-3 text-xs border-l-2 border-border ml-1">
                  <span>Ship Hulls</span>
                  <Currency value={netWorthBreakdown?.ship_hulls ?? null} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground pl-3 text-xs border-l-2 border-border ml-1">
                  <span>Ship Equipment</span>
                  <Currency value={netWorthBreakdown?.ship_equipment ?? null} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Total Value of Stations</span>
                  <Currency value={netWorthBreakdown?.station_modules ?? null} icon={false} />
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Inventory</span>
                  <Currency value={netWorthBreakdown?.inventory ?? null} icon={false} />
                </div>
                <div className="text-[11px] text-muted-foreground/80 mt-2 pt-2 border-t border-border">
                  Estimated valuation matching the in-game Player Information menu.
                </div>
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
          <Kpi icon={totals.net >= 0 ? TrendingUp : TrendingDown} label="Net Profit · all time" tone={totals.net >= 0 ? "good" : "bad"}>
            <Currency value={totals.net} icon={false} dynamicColor className="text-2xl" />
          </Kpi>
          <Kpi icon={ArrowLeftRight} label="Trade Volume · all time" tone="neutral">
            <div className="flex items-baseline gap-2">
              <Currency value={totals.volume} icon={false} abbreviate className="text-2xl" />
              <span className="text-xs text-muted-foreground tabular-nums">{totals.tradeCount} trades</span>
            </div>
          </Kpi>
        </div>

        {/* Credit balance over time */}
        <NetWorthChart
          data={creditSeries}
          title="Credit Balance Over Time"
          subtitle={player?.name ? <span className="text-xs text-muted-foreground">{player.name}</span> : undefined}
        />

        {/* P&L by commodity + Market pulse */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <HUDCard className="rounded-lg border-border overflow-hidden">
            <CardHeader icon={Boxes} title="Profit & Loss by Commodity"
              extra={<span className="text-xs text-muted-foreground">external trades</span>} />
            <div className="divide-y divide-border/40">
              {pnl.length === 0 && <Empty text="No external trades recorded." />}
              {pnl.map((p) => {
                const pos = p.net >= 0;
                const pct = (Math.abs(p.net) / maxAbsNet) * 100;
                return (
                  <div key={p.ware ?? "?"} className="flex items-center gap-3 px-4 py-2.5">
                    <EntityIcon src={p.icon_url} alt={p.ware_name ?? ""} size={26} />
                    <div className="w-32 shrink-0 truncate text-sm">{p.ware_name ?? p.ware}</div>
                    {/* diverging bar */}
                    <div className="relative flex-1 h-5 flex items-center">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border" />
                      <div
                        className="absolute h-3 rounded-sm"
                        style={pos
                          ? { left: "50%", width: `${pct / 2}%`, background: "var(--success)", opacity: 0.85 }
                          : { right: "50%", width: `${pct / 2}%`, background: "var(--danger)", opacity: 0.85 }}
                      />
                    </div>
                    <Currency value={p.net} dynamicColor icon={false} abbreviate className="w-24 text-right text-sm" />
                  </div>
                );
              })}
            </div>
          </HUDCard>

          <HUDCard className="rounded-lg border-border overflow-hidden">
            <CardHeader icon={Activity} title="Market Pulse"
              extra={<span className="text-xs text-muted-foreground">universe supply / demand</span>} />
            <div className="grid grid-cols-2 divide-x divide-border/40">
              <MarketColumn title="Top Shortages" icon={Flame} tone="bad" rows={shortages} metric="demand" />
              <MarketColumn title="Top Surpluses" icon={Boxes} tone="good" rows={surpluses} metric="supply" />
            </div>
          </HUDCard>
        </div>

        {/* Recent trades + Accounts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <HUDCard className="rounded-lg border-border overflow-hidden">
            <CardHeader icon={ArrowLeftRight} title="Recent Trades"
              extra={<span className="text-xs text-muted-foreground tabular-nums">{trades.length}</span>} />
            <div className="divide-y divide-border/40 max-h-96 overflow-auto">
              {trades.length === 0 && <Empty text="No player trades recorded yet." />}
              {trades.map((t, i) => {
                const sell = t.seller_is_player && !t.buyer_is_player;
                const buy = t.buyer_is_player && !t.seller_is_player;
                const internal = t.seller_is_player && t.buyer_is_player;
                const total = (t.price ?? 0) * (t.quantity ?? 0);
                const asset = t.seller_is_player ? t.seller_name : t.buyer_name;
                return (
                  <div key={i} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                    <span className={`flex items-center gap-1 w-16 shrink-0 text-xs font-semibold ${sell ? "text-[var(--success)]" : buy ? "text-[var(--danger)]" : "text-muted-foreground"}`}>
                      {sell ? <ArrowUpRight className="h-3.5 w-3.5" /> : buy ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3 w-3" />}
                      {internal ? "MOVE" : sell ? "SELL" : "BUY"}
                    </span>
                    <span className="w-32 truncate">{t.ware_name ?? t.ware}</span>
                    <span className="flex-1 truncate text-muted-foreground text-xs">{asset}</span>
                    <span className="tabular-nums text-muted-foreground text-xs">×{(t.quantity ?? 0).toLocaleString()}</span>
                    <Currency value={internal ? null : sell ? total : -total} dynamicColor icon={false} abbreviate className="w-20 text-right" />
                    <span className="w-10 text-right tabular-nums text-muted-foreground text-xs" title="Age">{formatAge(Math.max(0, currentTime - t.time))}</span>
                  </div>
                );
              })}
            </div>
          </HUDCard>

          <HUDCard className="rounded-lg border-border flex flex-col overflow-hidden max-h-96">
            <CardHeader icon={Landmark} title="Accounts"
              extra={<span className="text-xs text-muted-foreground tabular-nums">{totalVisibleAccounts}</span>} />
            <div className="flex-1 overflow-auto bg-muted/5 relative">
              <AccountGroupRenderer 
                title="Stations" 
                accounts={stationAccounts} 
                valueTooltip="Station account balance vs. operating budget target. The bar shows current / manager-requested budget."
              />
              <AccountGroupRenderer 
                title="Ships (with value)" 
                accounts={shipAccounts} 
                valueTooltip="Total estimated value of the trade cargo currently held by this ship."
              />
              <AccountGroupRenderer 
                title="Master Accounts" 
                accounts={otherAccounts} 
                valueTooltip="Your empire's overall net worth (total liquid cash + total value of all empire assets)."
              />
              {totalVisibleAccounts === 0 && <Empty text="No accounts match criteria." />}
            </div>
          </HUDCard>
        </div>
      </div>
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────────

function Header() {
  return (
    <div className="px-6 pt-5 pb-3 shrink-0 border-b border-border">
      <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
        <TrendingUp className="h-6 w-6 text-primary" /> Economic Overview
      </h1>
      <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
        Faction finances &amp; system economy
      </p>
    </div>
  );
}

const TONE: Record<string, string> = {
  gold: "text-gold", good: "text-[var(--success)]", bad: "text-[var(--danger)]", neutral: "text-foreground",
};

function Kpi({ icon: Icon, label, tone, children }: { icon: typeof Wallet; label: string; tone: string; children: React.ReactNode }) {
  return (
    <HUDCard className="rounded-lg border-border p-4 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
        <Icon className={`h-3.5 w-3.5 ${TONE[tone]}`} /> {label}
      </div>
      {children}
    </HUDCard>
  );
}

function CardHeader({ icon: Icon, title, extra }: { icon: typeof Wallet; title: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function MarketColumn({ title, icon: Icon, tone, rows, metric }: {
  title: string; icon: typeof Wallet; tone: "good" | "bad";
  rows: WareMarket[]; metric: "demand" | "supply";
}) {
  const color = tone === "bad" ? "var(--danger)" : "var(--success)";
  return (
    <div>
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold" style={{ color }}>
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <div className="divide-y divide-border/30">
        {rows.length === 0 && <div className="px-3 py-4 text-xs text-muted-foreground text-center">—</div>}
        {rows.map((m) => (
          <div key={m.ware_id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="flex-1 truncate">{m.ware_name ?? m.ware_id}</span>
            {m.price_index != null && (
              <span className="text-[10px] tabular-nums text-muted-foreground" title="price vs reference">
                {m.price_index > 1 ? "+" : ""}{Math.round((m.price_index - 1) * 100)}%
              </span>
            )}
            <span className="tabular-nums text-xs w-16 text-right" style={{ color }}>
              {fmtShort(metric === "demand" ? m.net_demand : -m.net_demand)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}k`;
  return `${Math.round(v)}`;
}

const BUDGET_FILL = (current: number, max: number): { pct: number; color: string } => {
  if (max <= 0) return { pct: 0, color: "bg-muted/30" };
  const ratio = Math.min(current / max, 1.5);
  const pct = Math.round(ratio * 100);
  if (current >= max) return { pct: Math.min(pct, 100), color: "bg-[var(--success)]/60" };
  if (ratio >= 0.5) return { pct, color: "bg-gold/50" };
  return { pct: Math.max(pct, 5), color: "bg-[var(--danger)]/50" };
};

function BudgetBar({ current, max }: { current: number; max: number }) {
  const { pct, color } = BUDGET_FILL(current, max);
  return (
    <div className="absolute inset-x-0 bottom-0 h-1 bg-muted/20 rounded-b-sm overflow-hidden">
      <div
        className={`h-full ${color} transition-all rounded-b-sm`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AccountGroupRenderer({ title, accounts, valueTooltip }: { title: string; accounts: Account[]; valueTooltip: string }) {
  if (accounts.length === 0) return null;
  const isStation = accounts[0]?.kind === "station";
  const valueLabel = isStation ? "Balance" : "Est. Value";

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-1.5 text-[10px] uppercase font-bold text-muted-foreground tracking-wider bg-muted/20 sticky top-0 backdrop-blur z-10 border-y border-border/40 first:border-t-0">
        <span className="flex-1 shrink-0">{title}</span>
        <span className="w-14 text-center shrink-0">Traffic</span>
        <TooltipProvider>
          <UiTooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <span className="w-20 text-right shrink-0 cursor-help underline decoration-dotted underline-offset-2">{valueLabel}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs font-normal">
              {valueTooltip}
            </TooltipContent>
          </UiTooltip>
        </TooltipProvider>
      </div>
      <div className="divide-y divide-border/40">
        {accounts.map((a) => {
          const Icon = KIND_ICON[a.kind];
          const displayValue = isStation ? a.account_amount : a.net_worth;
          const hasBudget = isStation && a.account_amount != null && a.account_max != null && a.account_max > 0;
          
          let trafficLabel = "Low";
          let trafficColor = "text-muted-foreground bg-muted/30";
          if (a.event_count > 50) {
            trafficLabel = "High";
            trafficColor = "text-[var(--success)] bg-[var(--success)]/10";
          } else if (a.event_count > 10) {
            trafficLabel = "Med";
            trafficColor = "text-gold bg-gold/10";
          }
          
          return (
            <div key={a.owner} className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/10 transition-colors relative">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{a.name ?? a.owner}</span>
              
              <div className="w-14 flex justify-center shrink-0">
                <TooltipProvider>
                  <UiTooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <div className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold cursor-help ${trafficColor}`}>
                        {trafficLabel}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs font-normal">
                      {a.event_count} transaction events recorded
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              </div>
              
              <TooltipProvider>
                <UiTooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <span className="w-20 text-right shrink-0 cursor-default">
                      <Currency value={displayValue} icon={false} abbreviate className="w-20 text-right shrink-0" />
                    </span>
                  </TooltipTrigger>
                  {hasBudget && (
                    <TooltipContent side="top" align="end" className="text-xs font-normal space-y-1 p-2 bg-popover text-popover-foreground border border-border shadow-lg">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Current</span>
                        <span className="tabular-nums font-mono">{(a.account_amount ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Budget</span>
                        <span className="tabular-nums font-mono">{(a.account_max ?? 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-4 font-medium pt-0.5 border-t border-border/40">
                        <span>{a.account_amount != null && a.account_max != null && a.account_amount >= a.account_max ? "Fully funded" : "Under-funded"}</span>
                        <span className="tabular-nums font-mono">
                          {a.account_min != null ? `${((a.account_amount ?? 0) / (a.account_max || 1) * 100).toFixed(0)}%` : "—"}
                        </span>
                      </div>
                    </TooltipContent>
                  )}
                </UiTooltip>
              </TooltipProvider>
              
              {hasBudget && <BudgetBar current={a.account_amount!} max={a.account_max!} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
