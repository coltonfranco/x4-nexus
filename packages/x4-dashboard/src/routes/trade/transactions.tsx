import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight, ArrowUpRight, ArrowDownLeft, ChevronLeft, ChevronRight,
  AlertTriangle, RefreshCw,
} from "lucide-react";
import { Currency } from "../../components/Currency";
import { PageLoaderPreset } from "../../components/PageLoader";
import { PageSubtitle } from "../../components/ui/page-subtitle";
import { formatTimeAgo } from "../../lib/formatters";
import { useSaveTime } from "../../lib/useSaveTime";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";

// ── Types ───────────────────────────────────────────────────────────────────────

type Trade = {
  time: number; ware: string | null; ware_name: string | null; price: number | null;
  quantity: number | null; buyer_name: string | null; buyer_is_player: boolean;
  seller_name: string | null; seller_is_player: boolean;
};

const PAGE_SIZE = 50;

function useJson<T>(key: string, url: string) {
  const q = useQuery<T>({
    queryKey: [key],
    queryFn: async () => {
      // Raw fetch (not apiGet): the thrown message embeds the url + status and is rendered
      // directly in the error banner below — apiGet's generic message would lose that detail.
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url} → ${r.status}`);
      return r.json() as Promise<T>;
    },
    staleTime: 30_000,
    retry: 6,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 5000),
  });
  return { ...q, isError: q.isError, error: q.error };
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function TransactionsPage() {
  const [page, setPage] = useState(0);

  const url = `/api/v1/economy/trades?player_only=true&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
  const { data: trades = [], isLoading, isError, error, refetch } = useJson<Trade[]>(`trades-page-${page}`, url);

  const currentTime = useSaveTime();

  const hasMore = trades.length === PAGE_SIZE;

  if (isLoading) return <div className="p-6"><PageLoaderPreset preset="economy" /></div>;

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-3 p-6">
        <AlertTriangle className="h-10 w-10 text-[var(--danger)] opacity-60" />
        <p className="text-sm font-semibold text-[var(--danger)]">Failed to load transactions</p>
        <p className="text-xs text-muted-foreground truncate max-w-md">{String(error)}</p>
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-medium bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 shrink-0 border-b border-border">
        <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
          <ArrowLeftRight className="h-6 w-6 text-primary" /> Transactions
        </h1>
        <PageSubtitle>All player trade history</PageSubtitle>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {trades.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            No transactions recorded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border z-10">
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <th className="text-left px-4 py-2 w-[1%] whitespace-nowrap">Dir</th>
                <th className="text-left px-2 py-2">Commodity</th>
                <th className="text-right px-2 py-2 w-[1%] whitespace-nowrap">Price</th>
                <th className="text-right px-2 py-2 w-[1%] whitespace-nowrap">Qty</th>
                <th className="text-right px-2 py-2 w-[1%] whitespace-nowrap">Total</th>
                <th className="text-left px-2 py-2">Counterparty</th>
                <th className="text-right px-4 py-2 w-[1%] whitespace-nowrap">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {trades.map((t, i) => {
                const sell = t.seller_is_player && !t.buyer_is_player;
                const buy = t.buyer_is_player && !t.seller_is_player;
                const internal = t.seller_is_player && t.buyer_is_player;
                const total = (t.price ?? 0) * (t.quantity ?? 0);
                const counterparty = t.seller_is_player ? t.buyer_name : t.seller_name;

                return (
                  <tr key={i} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-1.5">
                      <TooltipProvider>
                        <UiTooltip delayDuration={300}>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              sell ? "text-[var(--success)]" : buy ? "text-[var(--danger)]" : "text-muted-foreground"
                            }`}>
                              {sell ? <ArrowUpRight className="h-3.5 w-3.5" /> : buy ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3 w-3" />}
                              {internal ? "MOVE" : sell ? "SELL" : "BUY"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs font-normal">
                            {internal ? "Internal transfer" : sell ? `Sold to ${counterparty ?? "NPC"}` : `Bought from ${counterparty ?? "NPC"}`}
                          </TooltipContent>
                        </UiTooltip>
                      </TooltipProvider>
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-[200px]">{t.ware_name ?? t.ware ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Currency value={t.price} icon={false} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-xs">
                      {(t.quantity ?? 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Currency value={internal ? null : sell ? total : -total} dynamicColor icon={false} />
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[180px]">
                      {counterparty ?? "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(t.time, currentTime)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {trades.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border shrink-0 bg-muted/10">
          <span className="text-xs text-muted-foreground tabular-nums">
            {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + trades.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs tabular-nums px-2 min-w-[3ch] text-center">{page + 1}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
              className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
