// Data hooks for the map overlays. Each query is gated by `enabled` so we only hit the
// API for the overlay the user is actually looking at.

import { useQuery } from "@tanstack/react-query";

import type { EconomyWare, PlayerRelation, TradeRoute, WareOffer } from "./types";

type StaticResourceRow = { sector_id: string | null; ware: string; yield_level: string };
type LiveResourceRow = { sector_id: string; ware: string; current: number | null; max: number | null; yield_tier: string | null };
type RawEntry = { sector: string; ware: string; rank: number; label: string };

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

// X4 region yield tiers, lowest → highest (region_definitions.xml vocabulary). Numeric
// yields (e.g. from a future live endpoint) are used directly. Anything unrecognized
// falls back to the middle so a sector is never silently dropped from the heatmap.
const TIER_ORDER = [
  "lowest", "verylow", "lowminus", "low", "lowplus", "lowextra",
  "medlow", "medium", "medplus", "medhigh",
  "highlow", "high", "highplus", "veryhigh", "highest",
];
const TIER_FALLBACK = TIER_ORDER.indexOf("medium");

function levelRank(level: string): number {
  const n = Number(level);
  if (!Number.isNaN(n)) return n;
  const i = TIER_ORDER.indexOf(level.toLowerCase());
  return i >= 0 ? i : TIER_FALLBACK;
}

export type ResourceSource = "live" | "static";
export type ResEntry = { ware: string; intensity: number; label: string; rank: number };
export type SectorResources = { dominant: ResEntry; all: ResEntry[] };
// ware → sector(lowercase) → entry, used by the single-resource heatmap.
export type YieldMap = Map<string, Map<string, ResEntry>>;
// sector(lowercase) → its resources (dominant + all), used by the overview.
export type SectorResourceMap = Map<string, SectorResources>;
export type ResourceData = { byWare: YieldMap; bySector: SectorResourceMap; source: ResourceSource };

// Resources deplete/regenerate in a live game, so prefer the save-derived endpoint
// (live current/max amounts) and fall back to the static template yields. Both reduce
// to a comparable rank + a human label: live ranks by current stock, static by tier.
async function fetchResourceEntries(): Promise<{ entries: RawEntry[]; source: ResourceSource }> {
  try {
    const live = await fetch("/api/v1/map/resources/live?limit=2000");
    if (live.ok) {
      const rows: LiveResourceRow[] = await live.json();
      if (rows.length > 0) {
        return {
          source: "live",
          entries: rows.filter((r) => r.sector_id).map((r) => ({
            sector: r.sector_id.toLowerCase(),
            ware: r.ware,
            rank: r.current ?? 0,
            label: r.max ? `${compact(r.current ?? 0)}/${compact(r.max)}` : compact(r.current ?? 0),
          })),
        };
      }
    }
  } catch {
    // Network error reaching the live endpoint — fall through to static.
  }
  const rows: StaticResourceRow[] = await fetch("/api/v1/map/resources?limit=2000").then((r) => r.json());
  return {
    source: "static",
    entries: rows.filter((r) => r.sector_id).map((r) => ({
      sector: r.sector_id!.toLowerCase(),
      ware: r.ware,
      rank: levelRank(r.yield_level),
      label: r.yield_level,
    })),
  };
}

