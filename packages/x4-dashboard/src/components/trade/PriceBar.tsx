// Min–avg–max price visualised as a gradient bar with the average marked.
// Every ware in the catalog carries all three, so this renders for all of them.

import { Currency } from "../Currency";
import { clampPct } from "../ui/progress-track";

export function PriceBar({
  min,
  avg,
  max,
}: {
  min: number | null;
  avg: number | null;
  max: number | null;
}) {
  if (avg == null) return <span className="text-muted-foreground text-xs">—</span>;
  if (min == null || max == null || max <= min) {
    return <Currency value={avg} className="text-xs" icon={false} />;
  }
  const avgPct = clampPct(avg, max, min);
  return (
    <div className="flex items-center gap-2">
      <div
        style={{ width: 80, height: 6 }}
        className="relative shrink-0 rounded-none bg-muted"
      >
        <div
          className="absolute inset-0 rounded-none opacity-70 bg-gradient-to-r from-destructive via-warning to-success"
        />
        <div
          className="absolute rounded-sm bg-foreground"
          style={{ top: -2, left: `${avgPct}%`, transform: "translateX(-50%)", width: 2, height: 10 }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        <Currency value={min} maxValue={max} icon={false} abbreviate className="text-muted-foreground" />
      </span>
    </div>
  );
}
