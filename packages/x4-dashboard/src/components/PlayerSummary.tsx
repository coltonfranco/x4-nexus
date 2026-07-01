import { useQuery } from "@tanstack/react-query";
import { apiGetOrNull } from "../lib/api";
import { Currency } from "./Currency";

type PlayerMeta = { name: string | null; credits: number | null };

/**
 * Prominent active-player header: name + credits, shown directly under the logo.
 *
 * Reads the LIVE `/api/v1/player` account (shared with PlayerCard via the `["player-meta"]`
 * key, so React Query dedupes the request). Sourcing credits here — rather than from the
 * 30s `["saves"]` catalog header — is what keeps them current: a credit change fires a
 * `player` delta event, which `useBackgroundRefresh` maps to `player-meta`, so this refetches
 * on the next sync tick instead of lagging a full catalog poll behind. Renders nothing until
 * a save is ingested (the endpoint 404s → null).
 */
export function PlayerSummary() {
  const { data: player } = useQuery<PlayerMeta | null>({
    queryKey: ["player-meta"],
    queryFn: () => apiGetOrNull<PlayerMeta>("/api/v1/player"),
    staleTime: 60_000,
  });

  if (!player) return null;

  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
        {player.name || "Commander"}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
        {player.credits != null ? <Currency value={player.credits} /> : "—"}
      </div>
    </div>
  );
}
