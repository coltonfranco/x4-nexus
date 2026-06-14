import { Coins } from "lucide-react";

type CurrencyProps = {
  value?: number | null;
  maxValue?: number | null;
  icon?: boolean;
  dynamicColor?: boolean;
  className?: string;
  abbreviate?: boolean;
};

export function Currency({
  value,
  maxValue,
  icon = true,
  dynamicColor = false,
  className = "",
  abbreviate = false,
}: CurrencyProps) {
  if (value == null && maxValue == null) return <span className={`text-muted-foreground ${className}`}>—</span>;

  // Default gold via Tailwind class (so external className overrides work);
  // dynamicColor uses inline style to intentionally override.
  let dynamicStyle: React.CSSProperties | undefined;
  if (dynamicColor && value != null) {
    if (value > 0) dynamicStyle = { color: "var(--success)" };
    else if (value < 0) dynamicStyle = { color: "var(--danger)" };
    else dynamicStyle = { color: "var(--text-muted)" };
  }

  const formatVal = (v: number) => {
    if (abbreviate) {
      const abs = Math.abs(v);
      if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${Math.round(v / 1_000)}k`;
      return `${v}`;
    }
    return v.toLocaleString();
  };

  let formatted = "";
  if (value != null && maxValue != null && value !== maxValue) {
    formatted = `${formatVal(value)} – ${formatVal(maxValue)}`;
  } else if (value != null) {
    formatted = formatVal(value);
  } else if (maxValue != null) {
    formatted = formatVal(maxValue);
  }

  return (
    <span
      className={`tabular-nums font-mono font-medium inline-flex items-center gap-1.5 whitespace-nowrap text-gold ${className}`}
      style={dynamicStyle}
    >
      {formatted}
      {icon && <Coins className="h-3.5 w-3.5 opacity-80" />}
    </span>
  );
}
