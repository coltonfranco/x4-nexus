import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "./api";

/**
 * Selective background refresh.
 *
 * The API re-ingests the active save automatically when X4 writes it (see the in-process
 * refresher). This hook polls the cheap `/refresh-status` endpoint and, when a dataset's
 * change marker advances, invalidates only the React Query keys that depend on it — so a
 * single ship moving doesn't refetch the whole economy. The save-refresh button keeps its
 * full `invalidateQueries()` for an explicit, complete rebuild.
 */

/** The full `/api/v1/refresh-status` payload. Consumers that only need a
 *  subset should narrow with `Pick<RefreshStatus, ...>` rather than redeclare. */
export type RefreshStatus = {
  active_key: string;
  following_latest: boolean;
  ingested_at: string | null;
  source_fingerprint: string | null;
  last_event_id: number;
  last_ingest_ms: number | null;
  markers: Record<string, number>;
};

// delta entity_type → the query-key namespaces it should refresh.
//
// A plain token matches `queryKey[0]`. A `map:<sub>` token matches the in-sector map's
// namespaced keys (`["map", "stations", …]`) without nuking its static sibling layers
// (sectors/zones/gates), which never change between saves.
const ENTITY_QUERY_KEYS: Record<string, string[]> = {
  // Ships move every tick: refresh the fleet views, the galaxy forces/conflict overlays
  // (both derived from ship positions), and the in-sector station layer.
  ship: ["fleet-player", "ship", "ships", "map-forces", "map-conflicts", "map:stations"],
  logbook: ["logbook", "logbook-categories"],
  message: ["player-messages"],
  mission: ["missions"],
  mission_offer: ["mission-offers"],
  stat: ["player-stats"],
  player: ["player", "player-meta"],
  faction_relation: [
    "faction-relations",
    "player-reputation",
    "factions-strength",
    "map-tensions",
    "map-conflicts",
    "map-forces",
  ],
  station_offer: [
    "station-offers",
    "economy",
    "economy-wares",
    "economy-ware-stations",
    "ware-offers",
    "routes",
    "map-top-routes",
  ],
};

// Structural changes (a station built/destroyed) don't emit row-level events, so when the
// save content changed but nothing else mapped, refresh the layout/economy views — both
// the galaxy station layer (`map-stations`) and the in-sector one (`map:stations`).
const STRUCTURAL_KEYS = ["map-stations", "map:stations", "stations-player", "economy"];

// True when `key` (a plain or `map:<sub>` token) should invalidate this query.
function keyMatches(queryKey: readonly unknown[], keys: Set<string>): boolean {
  const k0 = queryKey[0];
  if (typeof k0 !== "string") return false;
  if (keys.has(k0)) return true;
  // In-sector map queries are ["map", "<sub>", …]; match them via the `map:<sub>` token.
  return k0 === "map" && typeof queryKey[1] === "string" && keys.has(`map:${queryKey[1]}`);
}

// Low-signal datasets (player stats) are tracked silently server-side — no per-row events,
// so no marker. Refresh them coarsely on any ingest, which is plenty for "every now and again".
const COARSE_KEYS = ["player-stats"];

export function useBackgroundRefresh(intervalMs = 7000): void {
  const qc = useQueryClient();
  const prev = useRef<{
    activeKey: string;
    markers: Record<string, number>;
    fp: string | null;
    ingestedAt: string | null;
  } | null>(null);

  const { data } = useQuery<RefreshStatus>({
    queryKey: ["refresh-status"],
    queryFn: () => apiGet<RefreshStatus>("/api/v1/refresh-status"),
    refetchInterval: intervalMs,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (!data) return;
    const last = prev.current;
    prev.current = {
      activeKey: data.active_key,
      markers: data.markers ?? {},
      fp: data.source_fingerprint ?? null,
      ingestedAt: data.ingested_at ?? null,
    };
    if (!last) return; // first observation establishes a baseline; don't refetch yet

    // The tracked save changed (a quicksave/autosave rotation, or a manual switch). Every
    // dataset now comes from a different DB, and per-entity markers reset to that DB's lower
    // event ids — so marker diffing would wrongly suppress refreshes. Do one clean full
    // refresh and treat this status as the new baseline.
    if (last.activeKey !== data.active_key) {
      qc.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "saves" && q.queryKey[0] !== "refresh-status",
      });
      return;
    }

    const keys = new Set<string>();
    for (const [etype, id] of Object.entries(data.markers ?? {})) {
      if ((last.markers[etype] ?? 0) < id) {
        for (const k of ENTITY_QUERY_KEYS[etype] ?? []) keys.add(k);
      }
    }
    if (keys.size === 0 && last.fp !== null && last.fp !== data.source_fingerprint) {
      STRUCTURAL_KEYS.forEach((k) => keys.add(k));
    }
    // Any fresh ingest refreshes the coarse, silent datasets.
    if (last.ingestedAt !== null && last.ingestedAt !== data.ingested_at) {
      COARSE_KEYS.forEach((k) => keys.add(k));
    }
    if (keys.size > 0) {
      qc.invalidateQueries({ predicate: (q) => keyMatches(q.queryKey, keys) });
    }
  }, [data, qc]);
}

/** Mount once near the app root (inside QueryClientProvider) to enable live refresh. */
export function BackgroundRefresh(): null {
  useBackgroundRefresh();
  return null;
}
