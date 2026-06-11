// Min–avg–max price visualised as a gradient bar with the average marked.
// Every ware in the catalog carries all three, so this renders for all of them.

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
    return <span className="text-xs tabular-nums">{avg.toLocaleString()} Cr</span>;
  }
  const avgPct = ((avg - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div
        style={{ width: 80, height: 6 }}
        className="relative shrink-0 rounded-full bg-muted"
      >
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background:
              "linear-gradient(to right, hsl(217 91% 60%), hsl(38 92% 50%), hsl(142 71% 45%))",
          }}
        />
        <div
          className="absolute rounded-sm bg-foreground"
          style={{ top: -2, left: `${avgPct}%`, transform: "translateX(-50%)", width: 2, height: 10 }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {min.toLocaleString()}–{max.toLocaleString()}
      </span>
    </div>
  );
}
