import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronRight, Coins } from "lucide-react";
import { useMemo, useState } from "react";
import { Currency } from "../components/Currency";
import { WareDetailPanel } from "../components/trade/WareDetailPanel";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

type Ware = {
  ware_id: string;
  name: string;
  group_id: string | null;
  transport: string | null;
  tags: string | null;
  price_min: number | null;
  price_avg: number | null;
  price_max: number | null;
  has_production: boolean;
  has_drops: boolean;
};

const BUCKETS = [
  "Paint Mods",
  "Equipment Mods",
  "Crafting Materials",
  "Bribes",
  "Mission Items",
  "Contraband",
  "Luxury Goods",
  "Curiosities",
  "Research",
  "Other Inventory",
] as const;
type Bucket = (typeof BUCKETS)[number];
type FilterType = Bucket | "Craftable" | "Drops" | "all";

function bucketOf(w: Ware): Bucket {
  const t = w.tags ?? "";
  const has = (s: string) => t.includes(s);
  if (w.group_id === "contraband" || has("contraband")) return "Contraband";
  if (has("paintmod")) return "Paint Mods";
  if (has("equipmentmod")) return "Equipment Mods";
  if (has("bribe")) return "Bribes";
  if (w.group_id === "luxuryitem") return "Luxury Goods";
  if (w.group_id === "curiosity") return "Curiosities";
  if (has("crafting")) return "Crafting Materials";
  if (has("missiononly")) return "Mission Items";
  if (w.transport === "research" || has("research")) return "Research";
  return "Other Inventory";
}

type Flag = { label: string; variant: "secondary" | "muted" | "destructive" | "outline" };
function rowFlags(w: Ware): Flag[] {
  const t = w.tags ?? "";
  const out: Flag[] = [];
  if (w.group_id === "contraband" || t.includes("contraband")) out.push({ label: "Illegal", variant: "destructive" });
  if (w.has_production) out.push({ label: "Craftable", variant: "secondary" });
  if (w.has_drops) out.push({ label: "Drops", variant: "outline" });
  if (t.includes("missiononly")) out.push({ label: "Mission only", variant: "muted" });
  if (t.includes("tradeonly")) out.push({ label: "Trade only", variant: "muted" });
  return out;
}

type SortKey = "name" | "type" | "price";

