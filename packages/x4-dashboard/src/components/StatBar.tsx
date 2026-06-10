
type Props = {
  value: number;
  max: number;
  label?: string;
  /** Explicit CSS color. If omitted, bar is auto-colored green→amber→red by percentage. */
  color?: string;
  width?: number;
};

function autoColor(pct: number): string {
  if (pct >= 66) return "hsl(142 71% 45%)";   // green
  if (pct >= 33) return "hsl(38 92% 50%)";    // amber
  return "hsl(0 72% 51%)";                    // red
}

export function StatBar({ value, max, label, color, width = 80 }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color ?? autoColor(pct);
  return (
    <div className="flex flex-col gap-1.5 w-max">
      <div
        style={{
          width,
          height: 6,
          borderRadius: 3,
          backgroundColor: "hsl(var(--muted))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 3,
            backgroundColor: barColor,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      {label && <div className="text-[11px] leading-none text-muted-foreground font-medium">{label}</div>}
    </div>
  );
}
