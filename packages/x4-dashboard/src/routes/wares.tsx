import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EntityIcon } from "../components/EntityIcon";
import { StatBar } from "../components/StatBar";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type WareGroup = {
  group_id: string;
  name: string | null;
  tags: string | null;
  tier: number | null;
  priority: number | null;
};

type WareSummary = {
  ware_id: string;
  name: string;
  group_id: string | null;
  transport: string | null;
  volume: number | null;
  price_avg: number | null;
  tags: string | null;
  icon_url: string | null;
};

type ProductionInput = { ware_id: string; amount: number };

type ProductionMethod = {
  method: string;
  time_sec: number | null;
  amount: number | null;
  workforce: number | null;
  inputs: ProductionInput[];
};

type WareDetail = WareSummary & {
  price_min: number | null;
  price_max: number | null;
  storage_class: string | null;
  owners: string[];
  illegal_factions: string[];
  restriction_licence: string | null;
  production: ProductionMethod[];
};

type DropSource = {
  list_id: string;
  category: string | null;
  spawn_chance: number | null;
  item_chance: number | null;
  min_amount: number;
  max_amount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TRANSPORT_COLORS: Record<string, "default" | "secondary" | "muted" | "outline"> = {
  container: "default",
  solid: "secondary",
  liquid: "muted",
  passenger: "outline",
};

function groupLabel(groupId: string | null, groupMap: Map<string, WareGroup>): string {
  if (!groupId) return "Other";
  const g = groupMap.get(groupId);
  return g?.name ?? (groupId.charAt(0).toUpperCase() + groupId.slice(1));
}

function fmtSeconds(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// ─── PriceBar ─────────────────────────────────────────────────────────────────

function PriceBar({ min, avg, max }: { min: number | null; avg: number | null; max: number | null }) {
  if (!min || !max || !avg) return <span className="text-muted-foreground text-xs">—</span>;
  const range = max - min;
  if (range <= 0) return <span className="text-xs tabular-nums">{avg.toLocaleString()} Cr</span>;
  const avgPct = ((avg - min) / range) * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 80, height: 6, borderRadius: 3, background: "hsl(var(--muted))", position: "relative", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 3, background: "linear-gradient(to right, hsl(217 91% 60%), hsl(38 92% 50%), hsl(142 71% 45%))", opacity: 0.7 }} />
        <div style={{ position: "absolute", top: -2, left: `${avgPct}%`, transform: "translateX(-50%)", width: 2, height: 10, borderRadius: 1, background: "hsl(var(--foreground))" }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{min.toLocaleString()}–{max.toLocaleString()}</span>
    </div>
  );
}

// ─── Production chain ─────────────────────────────────────────────────────────

function ProductionInputLine({ input, depth }: { input: ProductionInput; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useQuery<WareDetail>({
    queryKey: ["wares", input.ware_id],
    queryFn: () => fetch(`/api/v1/wares/${input.ware_id}`).then((r) => r.json()),
    enabled: expanded,
  });
  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-2 py-1">
        {depth < 3 && (
          <button onClick={() => setExpanded((e) => !e)} className="text-muted-foreground hover:text-foreground transition-colors" style={{ width: 16, height: 16, display: "flex", alignItems: "center" }}>
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 opacity-50" />}
          </button>
        )}
        {depth >= 3 && <span style={{ width: 16 }} />}
        <span className="text-xs text-primary font-mono">{input.amount}×</span>
        <span className="text-sm">{input.ware_id.replace(/_/g, " ")}</span>
      </div>
      {expanded && detail?.production?.slice(0, 1).map((method) => (
        <div key={method.method} className="ml-4">
          {method.inputs.map((inp) => <ProductionInputLine key={inp.ware_id} input={inp} depth={depth + 1} />)}
        </div>
      ))}
    </div>
  );
}

