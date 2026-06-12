// Station display + classification helpers shared by the map layer and popover.

import type { MapStation } from "./types";

// Function categories the map keeps visible when zoomed out.
export const MAJOR_CATEGORIES = new Set([
  "shipyard", "wharf", "equipmentdock", "tradestation", "headquarters",
]);

const CATEGORY_LABELS: Record<string, string> = {
  shipyard: "Shipyard",
  wharf: "Wharf",
  equipmentdock: "Equipment Dock",
  tradestation: "Trading Station",
  headquarters: "Headquarters",
  defence: "Defence Station",
  piratebase: "Pirate Base",
  factory: "Factory",
};

// A "main facility" is a key economic hub (shipyard / wharf / equipment dock /
// trading station) or the player HQ — regardless of owner.
export function isMainFacility(st: MapStation): boolean {
  return st.is_hq || (st.category != null && MAJOR_CATEGORIES.has(st.category));
}

// Anything the player owns (incl. the HQ).
export function isPlayerStation(st: MapStation): boolean {
  return st.is_player_owned || st.is_hq;
}

// Visibility tiers, driven by how large a sector hex is on screen:
//  - "player": fully zoomed out → only the player's own stations
//  - "major":  mid zoom → also every faction's main facilities
//  - "all":    zoomed into a sector (grid territory) → every station
export type StationTier = "player" | "major" | "all";

export function stationVisibleAt(st: MapStation, tier: StationTier): boolean {
  if (tier === "all") return true;
  if (tier === "major") return isPlayerStation(st) || isMainFacility(st);
  return isPlayerStation(st);
}

export function stationCategoryLabel(category: string | null): string {
  if (!category) return "Station";
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

export function stationDisplayName(st: MapStation): string {
  if (st.name && !st.name.startsWith("{")) return st.name;
  if (st.code) return st.code;
  return stationCategoryLabel(st.category);
}
