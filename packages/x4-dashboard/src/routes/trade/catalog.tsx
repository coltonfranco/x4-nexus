import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useHasSave } from "../../lib/useHasSave";
import { SortHeader } from "../../components/ui/sort-header";
import { PriceBar } from "../../components/trade/PriceBar";
import { WareDetailPanel } from "../../components/trade/WareDetailPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

type WareGroup = { group_id: string; name: string | null; tier: number | null };

type Ware = {
  ware_id: string;
  name: string;
  group_id: string | null;
  transport: string | null;
  price_min: number | null;
  price_avg: number | null;
  price_max: number | null;
  has_production: boolean;
  has_drops: boolean;
};

type SortKey = "name" | "group" | "price";

function CommodityRow({ ware, groupName, onSelect }: { ware: Ware; groupName: string; onSelect: (id: string) => void }) {
  const qc = useQueryClient();

  // Warm the detail cache on hover so the expander renders instantly.
  const prefetch = () => {
    qc.prefetchQuery({
      queryKey: ["wares", ware.ware_id],
      queryFn: () => fetch(`/api/v1/wares/${ware.ware_id}`).then((r) => r.json()),
      staleTime: 60_000,
    });
  };

  return (
      <TableRow
        className="cursor-pointer"
        onClick={() => onSelect(ware.ware_id)}
        onMouseEnter={prefetch}
      >
        <TableCell className="text-muted-foreground/40 pl-4">
          <ChevronRight className="h-3.5 w-3.5 opacity-0" />
        </TableCell>
        <TableCell className="font-medium">{ware.name}</TableCell>
        <TableCell className="text-muted-foreground">{groupName}</TableCell>
        <TableCell>
          <PriceBar min={ware.price_min} avg={ware.price_avg} max={ware.price_max} />
        </TableCell>
      </TableRow>
  );
}

export default function TradeCatalogPage() {
  const { hasSave } = useHasSave();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState<SortKey>("group");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [selectedWareId, setSelectedWareId] = useState<string | null>(null);

  const { data: wares = [], isLoading } = useQuery<Ware[]>({
    queryKey: ["wares", "commodity"],
    queryFn: () =>
      fetch("/api/v1/wares?category=commodity&limit=2000")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 5 * 60_000,
  });
  const { data: groupList = [] } = useQuery<WareGroup[]>({
    queryKey: ["ware-groups"],
    queryFn: () =>
      fetch("/api/v1/ware-groups")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 10 * 60_000,
  });

  const groupInfo = useMemo(() => new Map(groupList.map((g) => [g.group_id, g])), [groupList]);
  const groupName = (id: string | null) =>
    id ? groupInfo.get(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1) : "Other";

  const groupsPresent = useMemo(() => {
    const seen = new Set<string>();
    wares.forEach((w) => seen.add(w.group_id ?? "__none__"));
    return [...seen].sort((a, b) => groupName(a === "__none__" ? null : a).localeCompare(groupName(b === "__none__" ? null : b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wares, groupInfo]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = wares.filter((w) => {
      if (needle && !w.name.toLowerCase().includes(needle)) return false;
      if (group !== "all" && (w.group_id ?? "__none__") !== group) return false;
      return true;
    });
    const mul = dir === "asc" ? 1 : -1;
    const tier = (w: Ware) => (w.group_id ? groupInfo.get(w.group_id)?.tier ?? 500 : 999);
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name) * mul;
      if (sort === "price") return ((a.price_avg ?? 0) - (b.price_avg ?? 0)) * mul;
      // group: by tier then group name then ware name
      const t = (tier(a) - tier(b)) * mul;
      if (t !== 0) return t;
      const g = groupName(a.group_id).localeCompare(groupName(b.group_id)) * mul;
      return g !== 0 ? g : a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wares, search, group, sort, dir, groupInfo]);

  const onSort = (c: SortKey) => {
    if (c === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(c);
      setDir(c === "price" ? "desc" : "asc");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Trade Goods</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {wares.length} tradable commodities · reference price range, production chains, drop sources
        </p>
        {!hasSave && (
          <p className="text-xs text-amber-300/60 mt-2">
            Load a save to unlock live supply radar and trade route data.
          </p>
        )}
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-0 flex flex-col">
        <HUDCard className="h-full">

          <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border/50 bg-muted/5 relative z-10">
            <Input placeholder="Search commodities…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 bg-muted/50 border-input" />
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groupsPresent.map((g) => (
                  <SelectItem key={g} value={g}>
                    {groupName(g === "__none__" ? null : g)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <PageLoaderPreset preset="trade" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No commodities match.</p>
        ) : (
          <Table className="table-fixed text-xs">
            <colgroup>
              <col style={{ width: 32 }} />
              <col />
              <col style={{ width: 160 }} />
              <col style={{ width: 240 }} />
            </colgroup>
            <TableHeader>
              <TableRow>
                <TableHead />
                <SortHeader label="Ware" active={sort === "name"} dir={dir} onClick={() => onSort("name")} />
                <SortHeader label="Group" active={sort === "group"} dir={dir} onClick={() => onSort("group")} />
                <SortHeader label="Price range" active={sort === "price"} dir={dir} onClick={() => onSort("price")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((w) => (
                <CommodityRow key={w.ware_id} ware={w} groupName={groupName(w.group_id)} onSelect={setSelectedWareId} />
              ))}
            </TableBody>
          </Table>
        )}
          </div>
        </HUDCard>
      </div>

      <Dialog open={selectedWareId !== null} onOpenChange={(open) => { if (!open) setSelectedWareId(null); }}>
        <DialogContent className="sm:max-w-2xl md:max-w-4xl min-h-[60vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Commodity Details</DialogTitle>
            <DialogDescription>Detailed view of the selected commodity</DialogDescription>
          </DialogHeader>
          {selectedWareId && <WareDetailPanel wareId={selectedWareId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
