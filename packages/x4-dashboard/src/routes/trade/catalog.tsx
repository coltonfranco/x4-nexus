import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityIcon } from "../../components/EntityIcon";
import { useMemo, useState } from "react";
import { useHasSave } from "../../lib/useHasSave";
import { getWareGroupColor, getTierColor, getTierName, getTierLabel } from "../../lib/constants";
import { cn } from "../../lib/utils";
import { PriceBar } from "../../components/trade/PriceBar";
import { Currency } from "../../components/Currency";
import { WareDetailPanel } from "../../components/trade/WareDetailPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { FilterBar } from "../../components/FilterBar";
import { SearchInput } from "../../components/ui/search-input";
import { DataTable } from "../../components/DataTable";
import type { ColumnDef } from "../../components/DataTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { apiGet } from "../../lib/api";

type WareGroup = { group_id: string; name: string | null; tier: number | null };

type Ware = {
  ware_id: string;
  name: string;
  group_id: string | null;
  transport: string | null;
  price_min: number | null;
  price_avg: number | null;
  price_max: number | null;
  market_min: number | null;
  market_avg: number | null;
  market_max: number | null;
  sell_qty: number | null;
  buy_qty: number | null;
  net_demand: number | null;
  volume: number;
  has_production: boolean;
  has_drops: boolean;
  tier: number | null;
  icon_url: string | null;
};

type SortKey = "name" | "group" | "tier" | "volume" | "price" | "market_avg" | "net_demand" | "supply" | "demand";