// Resource yields keyed both by ware (for the heatmap) and by sector (for the overview).
export function useResourceData(enabled: boolean) {
  return useQuery<ResourceData>({
    queryKey: ["map-resource-data"],
    enabled,
    queryFn: async () => {
      const { entries, source } = await fetchResourceEntries();
      // ware → sector(lowercase) → {rank, label}; keep the richest entry per sector.
      const raw = new Map<string, Map<string, { rank: number; label: string }>>();
      entries.forEach((e) => {
        const m = raw.get(e.ware) ?? new Map<string, { rank: number; label: string }>();
        const prev = m.get(e.sector);
        if (!prev || e.rank > prev.rank) m.set(e.sector, { rank: e.rank, label: e.label });
        raw.set(e.ware, m);
      });

      // Normalize each ware's ranks to 0.3..1 so even the weakest sector is visible.
      const byWare: YieldMap = new Map();
      raw.forEach((sectorRanks, ware) => {
        const vals = [...sectorRanks.values()].map((v) => v.rank);
        const min = Math.min(...vals), max = Math.max(...vals);
        const span = max - min || 1;
        const m = new Map<string, ResEntry>();
        sectorRanks.forEach((v, sid) =>
          m.set(sid, { ware, intensity: 0.3 + 0.7 * ((v.rank - min) / span), label: v.label, rank: v.rank }));
        byWare.set(ware, m);
      });

      // Invert to per-sector: each sector's resources sorted richest-first.
      const bySector: SectorResourceMap = new Map();
      byWare.forEach((sectorMap) => {
        sectorMap.forEach((entry, sid) => {
          const cur = bySector.get(sid);
          if (cur) cur.all.push(entry);
          else bySector.set(sid, { dominant: entry, all: [entry] });
        });
      });
      bySector.forEach((sr) => {
        sr.all.sort((a, b) => b.rank - a.rank);
        sr.dominant = sr.all[0];
      });

      return { byWare, bySector, source };
    },
  });
}

// Wares that are actually being traded somewhere in the active save (for the picker).
export function useEconomyWares(enabled: boolean) {
  return useQuery<EconomyWare[]>({
    queryKey: ["economy-wares-list"],
    enabled,
    queryFn: () => fetch("/api/v1/economy/wares?limit=2000").then((r) => r.json()),
  });
}

// Per-station offers for one ware. Empty until a save is ingested.
export function useWareOffers(wareId: string | null) {
  return useQuery<WareOffer[]>({
    queryKey: ["economy-ware-stations", wareId],
    enabled: wareId != null,
    queryFn: () => fetch(`/api/v1/economy/wares/${wareId}/stations`).then((r) => r.json()),
  });
}

// Top trade routes for a reference ship. Empty until a save is ingested.
export function useTopRoutes(enabled: boolean) {
  return useQuery<TradeRoute[]>({
    queryKey: ["map-top-routes"],
    enabled,
    queryFn: () => fetch("/api/v1/routes?limit=80").then((r) => r.json()),
  });
}

export function usePlayerRelations(enabled: boolean) {
  return useQuery<PlayerRelation[]>({
    queryKey: ["player-reputation"],
    enabled,
    queryFn: () => fetch("/api/v1/player/reputation").then((r) => r.json()),
  });
}

export type ConflictSide = {
  factions: { faction_id: string; faction_name: string; fighter_count: number }[];
  fighter_count: number;
};

export type ConflictEntry = {
  sector_id: string;
  fighter_count: number;
  hostile_pair_count: number;
  intensity: number;
  type: "battle" | "invasion" | "skirmish";
  invader_name: string | null;
  sector_owner_name: string | null;
  factions: { faction_id: string; faction_name: string; fighter_count: number }[];
  sides: ConflictSide[];
};

export function useConflictData(enabled: boolean) {
  return useQuery<ConflictEntry[]>({
    queryKey: ["map-conflicts"],
    enabled,
    queryFn: () => fetch("/api/v1/map/conflicts").then((r) => r.json()),
    staleTime: 30_000,
  });
}

export type BorderTensionEntry = {
  from_sector_id: string;
  to_sector_id: string;
  from_forces: { faction_id: string; faction_name: string; fighter_count: number }[];
  to_forces: { faction_id: string; faction_name: string; fighter_count: number }[];
  intensity: number;
};

export function useTensionData(enabled: boolean) {
  return useQuery<BorderTensionEntry[]>({
    queryKey: ["map-tensions"],
    enabled,
    queryFn: () => fetch("/api/v1/map/tensions").then((r) => r.json()).then(data => {
      console.log("FETCHED TENSIONS:", data);
      return data;
    }),
    staleTime: 30_000,
  });
}

export type SectorForceEntry = {
  sector_id: string;
  fighter_count: number;
  factions: { faction_id: string; faction_name: string; fighter_count: number }[];
  sides?: ConflictSide[];
};

export function useSectorForces(enabled: boolean) {
  return useQuery<SectorForceEntry[]>({
    queryKey: ["map-forces"],
    enabled,
    queryFn: () => fetch("/api/v1/map/forces").then((r) => r.json()),
    staleTime: 30_000,
  });
}

