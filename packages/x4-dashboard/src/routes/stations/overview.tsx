import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, Table2, Search, Hammer, Users, Factory, Boxes } from "lucide-react";
import { cn } from "../../lib/utils";
import { prettyId } from "../../lib/wareFormat";
import { formatCompactNumber } from "../../lib/formatters";
import { PageLoaderPreset } from "../../components/PageLoader";
import { apiGet } from "../../lib/api";
import { useLookupMap } from "../../lib/useLookupMap";

// ── Types (mirror /api/v1/stations rollup + sub-endpoints) ──────────────────────
type Station = {
  station_id: string;
  code: string | null;
  name: string | null;
  macro: string | null;
  owner_faction: string | null;
  sector_id: string | null;
  category: string | null;
  is_player_owned: boolean;
  is_under_construction: boolean;
  build_pct: number | null;
  module_count: number | null;
  planned_module_count: number | null;
  account_amount: number | null;
  workforce_current: number | null;
  workforce_capacity: number | null;
  workforce_bonus: number | null;
  production_product: string | null;
};
type Offer = { ware_id: string; side: "buy" | "sell"; price: number; quantity: number };
type PlannedModule = { module_id: string; macro: string | null; name: string | null; kind: string | null; count: number };
type BuildMaterial = { ware_id: string; name: string | null; amount: number; price_avg: number | null; total: number | null };
type Construction = {
  station_id: string;
  is_under_construction: boolean;
  build_pct: number | null;
  module_count: number | null;
  planned_module_count: number | null;
  planned_modules: PlannedModule[];
  bill_of_materials: BuildMaterial[];
};
type Sector = { sector_id: string; name: string | null };
type Ware = { ware_id: string; name: string | null };

// ── Labels / formatting ─────────────────────────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  factory: "Factory",
  headquarters: "Headquarters",
  shipyard: "Shipyard",
  wharf: "Wharf",
  equipmentdock: "Equipment Dock",
  tradestation: "Trade Station",
  defence: "Defence Station",
  piratebase: "Pirate Base",
};
const categoryLabel = (c: string | null) => (c ? (CATEGORY_LABEL[c] ?? c) : "Station");

const STATUS = {
  building: { color: "#5cc8ec", label: "BUILDING" },
  operational: { color: "#34d399", label: "OPERATIONAL" },
} as const;
const statusOf = (s: Station) => (s.is_under_construction ? STATUS.building : STATUS.operational);

function fmtNum(n: number): string {
  return formatCompactNumber(n, { trim: true, base: (v) => String(Math.round(v)) });
}
const fmtCr = (n: number) => `${fmtNum(n)} Cr`;
const pct = (cur: number | null, cap: number | null) =>
  cur != null && cap != null && cap > 0 ? Math.round((cur / cap) * 100) : null;

function isRealName(name: string | null): name is string {
  return !!name && !name.startsWith("{");
}
function stationDisplayName(s: Station): string {
  if (isRealName(s.name)) return s.name;
  if (s.code) return s.code;
  return categoryLabel(s.category);
}

