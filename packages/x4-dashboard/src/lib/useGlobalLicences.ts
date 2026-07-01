import { useMemo } from "react";

// Licences held by 2 or fewer factions are treated as "global use" gates rather than
// faction-specific restrictions, mirroring the same threshold used server-side.
export function useGlobalLicences<T extends { restriction_licence?: string | null; faction_id?: string | null }>(
  items: T[]
): Set<string> {
  return useMemo(() => {
    const count = new Map<string, Set<string>>();
    for (const item of items) {
      const lic = item.restriction_licence;
      if (lic && lic !== "generaluseship" && lic !== "generaluseequipment" && item.faction_id) {
        if (!count.has(lic)) count.set(lic, new Set());
        count.get(lic)!.add(item.faction_id);
      }
    }
    return new Set([...count].filter(([, fids]) => fids.size <= 2).map(([lic]) => lic));
  }, [items]);
}
