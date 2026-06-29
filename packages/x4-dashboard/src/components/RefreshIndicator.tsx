import { useEffect, useRef, useState } from "react";
import { useIsFetching, useIsMutating, useQuery } from "@tanstack/react-query";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";

/**
 * Live-data status pill for the sidebar.
 *
 * It shows two *separate* things, which used to be conflated:
 *   1. Connection / tracking health — the green "Live" dot means the API is up and watching
 *      for new saves; it will pick up your next quicksave/autosave on its own.
 *   2. Data freshness — "last save Nm ago", based on *when the player actually saved* (the
 *      save's real timestamp), NOT when we last parsed. The dashboard can only be as current
 *      as your most recent save, so if you haven't saved in a while the figures on screen are
 *      that old. The age turns amber past a few minutes to hint "save in-game to refresh".
 *
 * Reads the same cheap `/refresh-status` poll that drives background refresh (for the
 * refreshing/offline states) plus the deduped `/saves` catalog (for the active save's real
 * save time) — React Query shares both with their other observers.
 */

type RefreshStatus = {
  active_key: string;
  ingested_at: string | null;
  last_ingest_ms: number | null;
};

type SaveRow = {
  is_active: boolean;
  real_time_iso: string | null;
  mtime: number | null;
};

// Past this, the on-screen state is getting old — colour the age to nudge a save.
const STALE_AFTER_SEC = 5 * 60;

function relativeTime(epochMs: number | null, now: number): string {
  if (epochMs == null) return "never";
  const secs = Math.max(0, Math.round((now - epochMs) / 1000));
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function clockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// When the player last saved: prefer the save's real-world timestamp, fall back to file mtime.
function saveEpoch(s: SaveRow | undefined): number | null {
  if (!s) return null;
  if (s.real_time_iso) {
    const t = Date.parse(s.real_time_iso);
    if (!Number.isNaN(t)) return t;
  }
  return s.mtime != null ? s.mtime * 1000 : null;
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

  const { data: status, isError, isLoading } = useQuery<RefreshStatus>({
    queryKey: ["refresh-status"],
    queryFn: () => fetch("/api/v1/refresh-status").then((r) => r.json()),
    refetchInterval: 7000,
    refetchIntervalInBackground: true,
  });

  // The save catalog (deduped with SaveSelector's query) carries when the active save was
  // actually written — the real freshness signal.
  const { data: saves } = useQuery<SaveRow[]>({
    queryKey: ["saves"],
    queryFn: () => fetch("/api/v1/saves").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  // Re-render every 5s so the relative "last save …" label stays current between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const epoch = saveEpoch(saves?.find((s) => s.is_active));

  // Hold the last known save time through transient gaps (e.g. the brief active-key churn while
  // a quicksave/autosave rotation is ingested) so the label doesn't flash to "no save" mid-play.
  const lastGood = useRef<number | null>(null);
  if (epoch != null) lastGood.current = epoch;
  const shownEpoch = epoch ?? lastGood.current;

  const refreshing = fetching > 0;
  const ageSecs = shownEpoch != null ? (now - shownEpoch) / 1000 : null;
  const stale = ageSecs != null && ageSecs > STALE_AFTER_SEC;

  // Right-hand label: prefer the rebuild state, then save freshness, then loading/empty.
  let detail: string;
  if (ingesting) detail = "ingesting…";
  else if (shownEpoch != null) detail = `last save ${relativeTime(shownEpoch, now)}`;
  else if (isLoading || !saves) detail = "connecting…";
  else detail = "no save";

  const ingestSecs =
    status?.last_ingest_ms != null ? ` (last parse ${(status.last_ingest_ms / 1000).toFixed(1)}s)` : "";
  const title =
    shownEpoch != null
      ? `Watching for new saves. Showing your last save from ${clockTime(shownEpoch)} — press F5 in-game to update.${ingestSecs}`
      : "Watching for new saves. No save ingested yet.";

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
          <span className="text-primary">{ingesting ? "Rebuilding…" : "Updating…"}</span>
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
      <span className={`ml-auto tabular-nums ${stale ? "text-amber-400/80" : ""}`}>{detail}</span>
    </div>
  );
}