// ── Page ────────────────────────────────────────────────────────────────────────
export default function MyStationsPage() {
  const [view, setView] = useState<"cards" | "console">("cards");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [buildingOnly, setBuildingOnly] = useState(false);

  const { data: stations, isLoading } = useQuery<Station[]>({
    queryKey: ["stations-overview"],
    queryFn: () => apiGet<Station[]>("/api/v1/stations?player_only=true&limit=2000"),
    staleTime: 15_000,
  });
  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => apiGet<Sector[]>("/api/v1/map/sectors?limit=2000"),
    staleTime: 600_000,
  });
  const { data: wares = [] } = useQuery<Ware[]>({
    queryKey: ["wares-min"],
    queryFn: () => apiGet<Ware[]>("/api/v1/wares?limit=2000"),
    staleTime: 600_000,
  });

  const sectorName = useLookupMap(
    sectors,
    (s) => s.sector_id,
    (s) => s.name,
    { normalizeId: (id) => id.toLowerCase(), onMissing: prettyId, onEmpty: "Unknown" }
  );
  const wareName = useLookupMap(
    wares,
    (w) => w.ware_id,
    (w) => w.name,
    { onMissing: prettyId }
  );

  const all = stations ?? [];
  const types = useMemo(() => {
    const set = new Set<string>();
    for (const s of all) if (s.category) set.add(s.category);
    return [...set].sort();
  }, [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (buildingOnly && !s.is_under_construction) return false;
      if (typeFilter !== "all" && s.category !== typeFilter) return false;
      if (q && !stationDisplayName(s).toLowerCase().includes(q) && !sectorName(s.sector_id).toLowerCase().includes(q))
        return false;
      return true;
    });
    // sort: building first, then by module count desc
  }, [all, search, typeFilter, buildingOnly, sectorName]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.is_under_construction !== b.is_under_construction) return a.is_under_construction ? -1 : 1;
        return (b.module_count ?? 0) - (a.module_count ?? 0);
      }),
    [filtered],
  );

  // KPIs
  const kpi = useMemo(() => {
    const building = all.filter((s) => s.is_under_construction).length;
    const modules = all.reduce((n, s) => n + (s.module_count ?? 0), 0);
    const workforce = all.reduce((n, s) => n + (s.workforce_current ?? 0), 0);
    return { count: all.length, building, modules, workforce };
  }, [all]);

  if (isLoading) return <PageLoaderPreset preset="empire" />;

  if (all.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-dashed border-white/12 p-10 text-center">
          <Factory className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <div className="text-[15px] text-foreground">No player-owned stations</div>
          <div className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Once you own or are building a station, it appears here with its modules, workforce,
            production and build status. Load a save with a player station to populate this view.
          </div>
        </div>
      </div>
    );
  }

  const selected = sorted.find((s) => s.station_id === selectedId) ?? sorted[0] ?? null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + KPIs */}
      <div className="flex-none px-6 pt-5">
        <div className="mb-3.5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[25px] font-semibold tracking-[0.3px]">Station Overview</h1>
            <div className="mt-1 font-mono text-[11px] tracking-[1.5px] text-muted-foreground">
              {kpi.count} STATION{kpi.count === 1 ? "" : "S"} · {kpi.building} BUILDING
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-[10px] border border-white/8 bg-[#0c1322] p-1">
            <ViewToggle active={view === "cards"} onClick={() => setView("cards")} icon={LayoutGrid} label="Fleet Cards" />
            <ViewToggle active={view === "console"} onClick={() => setView("console")} icon={Table2} label="Ops Console" />
          </div>
        </div>

        <div className="mb-3.5 grid grid-cols-4 gap-3">
          <Kpi label="STATIONS" value={`${kpi.count}`} color="#3b9ae1" icon={Boxes} />
          <Kpi label="UNDER CONSTRUCTION" value={`${kpi.building}`} color="#5cc8ec" icon={Hammer} />
          <Kpi label="MODULES" value={`${kpi.modules}`} color="#34d399" icon={Factory} />
          <Kpi label="WORKFORCE" value={fmtNum(kpi.workforce)} color="#f0d98a" icon={Users} />
        </div>

        {/* Filters */}
        <div className="mb-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/8 bg-[#0c1322] px-3 py-1.5 text-[12.5px] text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter stations…"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-white/8 bg-[#0c1322] px-2.5 py-1.5 text-[12.5px] text-foreground outline-none"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {categoryLabel(t)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setBuildingOnly((v) => !v)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
              buildingOnly
                ? "border-[#5cc8ec]/40 bg-[#5cc8ec]/10 text-[#8fdcf3]"
                : "border-white/8 bg-[#0c1322] text-muted-foreground hover:text-foreground",
            )}
          >
            Building only
          </button>
        </div>
      </div>

      {/* Body */}
      {view === "cards" ? (
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(386px,1fr))] gap-3.5">
            {sorted.map((s) => (
              <StationCard
                key={s.station_id}
                s={s}
                sectorName={sectorName}
                wareName={wareName}
                expanded={!!expanded[s.station_id]}
                onToggle={() => setExpanded((p) => ({ ...p, [s.station_id]: !p[s.station_id] }))}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3.5 px-6 pb-6">
          <div className="flex w-[340px] flex-none flex-col overflow-hidden rounded-xl border border-white/8 bg-[#090e1a]/50">
            <div className="grid flex-none grid-cols-[1fr_64px] gap-2 border-b border-white/8 bg-[#0c1322] px-3.5 py-2.5 font-mono text-[9.5px] tracking-[1.4px] text-[#46506a]">
              <span>STATION</span>
              <span className="text-right">MODULES</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {sorted.map((s) => {
                const st = statusOf(s);
                const sel = selected?.station_id === s.station_id;
                return (
                  <button
                    key={s.station_id}
                    onClick={() => setSelectedId(s.station_id)}
                    className="grid w-full grid-cols-[1fr_64px] items-center gap-2 border-b border-white/[0.04] px-3.5 py-3 text-left transition-colors"
                    style={{
                      background: sel ? "rgba(59,154,225,0.1)" : "transparent",
                      borderLeft: `3px solid ${sel ? st.color : "transparent"}`,
                    }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 flex-none rounded-full" style={{ background: st.color }} />
                        <span className="truncate text-[13px] font-medium text-foreground">{stationDisplayName(s)}</span>
                      </div>
                      <div className="mt-1 pl-4 text-[10.5px] text-muted-foreground">
                        {categoryLabel(s.category)} · {sectorName(s.sector_id)}
                      </div>
                    </div>
                    <span className="text-right font-mono text-[11.5px] text-[#aab4c6]">
                      {s.is_under_construction ? `${s.module_count ?? 0}/${s.planned_module_count ?? "?"}` : (s.module_count ?? 0)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/8 bg-[#090e1a]/50">
            {selected && <StationDetail s={selected} sectorName={sectorName} wareName={wareName} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────────
function ViewToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof LayoutGrid; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12.5px] font-medium transition-colors"
      style={{ background: active ? "#1d4f8a" : "transparent", color: active ? "#fff" : "#7a8499" }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Kpi({ label, value, color, icon: Icon }: { label: string; value: string; color: string; icon: typeof Boxes }) {
  return (
    <div className="relative overflow-hidden rounded-[11px] border border-white/8 bg-white/[0.02] px-4 py-3">
      <div className="absolute bottom-0 left-0 top-0 w-[3px]" style={{ background: color }} />
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[1px] text-muted-foreground">{label}</div>
        <Icon className="h-3.5 w-3.5" style={{ color }} />
      </div>
      <div className="mt-1.5 font-mono text-[22px] font-semibold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: Station }) {
  const st = statusOf(s);
  return (
    <span
      className="inline-flex flex-none items-center gap-1.5 rounded-[7px] px-2.5 py-1 text-[10.5px] font-semibold tracking-[0.4px]"
      style={{ background: `${st.color}1f`, color: st.color }}
    >
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: st.color }} />
      {st.label}
    </span>
  );
}

/** A 2-up stat tile used in the card KPI grid. */
function MiniStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0b1120] px-3 py-2.5">
      <div className="font-mono text-[9.5px] tracking-[0.5px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[14px] font-semibold text-[#cdd5e3]">{children}</div>
    </div>
  );
}

function WorkforceValue({ s }: { s: Station }) {
  if (s.workforce_current == null) return <span className="text-muted-foreground">—</span>;
  const p = pct(s.workforce_current, s.workforce_capacity);
  return (
    <span>
      {fmtNum(s.workforce_current)}
      {p != null && <span className="text-muted-foreground">{` · ${p}%`}</span>}
    </span>
  );
}

function StationCard({
  s,
  sectorName,
  wareName,
  expanded,
  onToggle,
}: {
  s: Station;
  sectorName: (id: string | null) => string;
  wareName: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const st = statusOf(s);
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/8 bg-[#0b1120]/70" style={{ borderTop: `2px solid ${st.color}` }}>
      <div className="px-4 pb-3 pt-3.5">
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="truncate text-[15.5px] font-semibold">{stationDisplayName(s)}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {categoryLabel(s.category)} · {sectorName(s.sector_id)}
            </div>
          </div>
          <StatusBadge s={s} />
        </div>
      </div>

      {s.is_under_construction && <BuildBlock s={s} wareName={wareName} />}

      <div className="mx-4 grid grid-cols-2 gap-px overflow-hidden rounded-[9px] bg-white/5">
        <MiniStat label="MODULES">
          {s.is_under_construction ? `${s.module_count ?? 0} / ${s.planned_module_count ?? "?"}` : (s.module_count ?? 0)}
        </MiniStat>
        <MiniStat label="WORKFORCE">
          <WorkforceValue s={s} />
        </MiniStat>
        <MiniStat label="PRODUCTION">
          {s.production_product ? (
            <span className="text-[12px]">{wareName(s.production_product)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </MiniStat>
        <MiniStat label="BUDGET">
          {s.account_amount != null ? <span style={{ color: "#f0d98a" }}>{fmtCr(s.account_amount)}</span> : <span className="text-muted-foreground">—</span>}
        </MiniStat>
      </div>

      <button onClick={onToggle} className="mt-3 flex items-center justify-between border-t border-white/[0.05] px-4 py-2.5 text-left">
        <span className="text-[11.5px] text-muted-foreground">
          {expanded ? "Hide trade" : "Producing & trading"}
        </span>
        <span className="text-[11px] text-[#5cc8ec]">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <OffersBlock stationId={s.station_id} wareName={wareName} />}
    </div>
  );
}

function BuildBlock({ s, wareName }: { s: Station; wareName: (id: string) => string }) {
  const { data } = useQuery<Construction>({
    queryKey: ["station-construction", s.station_id],
    queryFn: () => apiGet<Construction>(`/api/v1/stations/${encodeURIComponent(s.station_id)}/construction`),
    staleTime: 30_000,
  });
  const buildPct = s.build_pct ?? 0;
  return (
    <div className="mx-4 mb-3 rounded-[10px] border border-[#5cc8ec]/20 bg-[#5cc8ec]/[0.06] p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#8fdcf3]">
          <Hammer className="h-3.5 w-3.5" /> Under construction
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {s.module_count ?? 0} / {s.planned_module_count ?? "?"} modules
        </span>
      </div>
      <div className="mb-2 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-[5px] bg-white/[0.07]">
          <div className="h-full rounded-[5px]" style={{ width: `${buildPct}%`, background: "linear-gradient(90deg,#3b9ae1,#5cc8ec)" }} />
        </div>
        <span className="font-mono text-[11.5px] font-semibold text-[#8fdcf3]">{Math.round(buildPct)}%</span>
      </div>
      {data && data.bill_of_materials.length > 0 && (
        <>
          <div className="mb-1.5 font-mono text-[9.5px] tracking-[1px] text-muted-foreground">BILL OF MATERIALS</div>
          <div className="flex flex-col gap-1">
            {data.bill_of_materials.slice(0, 4).map((b) => (
              <div key={b.ware_id} className="flex items-center justify-between text-[11.5px]">
                <span className="text-[#dfe6f0]">{b.name ?? wareName(b.ware_id)}</span>
                <span className="font-mono text-muted-foreground">
                  {fmtNum(b.amount)}
                  {b.total != null && <span className="ml-2 text-[#a9966a]">{fmtCr(b.total)}</span>}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OffersBlock({ stationId, wareName }: { stationId: string; wareName: (id: string) => string }) {
  const { data: offers, isLoading } = useQuery<Offer[]>({
    queryKey: ["station-offers", stationId],
    queryFn: () => apiGet<Offer[]>(`/api/v1/stations/${encodeURIComponent(stationId)}/offers`),
    staleTime: 15_000,
  });
  if (isLoading) return <div className="px-4 pb-4 text-[11.5px] text-muted-foreground">Loading…</div>;
  const sells = (offers ?? []).filter((o) => o.side === "sell");
  const buys = (offers ?? []).filter((o) => o.side === "buy");
  if (sells.length === 0 && buys.length === 0)
    return <div className="px-4 pb-4 text-[11.5px] text-muted-foreground">No trade offers.</div>;
  return (
    <div className="px-4 pb-4">
      {sells.length > 0 && <OfferList title="SELLING" color="#34d399" offers={sells} wareName={wareName} />}
      {buys.length > 0 && <OfferList title="BUYING" color="#5cc8ec" offers={buys} wareName={wareName} />}
    </div>
  );
}

function OfferList({ title, color, offers, wareName }: { title: string; color: string; offers: Offer[]; wareName: (id: string) => string }) {
  return (
    <div className="mt-1">
      <div className="mb-1.5 font-mono text-[9.5px] tracking-[1px]" style={{ color }}>
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {offers.slice(0, 6).map((o) => (
          <div key={`${o.side}-${o.ware_id}`} className="flex items-center justify-between text-[12px]">
            <span className="truncate text-[#cdd5e3]">{wareName(o.ware_id)}</span>
            <span className="flex flex-none items-center gap-3 font-mono text-[10.5px]">
              <span className="text-muted-foreground">{fmtNum(o.quantity)}</span>
              <span style={{ color: "#f0d98a" }}>{fmtCr(o.price)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StationDetail({
  s,
  sectorName,
  wareName,
}: {
  s: Station;
  sectorName: (id: string | null) => string;
  wareName: (id: string) => string;
}) {
  const st = statusOf(s);
  return (
    <div>
      <div className="border-b border-white/8 px-6 py-4" style={{ borderTop: `2px solid ${st.color}`, background: "linear-gradient(180deg,#0d1424,#0b1120)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[21px] font-semibold">{stationDisplayName(s)}</div>
            <div className="mt-1.5 text-[12px] text-muted-foreground">
              {categoryLabel(s.category)} · {sectorName(s.sector_id)}
            </div>
          </div>
          <StatusBadge s={s} />
        </div>
      </div>

      <div className="px-6 py-5">
        <div className="mb-5 grid grid-cols-4 gap-2.5">
          <DetailStat label="MODULES">
            {s.is_under_construction ? `${s.module_count ?? 0} / ${s.planned_module_count ?? "?"}` : (s.module_count ?? 0)}
          </DetailStat>
          <DetailStat label="WORKFORCE">
            <WorkforceValue s={s} />
          </DetailStat>
          <DetailStat label="PRODUCTIVITY">
            {s.workforce_bonus != null ? `${Math.round(s.workforce_bonus * 100)}%` : "—"}
          </DetailStat>
          <DetailStat label="BUDGET">
            {s.account_amount != null ? <span style={{ color: "#f0d98a" }}>{fmtCr(s.account_amount)}</span> : "—"}
          </DetailStat>
        </div>

        {s.is_under_construction && <ConstructionDetail stationId={s.station_id} wareName={wareName} />}

        <ModulesList stationId={s.station_id} />
        <div className="mt-5">
          <SectionLabel>TRADE</SectionLabel>
          <OffersBlock stationId={s.station_id} wareName={wareName} />
        </div>
      </div>
    </div>
  );
}

function DetailStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-white/8 bg-white/[0.02] px-3 py-3">
      <div className="font-mono text-[9.5px] tracking-[0.5px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-[16px] font-semibold text-[#cdd5e3]">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2.5 font-mono text-[11px] tracking-[1.5px] text-muted-foreground">▸ {children}</div>;
}

function ConstructionDetail({ stationId, wareName }: { stationId: string; wareName: (id: string) => string }) {
  const { data } = useQuery<Construction>({
    queryKey: ["station-construction", stationId],
    queryFn: () => apiGet<Construction>(`/api/v1/stations/${encodeURIComponent(stationId)}/construction`),
    staleTime: 30_000,
  });
  if (!data) return null;
  return (
    <div className="mb-5">
      <SectionLabel>CONSTRUCTION</SectionLabel>
      <div className="grid grid-cols-[1.2fr_1fr] gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[9.5px] tracking-[1px] text-muted-foreground">PLANNED MODULES</div>
          <div className="flex flex-col gap-1">
            {data.planned_modules.map((m) => (
              <div key={m.module_id} className="flex items-center justify-between rounded-md bg-white/[0.02] px-2.5 py-1.5 text-[12px]">
                <span className="truncate text-[#cdd5e3]">{m.name ?? m.macro}</span>
                <span className="font-mono text-[11px] text-muted-foreground">×{m.count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[9.5px] tracking-[1px] text-muted-foreground">BILL OF MATERIALS</div>
          <div className="flex flex-col gap-1">
            {data.bill_of_materials.map((b) => (
              <div key={b.ware_id} className="flex items-center justify-between text-[12px]">
                <span className="truncate text-[#dfe6f0]">{b.name ?? wareName(b.ware_id)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{fmtNum(b.amount)}</span>
              </div>
            ))}
            {data.bill_of_materials.length === 0 && <div className="text-[11.5px] text-muted-foreground">No recipe data.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

type StationModuleRow = {
  module_id: string;
  macro: string | null;
  name: string | null;
  kind: string | null;
  size: string | null;
  produces_ware_id: string | null;
  count: number;
  construction_pct: number | null;
};

function ModulesList({ stationId }: { stationId: string }) {
  const { data: mods = [] } = useQuery<StationModuleRow[]>({
    queryKey: ["station-modules", stationId],
    queryFn: () => apiGet<StationModuleRow[]>(`/api/v1/stations/${encodeURIComponent(stationId)}/modules`),
    staleTime: 30_000,
  });
  if (mods.length === 0) return null;
  return (
    <div>
      <SectionLabel>MODULES</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {mods.map((m) => (
          <span key={m.module_id} className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11px] text-[#cdd5e3]">
            {m.name ?? m.macro}
            {m.count > 1 && <span className="font-mono text-muted-foreground">×{m.count}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