function SortHeader({
  label,
  col,
  sort,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (c: SortKey) => void;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 text-left text-xs font-medium text-muted-foreground ${className}`}>
      <button onClick={() => onSort(col)} className={`inline-flex items-center gap-1 hover:text-foreground ${sort === col ? "text-foreground" : ""}`}>
        {label}
        {sort === col && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}

function NameCell({ ware }: { ware: Ware }) {
  if (ware.ware_id === "credits")
    return (
      <span className="flex items-center gap-1.5 font-semibold text-yellow-500">
        <Coins className="h-4 w-4" /> {ware.name}
      </span>
    );
  return <span className="text-sm font-medium">{ware.name}</span>;
}

function InventoryRow({ ware, bucket, onSelect }: { ware: Ware; bucket: Bucket; onSelect: (id: string) => void }) {
  const qc = useQueryClient();

  const prefetch = () => {
    qc.prefetchQuery({
      queryKey: ["wares", ware.ware_id],
      queryFn: () => fetch(`/api/v1/wares/${ware.ware_id}`).then((r) => r.json()),
      staleTime: 60_000,
    });
  };

  return (
      <tr
        className="border-b border-border transition-colors cursor-pointer hover:bg-muted/30"
        onClick={() => onSelect(ware.ware_id)}
        onMouseEnter={prefetch}
      >
        <td className="px-3 py-2 text-muted-foreground/40 pl-4">
          {/* Reserve space instead of chevron */}
          <ChevronRight className="h-3.5 w-3.5 opacity-0" />
        </td>
        <td className="px-3 py-2">
          <NameCell ware={ware} />
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">{bucket}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {rowFlags(ware).map((f) => (
              <Badge key={f.label} variant={f.variant} className="text-[10px]">
                {f.label}
              </Badge>
            ))}
          </div>
        </td>
        <td className="px-3 py-2">
          <Currency value={ware.price_avg} />
        </td>
      </tr>
  );
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortKey>("type");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [selectedWareId, setSelectedWareId] = useState<string | null>(null);

  const { data: wares = [], isLoading } = useQuery<Ware[]>({
    queryKey: ["wares", "inventory"],
    queryFn: () =>
      fetch("/api/v1/wares?category=inventory&limit=2000")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 5 * 60_000,
  });

  const withBucket = useMemo(() => wares.map((w) => ({ ware: w, bucket: bucketOf(w) })), [wares]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { Craftable: 0, Drops: 0 };
    for (const { ware, bucket } of withBucket) {
      c[bucket] = (c[bucket] ?? 0) + 1;
      if (ware.has_production) c.Craftable++;
      if (ware.has_drops) c.Drops++;
    }
    return c;
  }, [withBucket]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = withBucket.filter(({ ware, bucket: b }) => {
      if (needle && !ware.name.toLowerCase().includes(needle)) return false;
      if (filter === "Craftable" && !ware.has_production) return false;
      if (filter === "Drops" && !ware.has_drops) return false;
      if (filter !== "all" && filter !== "Craftable" && filter !== "Drops" && b !== filter) return false;
      return true;
    });
    const mul = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort === "name") return a.ware.name.localeCompare(b.ware.name) * mul;
      if (sort === "price") return ((a.ware.price_avg ?? 0) - (b.ware.price_avg ?? 0)) * mul;
      const t = a.bucket.localeCompare(b.bucket) * mul;
      return t !== 0 ? t : a.ware.name.localeCompare(b.ware.name);
    });
  }, [withBucket, search, filter, sort, dir]);

  const onSort = (c: SortKey) => {
    if (c === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(c);
      setDir(c === "price" ? "desc" : "asc");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-bold">Inventory &amp; Crafting</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {wares.length} inventory items · paint mods, crafting materials, mission items, contraband and curiosities
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="mr-2 w-52" />
          <button
            onClick={() => setFilter("all")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {BUCKETS.filter((b) => counts[b]).map((b) => (
            <button
              key={b}
              onClick={() => setFilter(b)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === b ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
            >
              {b} <span className="opacity-60">{counts[b]}</span>
            </button>
          ))}
          <div className="mx-1 h-4 w-px bg-border" />
          <button
            onClick={() => setFilter("Craftable")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === "Craftable" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          >
            Craftable <span className="opacity-60">{counts.Craftable}</span>
          </button>
          <button
            onClick={() => setFilter("Drops")}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${filter === "Drops" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"}`}
          >
            Drops <span className="opacity-60">{counts.Drops}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-2">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading inventory…</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No items match.</p>
        ) : (
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: 32 }} />
              <col />
              <col style={{ width: 150 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 200 }} />
            </colgroup>
            <thead className="sticky top-0 bg-background">
              <tr className="border-b border-border">
                <th />
                <SortHeader label="Item" col="name" sort={sort} dir={dir} onSort={onSort} />
                <SortHeader label="Type" col="type" sort={sort} dir={dir} onSort={onSort} />
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Notes</th>
                <SortHeader label="Value" col="price" sort={sort} dir={dir} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ware, bucket: b }) => (
                <InventoryRow key={ware.ware_id} ware={ware} bucket={b} onSelect={setSelectedWareId} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={selectedWareId !== null} onOpenChange={(open) => { if (!open) setSelectedWareId(null); }}>
        <DialogContent className="sm:max-w-2xl md:max-w-4xl min-h-[60vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Item Details</DialogTitle>
            <DialogDescription>Detailed view of the selected item</DialogDescription>
          </DialogHeader>
          {selectedWareId && <WareDetailPanel wareId={selectedWareId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
