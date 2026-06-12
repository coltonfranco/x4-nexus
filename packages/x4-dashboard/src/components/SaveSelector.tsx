import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Currency } from "./Currency";
import { Loader2, Save } from "lucide-react";

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

/** Active-save picker. Activating rebuilds that save's dynamic DB and refreshes all
 *  save-state queries (routes, economy, player, fleet, ...). Lives in the sidebar. */
export function SaveSelector() {
  const qc = useQueryClient();

  const { data: saves = [] } = useQuery<SaveSummary[]>({
    queryKey: ["saves"],
    queryFn: () => fetch("/api/v1/saves").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const activate = useMutation({
    mutationFn: (key: string) =>
      fetch(`/api/v1/saves/${key}/activate`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries(),
  });

  const active = saves.find((s) => s.is_active) ?? saves[0];

  return (
    <div className="px-3 py-3 border-t border-border space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Save className="h-3 w-3" /> Save
      </div>
      {saves.length === 0 ? (
        <p className="text-xs text-muted-foreground">No saves found</p>
      ) : (
        <>
          <select
            value={active?.key ?? ""}
            disabled={activate.isPending}
            onChange={(e) => activate.mutate(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs disabled:opacity-60"
          >
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
          <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
            {activate.isPending ? (
              <span className="flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" /> rebuilding…
              </span>
            ) : active?.player_credits != null ? (
              <Currency value={active.player_credits} icon={false} />
            ) : (
              <span>—</span>
            )}
            {active?.game_version && <span>v{active.game_version}</span>}
          </div>
        </>
      )}
    </div>
  );
}
