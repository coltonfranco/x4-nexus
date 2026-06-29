import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useHasSave } from "../../lib/useHasSave";
import { cn } from "../../lib/utils";
import { PageLoaderPreset } from "../../components/PageLoader";
import { Currency } from "../../components/Currency";
import { FactionBadge } from "../../components/FactionBadge";
import { getWareGroupColor, RACE_COLORS, methodLabel } from "../../lib/constants";
import type { FactionSummary } from "../../lib/map/types";
import { MapPin, Info, Recycle } from "lucide-react";
import { ModuleDetailPanel } from "../stations/modules";
import { WareDetailPanel } from "../../components/trade/WareDetailPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

// ── Types mirror /api/v1/economy/production-chain ──────────────────────────────
type ChainInput = { ware_id: string; amount: number };
type ChainRecipe = {
  method: string;
  time_sec: number;
  amount: number;
  workforce: number | null;
  inputs: ChainInput[];
};
type ProducerModule = { module_id: string; name: string | null; makerrace: string | null; production_method: string | null };
type ChainNode = {
  ware_id: string;
  name: string;
  group_id: string | null;
  category: string;
  group_tier: number | null;
  depth: number;
  price_min: number | null;
  price_avg: number | null;
  price_max: number | null;
  icon_url: string | null;
  market_avg: number | null;
  sell_qty: number | null;
  buy_qty: number | null;
  net_demand: number | null;
  empire_production: number | null;
  empire_consumption: number | null;
  recipes: Record<string, ChainRecipe>;
  producer_modules: ProducerModule[];
};
type ChainResponse = {
  nodes: ChainNode[];
  methods: string[];
  has_market: boolean;
  has_empire: boolean;
};

type Overlay = "market" | "empire" | "price";

// Raw group → accent hex for node markers/edges (mirrors getWareGroupColor families,
// but as flat colors usable in inline SVG rather than tailwind classes).
const GROUP_HEX: Record<string, string> = {
  energy: "#eab308",
  water: "#0ea5e9",
  ice: "#22d3ee",
  minerals: "#f59e0b",
  gases: "#d946ef",
  agricultural: "#84cc16",
  food: "#22c55e",
  pharmaceutical: "#10b981",
  refined: "#f97316",
  hightech: "#3b82f6",
  shiptech: "#6366f1",
};

