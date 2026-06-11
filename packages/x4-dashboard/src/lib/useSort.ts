import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

/** Generic click-to-sort over a row set. `accessors` maps a column key to a value
 *  getter; nulls always sort last regardless of direction. */
export function useSort<T>(
  rows: T[],
  accessors: Record<string, (row: T) => number | string | null>,
  initial: { key: string; dir: SortDir }
) {
  const [key, setKey] = useState(initial.key);
  const [dir, setDir] = useState<SortDir>(initial.dir);

  const sorted = useMemo(() => {
    const get = accessors[key];
    if (!get) return rows;
    const mul = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" || typeof bv === "string")
        return String(av).localeCompare(String(bv)) * mul;
      return (av - bv) * mul;
    });
    // accessors is a stable literal per page; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, dir]);

  function toggle(nextKey: string, defaultDir: SortDir = "desc") {
    if (nextKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setKey(nextKey);
      setDir(defaultDir);
    }
  }

  return { sorted, key, dir, toggle };
}
