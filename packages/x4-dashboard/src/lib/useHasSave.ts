import { useQuery } from "@tanstack/react-query";

type HealthResponse = {
  ok: boolean;
  api_version: string;
  save_age_sec: number | null;
  game_version: string | null;
};

/**
 * True when a save has been ingested and live data is available.
 * Polls /api/v1/health; save_age_sec is null until the first save is parsed.
 */
export function useHasSave() {
  const { data, isLoading } = useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => fetch("/api/v1/health").then((r) => r.json()),
    staleTime: 30_000,
  });
  return { hasSave: data?.save_age_sec != null, isLoading };
}
