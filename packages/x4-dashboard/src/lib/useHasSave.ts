import { useQuery } from "@tanstack/react-query";

type RefreshStatus = {
  active_key: string;
  following_latest: boolean;
  ingested_at: string | null;
};

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
  const { data, isLoading } = useQuery<RefreshStatus>({
    queryKey: ["refresh-status"],
    queryFn: () => fetch("/api/v1/refresh-status").then((r) => r.json()),
    refetchInterval: 7000,
  });
  return { hasSave: !!data?.active_key, isLoading };
}
