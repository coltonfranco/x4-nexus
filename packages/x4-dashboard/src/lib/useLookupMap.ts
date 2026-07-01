import { useMemo } from "react";

type LookupOpts = {
  normalizeId?: (id: string) => string;
  onMissing?: (id: string) => string;
  onEmpty?: string;
};

// Builds a `sector_id`/`ware_id` -> display-name Map from a query result, returning
// a stable lookup closure. `normalizeId` is applied to both map keys and lookup ids
// (e.g. lowercasing), so callers that key on lowercased ids stay case-insensitive.
export function useLookupMap<T>(
  items: T[],
  keyFn: (item: T) => string,
  valueFn: (item: T) => string | null | undefined,
  opts: LookupOpts = {}
): (id: string | null | undefined) => string {
  const { normalizeId = (id) => id, onMissing = (id) => id, onEmpty = "" } = opts;
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const item of items) {
      const value = valueFn(item);
      if (value) m.set(normalizeId(keyFn(item)), value);
    }
    return m;
  }, [items]);

  return (id) => {
    if (!id) return onEmpty;
    return map.get(normalizeId(id)) ?? onMissing(id);
  };
}
