import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Save } from "lucide-react";

export type SaveSummary = {
  key: string;
  save_name: string | null;
  in_game_time_sec: number | null;
  game_version: string | null;
  player_name: string | null;
  player_credits: number | null;
  db_built: boolean;
  db_current: boolean;
  is_active: boolean;
};

type RefreshStatus = { active_key: string; following_latest: boolean };

// Sentinel option value: "track whatever save X4 writes next" (no pin).
const LATEST = "__latest__";

function formatSaveName(s: SaveSummary) {
  if (!s.save_name || /^#\d+$/.test(s.save_name.trim())) {
    return s.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  }
  return s.save_name;
}

function formatPlayTime(seconds: number | null) {
  if (seconds == null) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

// Re-point the cached catalog at `updated` so the dropdown reflects the new active save
// immediately, without waiting on the (slow) /saves refetch that follows a rebuild.
function withActive(saves: SaveSummary[] | undefined, updated: SaveSummary) {
  return (
    saves?.map((s) =>
      s.key === updated.key
        ? { ...s, ...updated, is_active: true, db_current: true }
        : { ...s, is_active: false }
    ) ?? saves
  );
}

/** Active-save picker. "Latest (auto)" follows the newest save X4 writes; picking a
 *  specific save pins it for analysis. Activating refreshes all save-state queries. */
export function SaveSelector() {
  const qc = useQueryClient();

  const { data: saves = [] } = useQuery<SaveSummary[]>({
    queryKey: ["saves"],
    queryFn: async () => {
      const r = await fetch("/api/v1/saves");
      if (!r.ok) throw new Error(`saves ${r.status}`); // keep previous data on a transient error
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // Pinned vs follow-latest comes from the cheap refresh-status poll (deduped app-wide).
  const { data: status } = useQuery<RefreshStatus>({
    queryKey: ["refresh-status"],
    queryFn: () => fetch("/api/v1/refresh-status").then((r) => r.json()),
    refetchInterval: 7000,
  });
  const following = status?.following_latest ?? false;

  const afterIngest = (updated: SaveSummary, followLatest: boolean) => {
    qc.setQueryData<SaveSummary[]>(["saves"], (prev) => withActive(prev, updated));
    qc.setQueryData<RefreshStatus>(["refresh-status"], (prev) =>
      prev ? { ...prev, following_latest: followLatest, active_key: updated.key } : prev
    );
    // Full rebuild → refresh every dataset, but not the catalog/status (handled above).
    qc.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== "saves" && q.queryKey[0] !== "refresh-status",
    });
  };

  const activate = useMutation({
    mutationKey: ["activate-save"],
    mutationFn: async (key: string) => {
      const r = await fetch(`/api/v1/saves/${key}/activate`, { method: "POST" });
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        throw new Error(detail?.detail ?? `Rebuild failed (HTTP ${r.status}).`);
      }
      return r.json() as Promise<SaveSummary>;
    },
    onSuccess: (updated) => afterIngest(updated, false),
  });

  const followLatest = useMutation({
    mutationKey: ["activate-save"],
    mutationFn: async () => {
      const r = await fetch("/api/v1/saves/follow-latest", { method: "POST" });
      if (!r.ok) {
        const detail = await r.json().catch(() => null);
        throw new Error(detail?.detail ?? `Failed to follow latest (HTTP ${r.status}).`);
      }
      return r.json() as Promise<SaveSummary>;
    },
    onSuccess: (updated) => afterIngest(updated, true),
  });

  const active = saves.find((s) => s.is_active);
  const hasSave = active != null && active.db_current;
  const busy = activate.isPending || followLatest.isPending;
  const error = (activate.error as Error | null) ?? (followLatest.error as Error | null);
  const hasError = activate.isError || followLatest.isError;

  const onPick = (value: string) => {
    if (value === LATEST) followLatest.mutate();
    else if (value) activate.mutate(value);
  };

  const refresh = () => (following ? followLatest.mutate() : active && activate.mutate(active.key));

  const selectValue = following ? LATEST : active?.key ?? LATEST;

  return (
    <div className="px-3 py-3 border-t border-border space-y-1.5">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1.5"><Save className="h-3 w-3" /> Save</span>
        {saves.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={refresh}
            className="p-0.5 rounded hover:bg-muted/50 transition-colors disabled:opacity-40"
            title={following ? "Refresh latest save" : "Refresh save data"}
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {hasError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive space-y-1">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="break-words">{error?.message ?? "Rebuild failed."}</span>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="text-[11px] underline underline-offset-2 hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {saves.length === 0 ? (
        <p className="text-xs text-muted-foreground">No saves found</p>
      ) : (
        <>
          <select
            value={selectValue}
            disabled={busy}
            onChange={(e) => onPick(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
          >
            <option value={LATEST}>▸ Latest (auto)</option>
            {saves.map((s, i) => {
              const name = formatSaveName(s);
              const time = s.in_game_time_sec ? ` (${formatPlayTime(s.in_game_time_sec)})` : "";
              const newest = i === 0 ? " ★" : "";
              const rebuilding = s.db_current ? "" : " ↻";
              return (
                <option key={s.key} value={s.key}>
                  {name}{time}{newest}{rebuilding}
                </option>
              );
            })}
          </select>

          {!hasSave && !following && !busy ? (
            <p className="text-xs text-amber-400/80">Load a save to unlock live data</p>
          ) : (
            <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              {busy ? (
                <span className="flex items-center gap-1 text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {following ? "loading latest…" : "rebuilding…"}
                </span>
              ) : following ? (
                <span className="text-emerald-400/80">following newest</span>
              ) : (
                <span>pinned</span>
              )}
              {active?.game_version && <span>v{active.game_version}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
