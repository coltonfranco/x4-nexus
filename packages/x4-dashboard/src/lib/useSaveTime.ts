import { useQuery } from "@tanstack/react-query";
import { formatTimeAgo } from "./formatters";
import type { SaveSummary } from "../components/SaveSelector";

/** The active save's in-game time in seconds — the canonical "now" for all
 *  relative-time formatting across the app. React Query deduplicates the
 *  ["saves"] query so every consumer shares one cached result. */
export function useSaveTime(): number {
  const { data: saves = [] } = useQuery<SaveSummary[]>({ queryKey: ["saves"] });
  return saves.find((s) => s.is_active)?.in_game_time_sec ?? 0;
}

/** Convenience — formats an event timestamp as "how long before the most recent
 *  save this happened": e.g. "3m ago", "2h ago", "1d ago". */
export function useTimeAgo(timeSec: number): string {
  const currentTime = useSaveTime();
  return formatTimeAgo(timeSec, currentTime);
}
