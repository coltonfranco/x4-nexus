
type Props = {
  value: number;
  max: number;
  label?: string;
  /** Explicit CSS color. If omitted, bar is auto-colored green→amber→red by percentage. */
  color?: string;
  width?: number;
  height?: number;
  className?: string;
};

export function autoColor(pct: number): string {
  if (pct >= 66) return "hsl(var(--success))";
  if (pct >= 33) return "hsl(var(--warning))";
  return "hsl(var(--destructive))";
}

export function StatBar({ value, max, label, color, width = 80, height = 6, className = "" }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color ?? autoColor(pct);
  return (
    <div className={`flex flex-col gap-1.5 w-max ${className}`}>
      <div
        style={{
          width,
          height,
          borderRadius: height / 2,
          backgroundColor: "hsl(var(--muted))",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: height / 2,
            backgroundColor: barColor,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      {label && <div className="text-[11px] leading-none text-muted-foreground font-medium">{label}</div>}
    </div>
  );
}