const groupHex = (g: string | null) => (g && GROUP_HEX[g]) || "#8b93ad";

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const fmt = (n: number) => {
  const r = Math.round(n);
  const a = Math.abs(r);
  if (a >= 1e6) return (r / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e3) return (r / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return "" + r;
};

// Layout constants (px). Mirrors the mockup's column ladder.
const LAY = { HEAD: 56, ROWH: 36, NODEH: 30, COLW: 300, GAP: 94, PADX: 16, PADY: 12 };
const DEPTH_LABEL = ["Tier 1", "Tier 2", "Tier 3", "Tier 4", "Tier 5", "Tier 6"];
// Per-tier accent (column index = tier - 1). Matches getTierColor() on the catalog page.
const TIER_HEX = ["#cbd5e1", "#4ade80", "#60a5fa", "#c084fc", "#fb923c", "#facc15"];
const tierHex = (d: number) => TIER_HEX[d] ?? TIER_HEX[TIER_HEX.length - 1];

// A ware consumed by at least this many others is a "utility" (energy cells, water) —
// its edges are suppressed so they don't cut across the whole grid.
const UTILITY_THRESHOLD = 12;

// The signed "balance" each overlay surfaces (positive = surplus/green).
function overlayValue(n: ChainNode, overlay: Overlay): number | null {
  if (overlay === "price") return n.market_avg ?? n.price_avg;
  if (overlay === "empire") {
    if (n.empire_production == null && n.empire_consumption == null) return null;
    return (n.empire_production ?? 0) - (n.empire_consumption ?? 0);
  }
  if (n.sell_qty == null && n.buy_qty == null) return null;
  return (n.sell_qty ?? 0) - (n.buy_qty ?? 0); // supply − demand
}

function balanceColor(v: number, scale: number): string {
  if (v > scale) return "var(--success)";
  if (v < -scale) return "var(--danger)";
  return "var(--warning)";
}

export default function ProductionChainsPage() {
  const { hasSave } = useHasSave();
  const { data, isLoading } = useQuery<ChainResponse>({
    queryKey: ["production-chain"],
    queryFn: () => fetch("/api/v1/economy/production-chain").then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const [overlay, setOverlay] = useState<Overlay>("price");
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [nodeMethods, setNodeMethods] = useState<Record<string, string>>({});

  // Default the overlay to the richest available signal once data loads.
  const effectiveOverlay: Overlay =
    overlay === "market" && !data?.has_market
      ? "price"
      : overlay === "empire" && !data?.has_empire
      ? "price"
      : overlay;

  const layout = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const byId = new Map(nodes.map((n) => [n.ware_id, n]));

    // Column buckets by depth; sort within a column by group tier then name.
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    const cols: ChainNode[][] = Array.from({ length: maxDepth + 1 }, () => []);
    nodes.forEach((n) => cols[n.depth].push(n));
    cols.forEach((c) =>
      c.sort(
        (a, b) =>
          (a.group_tier ?? 99) - (b.group_tier ?? 99) || a.name.localeCompare(b.name)
      )
    );

    const colX = (d: number) => LAY.PADX + d * (LAY.COLW + LAY.GAP);
    const pos = new Map<string, { x: number; y: number; d: number }>();
    cols.forEach((c, d) =>
      c.forEach((n, i) =>
        pos.set(n.ware_id, { x: colX(d), y: LAY.PADY + LAY.HEAD + i * LAY.ROWH, d })
      )
    );

    const maxLen = cols.reduce((m, c) => Math.max(m, c.length), 0);
    const chartW = LAY.PADX * 2 + (maxDepth + 1) * LAY.COLW + maxDepth * LAY.GAP;
    const chartH = LAY.PADY * 2 + LAY.HEAD + maxLen * LAY.ROWH + 8;

    // "Utility" inputs (energy cells, water, …) feed almost everything; their long
    // cross-grid edges are pure noise. Flag them by how many wares consume them (using
    // the stable default recipe) and skip their edges/chain unless one is itself focused.
    const consumerCount = new Map<string, number>();
    nodes.forEach((n) => {
      const r = n.recipes["default"];
      r?.inputs.forEach((inp) =>
        consumerCount.set(inp.ware_id, (consumerCount.get(inp.ware_id) ?? 0) + 1)
      );
    });
    const utility = new Set(
      [...consumerCount].filter(([, c]) => c >= UTILITY_THRESHOLD).map(([w]) => w)
    );

    // Edges for the selected method (the graph defaults to "default").
    const recipeFor = (n: ChainNode) => {
      const explicit = nodeMethods[n.ware_id];
      if (explicit && n.recipes[explicit]) return n.recipes[explicit];
      if (n.recipes["default"]) return n.recipes["default"];
      const methods = Object.keys(n.recipes);
      return methods.length > 0 ? n.recipes[methods[0]] : null;
    };
    const edges: {
      d: string;
      stroke: string;
      width: number;
      a: string;
      b: string;
      util: boolean;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }[] = [];
    // Adjacency for chain traversal: inputsOf[b] = wares consumed to make b;
    // consumersOf[a] = wares that consume a. Kept complete (incl. utilities) so the
    // sidebar can list them; the graph traversal filters utilities out separately.
    const inputsOf = new Map<string, string[]>();
    const consumersOf = new Map<string, string[]>();
    const allConsumersOf = new Map<string, string[]>();
    
    nodes.forEach((n) => {
      // Track ALL potential consumers regardless of active recipe for the sidebar
      Object.values(n.recipes).forEach((r) => {
        r.inputs.forEach((inp) => {
          const arr = allConsumersOf.get(inp.ware_id) ?? allConsumersOf.set(inp.ware_id, []).get(inp.ware_id)!;
          if (!arr.includes(n.ware_id)) arr.push(n.ware_id);
        });
      });

      const r = recipeFor(n);
      if (!r) return;
      const pb = pos.get(n.ware_id)!;
      
      const utilInputs = r.inputs.filter((inp) => utility.has(inp.ware_id));
      const utilCount = utilInputs.length;
      let utilIndex = 0;

      r.inputs.forEach((inp) => {
        const pa = pos.get(inp.ware_id);
        if (!pa) return; // input is not a commodity node — no edge
        (inputsOf.get(n.ware_id) ?? inputsOf.set(n.ware_id, []).get(n.ware_id)!).push(inp.ware_id);
        (consumersOf.get(inp.ware_id) ?? consumersOf.set(inp.ware_id, []).get(inp.ware_id)!).push(n.ware_id);
        
        const isUtil = utility.has(inp.ware_id);
        let yOffset = 0;
        if (isUtil) {
          const regularCount = r.inputs.length - utilCount;
          if (regularCount > 0) {
            if (utilCount === 1) {
              yOffset = 6;
            } else if (utilCount === 2) {
              yOffset = utilIndex === 0 ? -6 : 6;
            } else {
              yOffset = -8 + utilIndex * 8;
            }
          } else {
            if (utilCount > 1) {
              const spacing = 8;
              const startY = -((utilCount - 1) * spacing) / 2;
              yOffset = startY + utilIndex * spacing;
            }
          }
          utilIndex++;
        }

        const x1 = pa.x + LAY.COLW;
        const y1 = pa.y + LAY.NODEH / 2;
        const x2 = pb.x;
        const y2 = pb.y + LAY.NODEH / 2 + yOffset;
        const mx = (x1 + x2) / 2;
        const width = 1.8;
        edges.push({
          d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
          stroke: groupHex(byId.get(inp.ware_id)?.group_id ?? null),
          width,
          a: inp.ware_id,
          b: n.ware_id,
          util: isUtil,
          x1,
          y1,
          x2,
          y2,
        });
      });
    });

    return { cols, pos, edges, chartW, chartH, inputsOf, consumersOf, allConsumersOf, utility, recipeFor, byId };
  }, [data, nodeMethods]);

  // The active highlight set + whether it's a locked selection.
  //  • locked selection → the node's full upstream (what makes it) + downstream
  //    (what it feeds) chain, everything else dimmed.
  //  • hover only (nothing locked) → a light preview of direct neighbours.
  const { highlight, locked } = useMemo(() => {
    const util = layout.utility;
    // Walk the chain but never step through a utility ware (it would drag in half the
    // grid). Utilities only join the highlight when they are themselves the focus.
    const collect = (start: string, adj: Map<string, string[]>) => {
      const seen = new Set<string>();
      const stack = [...(adj.get(start) ?? [])];
      while (stack.length) {
        const x = stack.pop()!;
        if (seen.has(x)) continue;
        seen.add(x);
        if (util.has(x)) continue;
        (adj.get(x) ?? []).forEach((n) => !seen.has(n) && stack.push(n));
      }
      return seen;
    };
    const neighbours = (id: string) =>
      [...(layout.inputsOf.get(id) ?? []), ...(layout.consumersOf.get(id) ?? [])];
    if (selected) {
      // Locked: the node's full upstream + downstream chain.
      const set = new Set<string>([
        selected,
        ...collect(selected, layout.inputsOf),
        ...collect(selected, layout.consumersOf),
      ]);
      return { highlight: set, locked: true };
    }
    if (hover) {
      // Preview: just direct producers/consumers.
      return { highlight: new Set<string>([hover, ...neighbours(hover)]), locked: false };
    }
    return { highlight: null as Set<string> | null, locked: false };
  }, [selected, hover, layout.inputsOf, layout.consumersOf, layout.utility]);

  const byId = layout.byId;

  if (isLoading) return <PageLoaderPreset preset="trade" />;
  if (!data) return null;

  const selectedNode = selected ? byId.get(selected) ?? null : null;

  // Scale for balance coloring — overlay-relative so colours stay meaningful.
  const scale = effectiveOverlay === "empire" ? 50 : effectiveOverlay === "market" ? 200 : 0;

  // Deficit banner: worst by the active overlay (price overlay has no deficit notion).
  const deficits =
    effectiveOverlay === "price"
      ? []
      : data.nodes
          .map((n) => ({ n, v: overlayValue(n, effectiveOverlay) }))
          .filter((x) => x.v != null && x.v < -scale)
          .sort((a, b) => (a.v ?? 0) - (b.v ?? 0))
          .slice(0, 6);

  const overlayChips: { k: Overlay; label: string; disabled: boolean; reason?: string }[] = [
    { k: "price", label: "Price", disabled: false },
    {
      k: "market",
      label: "Market Demand",
      disabled: !data.has_market,
      reason: "Load a save to see live galaxy supply/demand",
    },
    {
      k: "empire",
      label: "Empire Balance",
      disabled: !data.has_empire,
      reason: "Build production stations to see your empire's balance",
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Production Chains</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {data.nodes.length} wares · {data.methods.length} recipe methods · production
            complexity left → right
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          {effectiveOverlay !== "price" && (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground mr-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--success)" }} />Surplus
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--warning)" }} />Balanced
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--danger)" }} />Deficit
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Overlay
            </span>
            <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
              {overlayChips.map((c) => (
                <button
                  key={c.k}
                  disabled={c.disabled}
                  title={c.disabled ? c.reason : undefined}
                  onClick={() => setOverlay(c.k)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    c.disabled
                      ? "cursor-not-allowed text-muted-foreground/40"
                      : effectiveOverlay === c.k
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* deficit banner */}
      {deficits.length > 0 && (
        <div className="mx-6 mb-3 flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-destructive">
            ⚠ {effectiveOverlay === "empire" ? "Empire deficit" : "Under-supplied"}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {deficits.map(({ n, v }) => (
              <button
                key={n.ware_id}
                onClick={() => setSelected(n.ware_id)}
                className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-2.5 py-1 hover:bg-destructive/20"
              >
                <span className="text-xs text-foreground">{n.name}</span>
                <span className="font-mono text-[11px] font-semibold text-destructive">
                  {fmt(v ?? 0)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasSave && (
        <p className="px-6 pb-2 text-xs text-amber-300/60">
          Showing static recipes &amp; reference prices. Load a save to unlock Market Demand
          and Empire Balance overlays.
        </p>
      )}

      {/* chart + detail sidebar */}
      <div className="mx-6 mb-6 flex min-h-0 flex-1 gap-3">
        {/* clicking empty chart space clears the locked selection */}
        <div
          className="min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-[var(--surface-1)]"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative"
            style={{ width: layout.chartW, height: layout.chartH }}
            onMouseLeave={() => setHover(null)}
          >
            {/* column headers */}
            {layout.cols.map((c, d) => (
              <div
                key={d}
                className="absolute flex items-baseline gap-2 px-1 pb-2.5 pt-4"
                style={{
                  left: LAY.PADX + d * (LAY.COLW + LAY.GAP),
                  top: 0,
                  width: LAY.COLW,
                  borderBottom: `2px solid ${hexA(tierHex(d), 0.55)}`,
                }}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 self-center rounded-sm"
                  style={{ background: tierHex(d) }}
                />
                <span className="text-[17px] font-semibold" style={{ color: tierHex(d) }}>
                  {DEPTH_LABEL[d] ?? `Tier ${d}`}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{c.length}</span>
              </div>
            ))}

            {/* edges — hidden until a node is hovered or locked */}
            <svg
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              style={{ width: layout.chartW, height: layout.chartH }}
            >
              {highlight &&
                layout.edges.map((e, i) => {
                  if (!highlight.has(e.a) || !highlight.has(e.b)) return null;
                  // When locked, foreground the selected node's own connections and let the
                  // rest of the chain recede so the focus reads clearly.
                  const direct = !locked || e.a === selected || e.b === selected;
                  const sw = direct ? Math.max(e.width, 2.2) : e.width;
                  const op = direct ? 0.95 : 0.28;

                  if (e.util) {
                    return (
                      <g key={i} opacity={op}>
                        <path
                          d={`M ${e.x1} ${e.y1} h 12`}
                          fill="none"
                          stroke={e.stroke}
                          strokeWidth={sw}
                          strokeLinecap="round"
                        />
                        <circle cx={e.x1 + 12} cy={e.y1} r={sw * 1.2} fill={e.stroke} />
                        <path
                          d={`M ${e.x2} ${e.y2} h -12`}
                          fill="none"
                          stroke={e.stroke}
                          strokeWidth={sw}
                          strokeLinecap="round"
                        />
                        <circle cx={e.x2 - 12} cy={e.y2} r={sw * 1.2} fill={e.stroke} />
                      </g>
                    );
                  }

                  return (
                    <path
                      key={i}
                      d={e.d}
                      fill="none"
                      stroke={e.stroke}
                      strokeWidth={sw}
                      strokeLinecap="round"
                      opacity={op}
                    />
                  );
                })}
            </svg>

            {/* nodes */}
            {data.nodes.map((n) => {
              const p = layout.pos.get(n.ware_id)!;
              const v = overlayValue(n, effectiveOverlay);
              const isSel = locked && n.ware_id === selected;
              const dim = highlight ? !highlight.has(n.ware_id) : false;
              const active = highlight?.has(n.ware_id) ?? false;
              const gh = groupHex(n.group_id);
              const valColor =
                v == null
                  ? "var(--text-faint)"
                  : effectiveOverlay === "price"
                  ? "var(--gold)"
                  : balanceColor(v, scale);
              const valText =
                v == null
                  ? "—"
                  : effectiveOverlay === "price"
                  ? fmt(v)
                  : (v >= 0 ? "+" : "") + fmt(v);
              const alts = Object.keys(n.recipes).filter((m) => m !== "default");
              const displayAlts = alts.filter((m) => !m.toLowerCase().includes("recycling"));

              const isRecyclable = Object.keys(n.recipes).some(m => m.toLowerCase().includes("recycling"));
              const hasProducer = n.producer_modules.length > 0;
              const uniqueRaces = new Set(n.producer_modules.map((m) => m.makerrace));
              const exclusiveRaceName = hasProducer && uniqueRaces.size === 1 ? [...uniqueRaces][0] : null;
              const exclusiveRace = exclusiveRaceName ? RACE_COLORS[exclusiveRaceName] : null;
              const borderColor = isSel
                ? hexA(gh, 0.9)
                : active || hover === n.ware_id
                ? hexA(gh, 0.55)
                : "var(--border)";
              return (
                <div
                  key={n.ware_id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setSelected((cur) => (cur === n.ware_id ? null : n.ware_id));
                  }}
                  onMouseEnter={() => setHover(n.ware_id)}
                  className="absolute flex cursor-pointer items-center gap-2.5 rounded-md border px-3 transition-opacity"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: LAY.COLW,
                    height: LAY.NODEH,
                    background: isSel
                      ? hexA(gh, 0.2)
                      : active || hover === n.ware_id
                      ? hexA(gh, 0.12)
                      : "var(--surface-2)",
                    borderTopColor: borderColor,
                    borderRightColor: borderColor,
                    borderBottomColor: borderColor,
                    borderLeftColor: gh,
                    borderLeftWidth: "3px",
                    opacity: dim ? 0.28 : 1,
                    boxShadow: isSel ? `0 0 0 1px ${hexA(gh, 0.5)}` : undefined,
                  }}
                >
                  {n.icon_url ? (
                    <span
                      className="h-[18px] w-[18px] shrink-0"
                      style={{
                        backgroundColor: gh,
                        WebkitMask: `url(${n.icon_url}) center/contain no-repeat`,
                        mask: `url(${n.icon_url}) center/contain no-repeat`,
                      }}
                    />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: gh }} />
                  )}
                  <span className="truncate text-[13.5px] text-foreground">{n.name}</span>
                  <span className="flex-1" />
                  
                  <div className="flex shrink-0 items-center gap-1.5 mr-1">

                    {isRecyclable && (
                      <span title="Can be produced via recycling">
                        <Recycle className="shrink-0 w-3.5 h-3.5 text-muted-foreground" />
                      </span>
                    )}
                    {exclusiveRace && (
                      <span
                        className={cn("shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase", exclusiveRace.bg, exclusiveRace.color)}
                        title={`${methodLabel(exclusiveRaceName!)} Exclusive`}
                      >
                        {exclusiveRace.abbr}
                      </span>
                    )}
                    {displayAlts.length > 0 && (
                      <span
                        className="shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-semibold uppercase text-muted-foreground"
                        style={{ background: hexA(gh, 0.16) }}
                        title={`Alternate recipes: ${displayAlts.map(methodLabel).join(", ")}`}
                      >
                        {displayAlts.length} alt
                      </span>
                    )}
                  </div>
                  
                  <div className="min-w-[2.5rem] shrink-0 flex justify-end">
                    {effectiveOverlay === "price" && v != null ? (
                      <Currency value={v} className="text-[12px]" abbreviate />
                    ) : (
                      <span
                        className="shrink-0 font-mono text-[12px] font-semibold text-right"
                        style={{ color: valColor }}
                      >
                        {valText}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* detail sidebar — compact, purpose-built */}
        {selectedNode && (
          <ProductionDetailSidebar
            node={selectedNode}
            consumers={(layout.allConsumersOf.get(selectedNode.ware_id) ?? [])
              .map((id) => byId.get(id))
              .filter((x): x is ChainNode => !!x)}
            byId={byId}
            overlay={effectiveOverlay}
            scale={scale}
            hasMarket={data.has_market}
            hasEmpire={data?.has_empire ?? false}
            activeMethod={nodeMethods[selectedNode.ware_id] ?? "default"}
            onMethodChange={(m) => setNodeMethods((prev) => ({ ...prev, [selectedNode.ware_id]: m }))}
            onSelect={setSelected}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

type WareOfferRow = {
  station_id: string;
  station_name: string | null;
  station_code: string | null;
  owner_faction: string | null;
  sector_id: string | null;
  side: string;
  price: number;
  quantity: number;
};

type SectorRow = { sector_id: string; name: string | null };

const prettyId = (s: string) =>
  s.replace(/_macro$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function ConnectedWareDetailDialog({
  wareId,
  onClose,
}: {
  wareId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={wareId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl md:max-w-4xl min-h-[60vh] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Commodity Details</DialogTitle>
          <DialogDescription>Detailed view of the selected commodity</DialogDescription>
        </DialogHeader>
        {wareId && <WareDetailPanel wareId={wareId} />}
      </DialogContent>
    </Dialog>
  );
}

function ConnectedModuleDetailDialog({
  moduleId,
  moduleName,
  factions,
  onClose,
}: {
  moduleId: string | null;
  moduleName: string | null;
  factions: FactionSummary[];
  onClose: () => void;
}) {
  const { data: summary } = useQuery({
    queryKey: ["module", moduleId],
    queryFn: () => fetch(`/api/v1/modules/${moduleId}`).then(r => r.json()),
    enabled: !!moduleId,
    staleTime: Infinity,
  });

  const { data: playerLicences = [] } = useQuery<{ licence_type: string; faction_id: string }[]>({
    queryKey: ["player-licences"],
    queryFn: () => fetch("/api/v1/player/licences").then((r) => r.json()),
    staleTime: 60_000,
  });

  const licenceSet = useMemo(
    () => new Set(playerLicences.map((l) => `${l.faction_id}:${l.licence_type}`)),
    [playerLicences]
  );
  const anyLicenceSet = useMemo(
    () => new Set(playerLicences.map((l) => l.licence_type)),
    [playerLicences]
  );

  return (
    <Dialog open={moduleId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl md:max-w-3xl min-h-[50vh] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>{moduleName ?? "Module details"}</DialogTitle>
          <DialogDescription>Detailed stats for {moduleName}</DialogDescription>
        </DialogHeader>
        {moduleId && summary && (
          <ModuleDetailPanel
            moduleId={moduleId}
            summary={summary}
            factions={factions}
            licenceSet={licenceSet}
            anyLicenceSet={anyLicenceSet}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <div className="mb-2 mt-5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground first:mt-0">
    {children}
  </div>
);

function ProductionDetailSidebar({
  node,
  consumers,
  byId,
  overlay,
  scale,
  hasMarket,
  hasEmpire,
  activeMethod,
  onMethodChange,
  onSelect,
  onClose,
}: {
  node: ChainNode;
  consumers: ChainNode[];
  byId: Map<string, ChainNode>;
  overlay: Overlay;
  scale: number;
  hasMarket: boolean;
  hasEmpire: boolean;
  activeMethod: string;
  onMethodChange: (m: string) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ownMethods = Object.keys(node.recipes).sort((a, b) =>
    a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b)
  );
  
  const getModuleMethod = (mod: typeof node.producer_modules[0]) => {
    const isRecycler = 
      mod.name?.toLowerCase().includes("recycl") || 
      mod.name?.toLowerCase().includes("scrap") || 
      mod.module_id.toLowerCase().includes("recycl") || 
      mod.module_id.toLowerCase().includes("scrap");
      
    if (isRecycler && node.recipes["terranrecycling"]) return "terranrecycling";
    if (isRecycler && node.recipes["recycling"]) return "recycling";
    if (isRecycler && node.recipes["processing"]) return "processing";
    
    const modMethod = mod.production_method || "default";
    if (node.recipes[modMethod]) return modMethod;
    if (modMethod.includes("recycling") && node.recipes["recycling"]) return "recycling";
    
    if (!node.recipes["default"] && ownMethods.length > 0) return ownMethods[0];
    return "default";
  };

  const methodToUse = node.recipes[activeMethod]
    ? activeMethod
    : node.recipes["default"]
    ? "default"
    : ownMethods[0] ?? "default";
  
  const recipe = node.recipes[methodToUse] ?? null;
  const [selectedModule, setSelectedModule] = useState<{ id: string; name: string } | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const { data: offers = [] } = useQuery<WareOfferRow[]>({
    queryKey: ["economy", "wares", node.ware_id, "stations"],
    queryFn: () =>
      fetch(`/api/v1/economy/wares/${encodeURIComponent(node.ware_id)}/stations`)
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    enabled: hasMarket,
    staleTime: 60_000,
  });
  // Faction + sector lookups resolve the offer rows' ids to display names.
  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
    staleTime: Infinity,
  });
  const { data: sectors = [] } = useQuery<SectorRow[]>({
    queryKey: ["map-sectors"],
    queryFn: () =>
      fetch("/api/v1/map/sectors?limit=2000")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 10 * 60_000,
    enabled: hasMarket,
  });
  const factionMap = useMemo(
    () => new Map(factions.map((f) => [f.faction_id, f])),
    [factions]
  );
  const sectorName = useMemo(() => {
    const m = new Map<string, string>();
    sectors.forEach((s) => s.name && m.set(s.sector_id.toLowerCase(), s.name));
    return (id: string | null) => (id ? m.get(id.toLowerCase()) ?? prettyId(id) : null);
  }, [sectors]);

  const gh = groupHex(node.group_id);
  const price = node.market_avg ?? node.price_avg;
  const v = overlayValue(node, overlay);
  const netLabel =
    overlay === "empire" ? "Empire Net /h" : overlay === "market" ? "Market Net" : "Net Demand";
  const netVal = overlay === "price" ? node.net_demand : v;
  const netColor =
    netVal == null
      ? "var(--text-faint)"
      : balanceColor(netVal, overlay === "price" ? 0 : scale);
  const sellers = offers
    .filter((o) => o.side === "sell")
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);

  const Ware = ({ id, qty, bold }: { id: string; qty?: number; bold?: boolean }) => {
    const w = byId.get(id);
    return (
      <button
        onClick={() => w && onSelect(id)}
        disabled={!w}
        className={cn(
          "flex w-full items-center gap-2 py-1.5 text-left",
          w && "hover:text-primary"
        )}
      >
        {w?.icon_url ? (
          <span
            className="h-3 w-3 shrink-0"
            style={{
              backgroundColor: groupHex(w.group_id),
              WebkitMask: `url(${w.icon_url}) center/contain no-repeat`,
              mask: `url(${w.icon_url}) center/contain no-repeat`,
            }}
          />
        ) : (
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={{ background: groupHex(w?.group_id ?? null) }}
          />
        )}
        <span className={cn("flex-1 truncate text-[13px]", bold && "font-semibold")}>
          {w?.name ?? id}
        </span>
        {qty != null && (
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">×{qty}</span>
        )}
      </button>
    );
  };

  return (
    <aside className="relative flex w-[388px] flex-none flex-col overflow-y-auto rounded-xl border border-border bg-[var(--surface-2)]">
      {/* header */}
      <div className="sticky top-0 z-10 border-b border-border bg-[var(--surface-2)] p-4">
        <div className="flex items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: gh }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold leading-tight">{node.name}</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide"
                style={{ background: hexA(tierHex(node.depth), 0.14), color: tierHex(node.depth) }}
              >
                {DEPTH_LABEL[node.depth] ?? `Tier ${node.depth}`}
              </span>
              {node.group_id && (
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border capitalize ${getWareGroupColor(node.group_id)}`}>
                  {node.group_id.replace("_", " ")}
                </span>
              )}
              {(() => {
                const hasProducer = node.producer_modules.length > 0;
                const uniqueRaces = new Set(node.producer_modules.map((m) => m.makerrace));
                const exclusiveRaceName = hasProducer && uniqueRaces.size === 1 ? [...uniqueRaces][0] : null;
                const exclusiveRace = exclusiveRaceName ? RACE_COLORS[exclusiveRaceName] : null;
                return exclusiveRace ? (
                  <span
                    className={cn("inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase", exclusiveRace.bg, exclusiveRace.color)}
                  >
                    {methodLabel(exclusiveRaceName!)} Exclusive
                  </span>
                ) : null;
              })()}
            </div>
          </div>
          <button
            onClick={() => setDetailModalOpen(true)}
            aria-label="Open detailed view"
            title="Open detailed view"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          >
            <Info className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close details"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border bg-[var(--surface-1)] px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              Avg Price
            </div>
            <div className="mt-0.5 flex items-center">
              {price != null ? <Currency value={price} className="text-base" /> : <span className="font-mono text-base font-semibold" style={{ color: "var(--gold)" }}>—</span>}
            </div>
          </div>
          <div className="rounded-md border border-border bg-[var(--surface-1)] px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {netLabel}
            </div>
            <div className="font-mono text-base font-semibold" style={{ color: netColor }}>
              {netVal == null ? "—" : (netVal >= 0 ? "+" : "") + fmt(netVal)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* supply vs demand */}
        {(hasEmpire || hasMarket) && (
          <>
            <SectionTitle>Supply vs Demand</SectionTitle>
            <div className="space-y-2">
              {hasEmpire &&
                (node.empire_production != null || node.empire_consumption != null) && (
                  <div className="rounded-lg border border-border bg-[var(--surface-1)] px-3 py-2 text-[12px]">
                    <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                      Your empire
                    </div>
                    <Row label="Production" value={`${fmt(node.empire_production ?? 0)}/h`} color="var(--success)" />
                    <Row label="Consumption" value={`${fmt(node.empire_consumption ?? 0)}/h`} color="var(--danger)" />
                  </div>
                )}
              {hasMarket && (node.sell_qty != null || node.buy_qty != null) && (
                <div className="rounded-lg border border-border bg-[var(--surface-1)] px-3 py-2 text-[12px]">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                    Galaxy market
                  </div>
                  <Row label="Supply (for sale)" value={fmt(node.sell_qty ?? 0)} color="var(--success)" />
                  <Row label="Demand (wanted)" value={fmt(node.buy_qty ?? 0)} color="var(--danger)" />
                </div>
              )}
            </div>
          </>
        )}

        {/* recipe */}
        <SectionTitle>Recipe</SectionTitle>
        {ownMethods.length > 1 ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {ownMethods.map((m) => {
              const modulesForMethod = node.producer_modules.filter(mod => getModuleMethod(mod) === m);
              
              const methodUniqueRaces = new Set(modulesForMethod.map((mod) => mod.makerrace));
              const methodExclusiveRace = modulesForMethod.length > 0 && methodUniqueRaces.size === 1 && modulesForMethod[0].makerrace ? [...methodUniqueRaces][0] : null;
              const labelStr = m === "default" ? (methodExclusiveRace || "Generic") : m;

              return (
                <button
                  key={m}
                  onClick={() => onMethodChange(m)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    m === methodToUse
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {methodLabel(labelStr)}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mb-2 text-[11px] text-muted-foreground">
            {node.producer_modules.length > 0 && new Set(node.producer_modules.map((m) => m.makerrace)).size === 1 && node.producer_modules[0].makerrace
              ? `${methodLabel(node.producer_modules[0].makerrace)} Exclusive Blueprint`
              : "Universal Blueprint"}
          </div>
        )}
        {recipe ? (
          <div className="rounded-lg border border-border bg-[var(--surface-1)] px-3 py-2">
            {recipe.inputs.map((inp) => (
              <Ware key={inp.ware_id} id={inp.ware_id} qty={inp.amount} />
            ))}
            <div className="mt-1 flex items-center gap-2 border-t border-border/50 pt-2">
              <span className="text-muted-foreground">↳</span>
              {node.icon_url ? (
                <span
                  className="h-3 w-3 shrink-0"
                  style={{
                    backgroundColor: gh,
                    WebkitMask: `url(${node.icon_url}) center/contain no-repeat`,
                    mask: `url(${node.icon_url}) center/contain no-repeat`,
                  }}
                />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: gh }} />
              )}
              <span className="flex-1 truncate text-[13px] font-semibold">{node.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">×{recipe.amount}</span>
            </div>
            <div className="mt-2 font-mono text-[10px] text-muted-foreground">
              Cycle {Math.round(recipe.time_sec)}s
              {recipe.workforce ? ` · ${recipe.workforce} workforce` : ""}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
            Raw resource — mined or collected directly, no production recipe.
          </div>
        )}

        {/* production modules */}
        {node.producer_modules.length > 0 && (() => {
          const filteredModules = node.producer_modules.filter(m => getModuleMethod(m) === methodToUse);
          
          if (filteredModules.length === 0) return null;
          
          return (
          <>
            <SectionTitle>Produced In · Station Modules</SectionTitle>
            <div className="space-y-1.5">
              {filteredModules.map((m) => {
                const f = m.makerrace ? factionMap.get(m.makerrace) : undefined;
                return (
                  <button
                    key={m.module_id}
                    onClick={() => setSelectedModule({ id: m.module_id, name: m.name ?? prettyId(m.module_id) })}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-[var(--surface-1)] px-3 py-1.5 hover:border-primary transition-colors text-left"
                  >
                    {f && f.icon_url ? (
                      <span
                        className="h-3 w-3 shrink-0"
                        style={{
                          backgroundColor: f.color_hex ?? gh,
                          WebkitMask: `url(${f.icon_url}) center/contain no-repeat`,
                          mask: `url(${f.icon_url}) center/contain no-repeat`,
                        }}
                      />
                    ) : (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: f?.color_hex ?? gh }} />
                    )}
                    <span className="flex-1 truncate text-[12px]">{m.name ?? prettyId(m.module_id)}</span>
                    <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                      {f ? f.name : (m.makerrace ?? "Generic")}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
          );
        })()}

        {/* feeds into */}
        {consumers.length > 0 && (
          <>
            <SectionTitle>Feeds Into</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {consumers.map((c) => (
                <button
                  key={c.ware_id}
                  onClick={() => onSelect(c.ware_id)}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-[var(--surface-1)] px-2 py-1 text-[12px] hover:text-primary"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-sm"
                    style={{ background: groupHex(c.group_id) }}
                  />
                  {c.name}
                </button>
              ))}
            </div>
          </>
        )}

        {/* available from (sellers) */}
        {sellers.length > 0 && (
          <>
            <SectionTitle>Available From</SectionTitle>
            <div className="space-y-1.5">
              {sellers.map((o) => {
                const f = o.owner_faction ? factionMap.get(o.owner_faction) : undefined;
                const sec = sectorName(o.sector_id);
                return (
                  <div
                    key={o.station_id}
                    className="flex items-center gap-2 rounded-md border border-border bg-[var(--surface-1)] px-3 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[13px] font-medium text-foreground">
                        <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{sec ?? "Unknown Sector"}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        {f && (
                          <FactionBadge
                            size="sm"
                            name={f.name}
                            color_hex={f.color_hex}
                            icon_url={f.icon_url}
                            faction_id={f.faction_id}
                          />
                        )}
                        <span className="truncate text-[10.5px] text-muted-foreground">
                          {o.station_name ?? o.station_code ?? o.station_id}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px]">
                      <div style={{ color: "var(--success)" }}>{fmt(o.quantity)}</div>
                      <div>
                        <Currency value={o.price} className="text-[11px]" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <ConnectedWareDetailDialog
        wareId={detailModalOpen ? node.ware_id : null}
        onClose={() => setDetailModalOpen(false)}
      />

      <ConnectedModuleDetailDialog
        moduleId={selectedModule?.id ?? null}
        moduleName={selectedModule?.name ?? null}
        factions={factions}
        onClose={() => setSelectedModule(null)}
      />
    </aside>
  );
}

const Row = ({ label, value, color }: { label: string; value: string; color: string }) => (
  <div className="flex items-center justify-between py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-mono font-medium" style={{ color }}>
      {value}
    </span>
  </div>
);
