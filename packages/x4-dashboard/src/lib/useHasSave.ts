import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";
import type { RefreshStatus } from "./useBackgroundRefresh";

type HasSaveStatus = Pick<RefreshStatus, "active_key" | "following_latest" | "ingested_at">;

/**
 * True when a save has been ingested and live data is available.
 *
 * Derived from the app-wide `/refresh-status` poll (shared query key, so this adds no extra
 * request and re-evaluates every 7s). `active_key` is non-empty whenever the API is serving a
 * built dynamic DB; it stays empty only when nothing has ever been ingested. Polling here is
 * what lets a page that mounted before the first ingest finished recover on its own, instead
 * of latching onto "no save" until a manual reload.
 */
export function useHasSave() {
  const { data, isLoading } = useQuery<HasSaveStatus>({
    queryKey: ["refresh-status"],
    queryFn: () => apiGet<HasSaveStatus>("/api/v1/refresh-status"),
    refetchInterval: 7000,
  });
  return { hasSave: !!data?.active_key, isLoading };
}
