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

  let colorClass = "text-amber-500";
  if (dynamicColor && value != null) {
    if (value > 0) colorClass = "text-emerald-500";
    else if (value < 0) colorClass = "text-red-500";
    else colorClass = "text-muted-foreground";
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
      className={`tabular-nums font-mono font-medium inline-flex items-center gap-1 whitespace-nowrap ${colorClass} ${className}`}
    >
      {formatted}
      {icon ? <Coins className="w-3.5 h-3.5 shrink-0" /> : " Cr"}
    </span>
  );
}
