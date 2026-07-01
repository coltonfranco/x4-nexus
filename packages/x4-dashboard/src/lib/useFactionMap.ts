import { useMemo } from "react";

import type { FactionSummary } from "./map/types";

export function useFactionMap(factions: FactionSummary[]): Map<string, FactionSummary> {
  return useMemo(() => new Map(factions.map((f) => [f.faction_id, f])), [factions]);
}
