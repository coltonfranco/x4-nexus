import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating, useQuery } from "@tanstack/react-query";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

/**
 * Live-data status pill for the sidebar.
 *
 * Reads the same cheap `/refresh-status` poll that `useBackgroundRefresh` drives (React
 * Query dedupes the request) to show when the active save was last ingested, and uses
 * `useIsFetching` to light up while background refetches are in flight — so the user can
 * see the data is staying fresh on its own, and how stale it currently is.
 */

type RefreshStatus = {
  active_key: string;
  ingested_at: string | null;
  last_ingest_ms: number | null;
};

function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "never";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "unknown";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RefreshIndicator() {
  // Don't count the status/catalog polls themselves — only real data refetches mean
  // "refreshing in the background".
  const fetching = useIsFetching({
    predicate: (q) => {
      const k = q.queryKey[0];
      return k !== "refresh-status" && k !== "saves";
    },
  });
  // A full rebuild (save activation) is a heavier, explicit ingest — show it distinctly
  // and don't fall back to "no data" while it's in progress.
  const ingesting = useIsMutating({ mutationKey: ["activate-save"] }) > 0;

  const { data, isError, isLoading } = useQuery<RefreshStatus>({
    queryKey: ["refresh-status"],
    queryFn: () => fetch("/api/v1/refresh-status").then((r) => r.json()),
    refetchInterval: 7000,
    refetchIntervalInBackground: true,
  });

  // Re-render every 5s so the relative "updated …" label stays current between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  // When the game rotates to a new save file, the active DB's ingest_state is momentarily
  // empty (the new file is still being ingested), so `/refresh-status` briefly returns a
  // null `ingested_at`. Hold the last known-good value through that gap so the freshness
  // label doesn't flash back to "no data" on every quicksave/autosave.
  const lastGood = useRef<{ ingestedAt: string; ms: number | null } | null>(null);
  if (!isError && data?.ingested_at) {
    lastGood.current = { ingestedAt: data.ingested_at, ms: data.last_ingest_ms ?? null };
  }
  const shown = !isError && data?.ingested_at
    ? { ingestedAt: data.ingested_at, ms: data.last_ingest_ms ?? null }
    : lastGood.current;

  const refreshing = fetching > 0;
  const ingestSecs = shown?.ms != null ? (shown.ms / 1000).toFixed(1) : null;

  // Right-hand label: prefer the rebuild state, then freshness, then loading/empty.
  let detail: string;
  if (ingesting) detail = "ingesting…";
  else if (shown) detail = `updated ${relativeTime(shown.ingestedAt, now)}`;
  else if (isLoading) detail = "connecting…";
  else detail = "no data";

  const title = ingestSecs ? `Last ingest took ${ingestSecs}s` : undefined;

  return (
    <div
      className="px-3 py-2 border-t border-border flex items-center gap-1.5 text-[11px] text-muted-foreground select-none"
      title={title}
    >
      {isError ? (
        <>
          <WifiOff className="h-3 w-3 text-amber-400/80" />
          <span className="text-amber-400/80">API offline</span>
        </>
      ) : refreshing || ingesting ? (
        <>
          <RefreshCw className="h-3 w-3 text-primary animate-spin" />
          <span className="text-primary">{ingesting ? "Rebuilding…" : "Refreshing…"}</span>
        </>
      ) : (
        <>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <Wifi className="h-3 w-3 text-emerald-400/80" />
          <span>Live</span>
        </>
      )}
      <span className="ml-auto tabular-nums">{detail}</span>
    </div>
  );
}
