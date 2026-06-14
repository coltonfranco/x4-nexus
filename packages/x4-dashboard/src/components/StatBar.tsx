
type Props = {
  value: number;
  max: number;
  label?: string;
  labelLeft?: string;
  labelRight?: string;
  /** Explicit CSS color. If omitted, bar is auto-colored green→amber→red by percentage. */
  color?: string;
  width?: number | string;
  height?: number;
  className?: string;
  inline?: boolean;
};

export function autoColor(pct: number): string {
  if (pct >= 66) return "var(--success)";
  if (pct >= 33) return "var(--warning)";
  return "var(--danger)";
}

export function StatBar({ value, max, label, labelLeft, labelRight, color, width = "100%", height = 4, className = "", inline = false }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color ?? autoColor(pct);

  if (inline) {
    return (
      <div className={`flex items-center gap-3 w-full justify-end ${className}`}>
        <div
          style={{
            width,
            height,
            backgroundColor: "rgba(255,255,255,.08)",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              backgroundColor: barColor,
              transition: "width 0.2s ease",
            }}
          />
        </div>
        {labelRight && <span className="text-xs font-mono font-medium text-foreground leading-none min-w-[3.5rem] text-right">{labelRight}</span>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 w-full max-w-full ${className}`}>
      {(labelLeft || labelRight) && (
        <div className="flex justify-between items-baseline w-full" style={{ width }}>
          <span className="text-[11px] leading-none text-muted-foreground uppercase tracking-wide">{labelLeft}</span>
          <span className="text-xs font-mono font-medium text-foreground leading-none">{labelRight}</span>
        </div>
      )}
      <div
        style={{
          width,
          height,
          backgroundColor: "rgba(255,255,255,.08)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: barColor,
            transition: "width 0.2s ease",
          }}
        />
      </div>
      {label && <div className="text-[11px] leading-none text-muted-foreground font-medium text-center">{label}</div>}
    </div>
  );
}