function ProductionChain({ wareId }: { wareId: string }) {
  const { data, isLoading } = useQuery<WareDetail>({
    queryKey: ["wares", wareId],
    queryFn: () => fetch(`/api/v1/wares/${wareId}`).then((r) => r.json()),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (!data || data.production.length === 0) {
    return <p className="text-xs text-muted-foreground py-2 italic">No production method — raw resource</p>;
  }

  const methods = data.production;
  const content = (method: ProductionMethod) => (
    <div className="space-y-2">
      {(data.owners?.length > 0 || data.illegal_factions?.length > 0 || data.restriction_licence) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {data.restriction_licence && <Badge variant="outline" className="text-xs">Requires: {data.restriction_licence}</Badge>}
          {data.illegal_factions?.length > 0 && <Badge variant="destructive" className="text-xs">Contraband in {data.illegal_factions.length} faction{data.illegal_factions.length > 1 ? "s" : ""}</Badge>}
        </div>
      )}
      <div className="rounded-md bg-muted/40 p-3 space-y-2">
        <div className="flex gap-6 text-xs text-muted-foreground">
          {method.time_sec != null && <span><span className="font-medium text-foreground">{fmtSeconds(method.time_sec)}</span> / cycle</span>}
          {method.amount != null && <span>Output: <span className="font-medium text-foreground">{method.amount}</span></span>}
          {method.workforce != null && method.workforce > 0 && <span>Workforce: <span className="font-medium text-foreground">{method.workforce}</span></span>}
        </div>
        {method.inputs.length > 0 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Inputs</p>
            {method.inputs.map((inp) => <ProductionInputLine key={inp.ware_id} input={inp} depth={0} />)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No inputs</p>
        )}
      </div>
    </div>
  );

  if (methods.length === 1) return content(methods[0]);
  return (
    <Tabs defaultValue={methods[0].method}>
      <TabsList className="h-7 mb-2">
        {methods.map((m) => <TabsTrigger key={m.method} value={m.method} className="text-xs h-6 px-2">{m.method}</TabsTrigger>)}
      </TabsList>
      {methods.map((m) => <TabsContent key={m.method} value={m.method}>{content(m)}</TabsContent>)}
    </Tabs>
  );
}

// ─── Drop sources ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  ship: "Ship wreck",
  lockbox: "Lockbox",
  asteroid: "Asteroid",
  crystal: "Crystal",
  story: "Mission",
  masstraffic: "Traffic",
  other: "Other",
};

