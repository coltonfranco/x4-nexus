import { useId, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { HUDCard } from "./HUDCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

// ── Shared types ────────────────────────────────────────────────────────────────

export type NetWorthPoint = {
  owner: string;
  name: string | null;
  time: number;
  v: number | null;
  type: string | null;          // event reason (trade/transfer/orderqueue_*/null baseline)
  delta: number | null;         // change from previous point (null for first)
  partner: string | null;       // counterparty raw component id
  partner_name: string | null;  // resolved station/ship name
  partner_faction: string | null;
  partner_faction_name: string | null;
  partner_kind: string | null;  // station | ship | account
  partner_is_player: boolean;
};

// ── Time range filter (mirrors in-game X4 options) ─────────────────────────────

export const TIME_RANGES = [
  { label: "10 min", seconds: 600 },
  { label: "60 min", seconds: 3_600 },
  { label: "6 hours", seconds: 21_600 },
  { label: "12 hours", seconds: 43_200 },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
  { label: "Max", seconds: Infinity },
] as const;
export const DEFAULT_RANGE = 21_600; // 6 hours

// ── Custom dot — colored by delta direction ────────────────────────────────────

function EventDot(props: { cx?: number; cy?: number; payload?: NetWorthPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const isBaseline = payload?.type == null;
  const delta = payload?.delta;
  let fill = "var(--muted-foreground)"; // baseline snapshots
  let r = 4;
  if (!isBaseline) {
    fill = delta != null && delta < 0 ? "var(--danger)" : "var(--success)";
    r = delta != null && Math.abs(delta) > 10_000_000 ? 4.5 : 3;
  }
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="var(--card)" strokeWidth={1} />;
}

// ── Custom tooltip — event-level detail ────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload?: NetWorthPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
        padding: "8px 12px",
        minWidth: 180,
      }}
    >
      <div className="text-[10px] text-muted-foreground mb-1 tabular-nums">
        {(p.time / 3600).toFixed(1)}h in-game
      </div>
      <div className="font-semibold text-sm tabular-nums">
        {p.v?.toLocaleString() ?? "—"} Cr
      </div>
      {p.delta != null && (
        <div className={`text-xs tabular-nums mt-0.5 ${p.delta >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
          {p.delta >= 0 ? "+" : ""}{p.delta.toLocaleString()} Cr
          {p.type && (
            <span className="text-muted-foreground ml-1">
              &middot; {eventLabel(p.type)}
            </span>
          )}
        </div>
      )}
      {p.type && p.partner_name && (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[240px]">
          {p.delta != null && p.delta < 0 ? "→" : "←"}{" "}
          {p.partner_name}
          {p.partner_kind && (
            <span className="opacity-60"> ({p.partner_kind})</span>
          )}
          {p.partner_faction_name && (
            <span className="opacity-50 ml-1">[{p.partner_faction_name}]</span>
          )}
          {p.partner_is_player && (
            <span className="text-primary/70 ml-1 font-semibold">you</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Y-axis formatter ────────────────────────────────────────────────────────────

function fmtShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(v / 1e3)}k`;
  return `${Math.round(v)}`;
}

// ── Event type labels ───────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  trade: "Trade",
  transfer: "Transfer",
  orderqueue_buy: "Buy Order",
  orderqueue_sell: "Sell Order",
  orderqueue_remove: "Order Fulfilled",
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

// ── Main component ──────────────────────────────────────────────────────────────

export interface NetWorthChartProps {
  data: NetWorthPoint[];
  title?: string;
  subtitle?: React.ReactNode;
  height?: number;
  className?: string;
}

export function NetWorthChart({
  data,
  title = "Net Worth Over Time",
  subtitle,
  height = 260,
  className,
}: NetWorthChartProps) {
  const gradientId = useId();
  const [timeRange, setTimeRange] = useState(DEFAULT_RANGE);

  const maxTime = useMemo(() => {
    if (data.length === 0) return 0;
    return data[data.length - 1].time;
  }, [data]);

  const filtered = useMemo(() => {
    if (!isFinite(timeRange)) return data;
    return data.filter((p) => p.time >= maxTime - timeRange);
  }, [data, maxTime, timeRange]);

  return (
    <HUDCard className={`rounded-lg border-border overflow-hidden ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1">
          {title}
        </span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        <Select value={String(timeRange)} onValueChange={(v) => setTimeRange(Number(v))}>
          <SelectTrigger className="w-[110px] h-7 text-xs rounded-[4px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_RANGES.map((r) => (
              <SelectItem key={String(r.seconds)} value={String(r.seconds)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Chart */}
      <div className="p-4">
        {filtered.length > 1 ? (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={filtered} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => {
                  const ago = maxTime - t;
                  if (ago < 60) return `${Math.round(ago)}s ago`;
                  if (ago < 3600) return `${Math.round(ago / 60)}m ago`;
                  if (ago < 86400) return `${(ago / 3600).toFixed(1)}h ago`;
                  return `${(ago / 86400).toFixed(1)}d ago`;
                }}
                stroke="var(--text-muted)"
                fontSize={11}
              />
              <YAxis tickFormatter={fmtShort} stroke="var(--text-muted)" fontSize={11} width={48} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                dataKey="v"
                type="monotone"
                stroke="var(--success)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={<EventDot />}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            Not enough data points yet.
          </div>
        )}
      </div>
    </HUDCard>
  );
}