export default function TradeCatalogPage() {
  const { hasSave } = useHasSave();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("group");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [selectedWareId, setSelectedWareId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: wares = [], isLoading } = useQuery<Ware[]>({
    queryKey: ["wares", "commodity"],
    // Raw fetch: normalizes a non-array payload to [] (defensive against a bad/error
    // response shape), which doesn't fit apiGet/apiGetOrNull's ok-vs-throw/null contract.
    queryFn: () =>
      fetch("/api/v1/wares?category=commodity&limit=2000")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 5 * 60_000,
  });
  const { data: groupList = [] } = useQuery<WareGroup[]>({
    queryKey: ["ware-groups"],
    // Raw fetch: same defensive array-normalization as `wares` above.
    queryFn: () =>
      fetch("/api/v1/ware-groups")
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
    staleTime: 10 * 60_000,
  });

  const groupInfo = useMemo(
    () => new Map(groupList.map((g) => [g.group_id, g])),
    [groupList]
  );
  const groupName = (id: string | null) => {
    if (!id) return "Other";
    const name = groupInfo.get(id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
    return name.replace(/ goods$/i, "");
  };

  const groupsPresent = useMemo(() => {
    const seen = new Set<string>();
    wares.forEach((w) => seen.add(w.group_id ?? "__none__"));
    return [...seen].sort((a, b) =>
      groupName(a === "__none__" ? null : a).localeCompare(
        groupName(b === "__none__" ? null : b)
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wares, groupInfo]);

  const tiersPresent = useMemo(
    () =>
      [...new Set(wares.map((w) => w.tier).filter((t): t is number => t != null))].sort(
        (a, b) => a - b
      ),
    [wares]
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = wares.filter((w) => {
      if (needle && !w.name.toLowerCase().includes(needle)) return false;
      if (group !== "all" && (w.group_id ?? "__none__") !== group) return false;
      if (tierFilter !== "all") {
        if (tierFilter === "none" && w.tier != null) return false;
        if (tierFilter !== "none" && w.tier !== Number(tierFilter)) return false;
      }
      return true;
    });
    const mul = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name) * mul;
      if (sort === "volume") return (a.volume - b.volume) * mul;
      if (sort === "price") return ((a.price_avg ?? 0) - (b.price_avg ?? 0)) * mul;
      if (sort === "market_avg") return ((a.market_avg ?? 0) - (b.market_avg ?? 0)) * mul;
      if (sort === "net_demand") return ((a.net_demand ?? 0) - (b.net_demand ?? 0)) * mul;
      if (sort === "supply") return ((a.sell_qty ?? 0) - (b.sell_qty ?? 0)) * mul;
      if (sort === "demand") return ((a.buy_qty ?? 0) - (b.buy_qty ?? 0)) * mul;
      
      const aTier = a.tier ?? 999;
      const bTier = b.tier ?? 999;

      if (sort === "tier") {
        const t = (aTier - bTier) * mul;
        if (t !== 0) return t;
        return a.name.localeCompare(b.name) * mul;
      }

      const t = (aTier - bTier) * mul;
      if (t !== 0) return t;
      const g = groupName(a.group_id).localeCompare(groupName(b.group_id)) * mul;
      return g !== 0 ? g : a.name.localeCompare(b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wares, search, group, tierFilter, sort, dir, groupInfo]);

  const onSort = (c: SortKey) => {
    if (c === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(c);
      setDir(["price", "market_avg", "net_demand", "supply", "demand", "volume"].includes(c) ? "desc" : "asc");
    }
  };

  const columns = useMemo<ColumnDef<Ware>[]>(
    () => [
      {
        key: "icon",
        label: "",
        align: "left",
        render: (w) => (
          <EntityIcon src={w.icon_url} alt={w.name} size={28} className="opacity-90" />
        ),
        className: "w-10 pl-4",
      },
      {
        key: "name",
        label: "Ware",
        sortKey: "name",
        align: "left",
        render: (w) => <span className="font-medium">{w.name}</span>,
      },
      {
        key: "group",
        label: "Group",
        sortKey: "group",
        align: "left",
        className: "w-40",
        render: (w) => (
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", getWareGroupColor(w.group_id))}>
            {groupName(w.group_id)}
          </span>
        ),
      },
      {
        key: "tier",
        label: "Tier",
        sortKey: "tier",
        align: "left",
        className: "w-24",
        render: (w) => (
          w.tier != null ? (
            <span 
              className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border", getTierColor(w.tier))}
              title={getTierName(w.tier)}
            >
              {getTierLabel(w.tier)}
            </span>
          ) : <span className="text-muted-foreground">—</span>
        ),
      },
      {
        key: "volume",
        label: "Volume",
        sortKey: "volume",
        align: "right",
        className: "w-20",
        render: (w) => (
          <span className="text-sm font-medium tracking-tight">
            {w.volume.toLocaleString()} <span className="text-[10px] text-muted-foreground font-normal">m³</span>
          </span>
        ),
      },
      {
        key: "price",
        label: "Price range",
        sortKey: "price",
        align: "right",
        className: "w-60",
        render: (w) => (
          <PriceBar min={w.price_min} avg={w.market_avg ?? w.price_avg} max={w.price_max} />
        ),
      },
      {
        key: "avg_price",
        label: "Avg Price",
        sortKey: "market_avg",
        align: "right",
        className: "w-28",
        render: (w) => (
          w.market_avg != null ? <Currency value={w.market_avg} /> : <span className="text-muted-foreground">—</span>
        ),
      },
      {
        key: "supply",
        label: "Supply",
        sortKey: "supply",
        align: "right",
        className: "w-24",
        render: (w) => (
          w.sell_qty != null ? <span className="font-mono text-xs text-success">{w.sell_qty.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>
        ),
      },
      {
        key: "demand",
        label: "Demand",
        sortKey: "demand",
        align: "right",
        className: "w-24",
        render: (w) => (
          w.buy_qty != null ? <span className="font-mono text-xs text-destructive">{w.buy_qty.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>
        ),
      },
      {
        key: "net_demand",
        label: "Net Demand",
        sortKey: "net_demand",
        align: "right",
        className: "w-32 pr-6",
        render: (w) => {
          if (w.net_demand == null) return <span className="text-muted-foreground">—</span>;
          const color = w.net_demand > 0 ? "text-success" : w.net_demand < 0 ? "text-destructive" : "text-muted-foreground";
          return <span className={`font-mono font-bold text-xs ${color}`}>{w.net_demand > 0 ? "+" : ""}{w.net_demand.toLocaleString()}</span>;
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupInfo]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Trade Goods</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {wares.length} tradable commodities · reference price range, production
          chains, drop sources
        </p>
        {!hasSave && (
          <p className="text-xs text-amber-300/60 mt-2">
            Load a save to unlock live supply radar and trade route data.
          </p>
        )}
      </div>

      <FilterBar>
        <SearchInput
          placeholder="Search commodities…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-44 h-7 text-xs">
            <SelectValue placeholder="All groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {groupsPresent.map((g) => (
              <SelectItem key={g} value={g}>
                <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border", getWareGroupColor(g === "__none__" ? null : g))}>
                  {groupName(g === "__none__" ? null : g)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-44 h-7 text-xs">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {tiersPresent.map((t) => (
              <SelectItem key={t} value={t.toString()}>
                <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border", getTierColor(t))}>
                  {getTierLabel(t)}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-2 flex flex-col min-h-0">
        <HUDCard className="h-full">
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <PageLoaderPreset preset="trade" />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                getRowKey={(w) => w.ware_id}
                sortKey={sort}
                sortDir={dir}
                onSortChange={(k) => onSort(k as SortKey)}
                onRowClick={(w) => setSelectedWareId(w.ware_id)}
                onRowHover={(w) =>
                  qc.prefetchQuery({
                    queryKey: ["wares", w.ware_id],
                    queryFn: () => apiGet(`/api/v1/wares/${w.ware_id}`),
                    staleTime: 60_000,
                  })
                }
                emptyMessage="No commodities match."
                className="table-fixed"
              />
            )}
          </div>
        </HUDCard>
      </div>

      <Dialog
        open={selectedWareId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedWareId(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl md:max-w-4xl min-h-[60vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Commodity Details</DialogTitle>
            <DialogDescription>
              Detailed view of the selected commodity
            </DialogDescription>
          </DialogHeader>
          {selectedWareId && <WareDetailPanel wareId={selectedWareId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
