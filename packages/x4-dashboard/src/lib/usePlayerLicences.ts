import { useQuery } from "@tanstack/react-query";

import { apiGet } from "./api";

export type Licence = { licence_type: string; faction_id: string };

export function usePlayerLicences() {
  return useQuery<Licence[]>({
    queryKey: ["player-licences"],
    queryFn: () => apiGet<Licence[]>("/api/v1/player/licences"),
    staleTime: 60_000,
  });
}
