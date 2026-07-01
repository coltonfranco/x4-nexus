import { useQuery } from "@tanstack/react-query";

import { apiGet } from "./api";

export function useKnownFactions() {
  return useQuery<Record<string, boolean>>({
    queryKey: ["factions-known"],
    queryFn: () => apiGet<Record<string, boolean>>("/api/v1/factions/known"),
    staleTime: 60_000,
  });
}