function WareDropSources({ wareId }: { wareId: string }) {
  const { data = [], isLoading } = useQuery<DropSource[]>({
    queryKey: ["drops", "wares", wareId],
    queryFn: () => fetch(`/api/v1/drops/wares/${wareId}`).then((r) => r.json()),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (data.length === 0) return <p className="text-xs text-muted-foreground py-2 italic">Not obtainable via drops.</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted-foreground text-left">
          <th className="pb-2 font-medium">Source</th>
          <th className="pb-2 font-medium">Type</th>
          <th className="pb-2 font-medium">Basket fires</th>
          <th className="pb-2 font-medium">Item chance</th>
          <th className="pb-2 font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {data.map((src, i) => (
          <tr key={i} className="border-t border-border/50">
            <td className="py-1 pr-4 font-mono">{src.list_id.replace(/_/g, " ")}</td>
            <td className="py-1 pr-4">
              <Badge variant="muted" className="text-xs">{CATEGORY_LABELS[src.category ?? ""] ?? src.category}</Badge>
            </td>
            <td className="py-1 pr-4">
              <div className="flex items-center gap-2">
                <StatBar value={src.spawn_chance ?? 100} max={100} width={48} />
                <span className="text-muted-foreground tabular-nums">
                  {src.spawn_chance != null ? `${src.spawn_chance}%` : "always"}
                </span>
              </div>
            </td>
            <td className="py-1 pr-4">
              {src.item_chance != null ? (
                <div className="flex items-center gap-2">
                  <StatBar value={src.item_chance} max={100} width={48} />
                  <span className="text-muted-foreground tabular-nums">{src.item_chance}%</span>
                </div>
              ) : (
                <span className="text-muted-foreground">guaranteed</span>
              )}
            </td>
            <td className="py-1 text-muted-foreground tabular-nums">
              {src.min_amount === src.max_amount ? src.min_amount : `${src.min_amount}–${src.max_amount}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── WareRow ──────────────────────────────────────────────────────────────────

function WareRow({ ware }: { ware: WareSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="border-b border-border transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <td className="px-3 py-2 w-8">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </td>
        <td className="px-3 py-2 w-8"><EntityIcon src={ware.icon_url} alt={ware.name} size={24} /></td>
        <td className="px-3 py-2 font-medium text-sm">{ware.name}</td>
        <td className="px-3 py-2">
          {ware.transport && <Badge variant={TRANSPORT_COLORS[ware.transport] ?? "muted"} className="text-xs">{ware.transport}</Badge>}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{ware.volume != null ? `${ware.volume} m³` : "—"}</td>
        <td className="px-3 py-2"><PriceBar min={null} avg={ware.price_avg} max={null} /></td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td colSpan={6} className="px-8 pb-4 pt-2">
            <Tabs defaultValue="production">
              <TabsList className="h-7 mb-3">
                <TabsTrigger value="production" className="text-xs h-6 px-3">Production</TabsTrigger>
                <TabsTrigger value="drops" className="text-xs h-6 px-3">Drop Sources</TabsTrigger>
              </TabsList>
              <TabsContent value="production">
                <ProductionChain wareId={ware.ware_id} />
              </TabsContent>
              <TabsContent value="drops">
                <WareDropSources wareId={ware.ware_id} />
              </TabsContent>
            </Tabs>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── WareGroupSection ─────────────────────────────────────────────────────────

function WareGroupSection({ groupId, groupMap, wares }: { groupId: string | null; groupMap: Map<string, WareGroup>; wares: WareSummary[] }) {
  const [open, setOpen] = useState(true);
  const label = groupLabel(groupId, groupMap);
  return (
    <div>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label} ({wares.length})
      </button>
      {open && (
        <table className="w-full text-sm">
          <tbody>{wares.map((w) => <WareRow key={w.ware_id} ware={w} />)}</tbody>
        </table>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const NONE_GROUP = "__none__";

export default function WaresPage() {
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedTransport, setSelectedTransport] = useState("all");
  const [selectedTags, setSelectedTags] = useState("all");

  const { data: wares = [], isLoading } = useQuery<WareSummary[]>({
    queryKey: ["wares"],
    queryFn: () => fetch("/api/v1/wares?limit=2000").then((r) => r.json()),
  });

  const { data: groupList = [] } = useQuery<WareGroup[]>({
    queryKey: ["ware-groups"],
    queryFn: () => fetch("/api/v1/ware-groups").then((r) => r.json()),
  });

  const groupMap = useMemo(() => new Map(groupList.map((g) => [g.group_id, g])), [groupList]);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    wares.forEach((w) => seen.add(w.group_id ?? NONE_GROUP));
    return Array.from(seen).sort((a, b) => groupLabel(a === NONE_GROUP ? null : a, groupMap).localeCompare(groupLabel(b === NONE_GROUP ? null : b, groupMap)));
  }, [wares, groupMap]);

  const transports = useMemo(() => {
    const seen = new Set<string>();
    wares.forEach((w) => { if (w.transport) seen.add(w.transport); });
    return Array.from(seen).sort();
  }, [wares]);

  const filtered = wares.filter((w) => {
    if (search && !w.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedGroup !== "all" && (w.group_id ?? NONE_GROUP) !== selectedGroup) return false;
    if (selectedTransport !== "all" && w.transport !== selectedTransport) return false;
    if (selectedTags !== "all") {
      const gTags = w.group_id ? (groupMap.get(w.group_id)?.tags ?? null) : null;
      if (gTags !== selectedTags) return false;
    }
    return true;
  });

  const byGroup = useMemo(() => {
    const map = new Map<string | null, WareSummary[]>();
    for (const w of filtered) {
      const g = w.group_id ?? null;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(w);
    }
    return Array.from(map.entries()).sort(([a], [b]) =>
      groupLabel(a, groupMap).localeCompare(groupLabel(b, groupMap))
    );
  }, [filtered, groupMap]);

  const hasFilters = search || selectedGroup !== "all" || selectedTransport !== "all" || selectedTags !== "all";

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-2xl font-bold">Wares</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {wares.length} wares in catalog{filtered.length !== wares.length && ` · ${filtered.length} matching`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-muted/20">
        <Input placeholder="Search wares…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-48" />

        <Select value={selectedTags} onValueChange={setSelectedTags}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="tradable">Tradable</SelectItem>
            <SelectItem value="buildable">Buildable</SelectItem>
            <SelectItem value="craftable">Craftable</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedGroup} onValueChange={setSelectedGroup}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g} value={g}>
                {groupLabel(g === NONE_GROUP ? null : g, groupMap)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedTransport} onValueChange={setSelectedTransport}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All transport" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All transport</SelectItem>
            {transports.map((t) => (
              <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setSearch(""); setSelectedGroup("all"); setSelectedTransport("all"); setSelectedTags("all"); }}>
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Loading wares…</p>
        ) : byGroup.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No wares match your filters.</p>
        ) : (
          <div className="space-y-4">
            {byGroup.map(([group, groupWares]) => (
              <WareGroupSection key={group ?? "_"} groupId={group} groupMap={groupMap} wares={groupWares} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
