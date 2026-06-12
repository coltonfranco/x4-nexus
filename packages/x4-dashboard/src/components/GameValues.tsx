import { getReputationColor } from "../lib/formatters";

export function Reputation({ value, className = "" }: { value: number, className?: string }) {
  const colorClass = getReputationColor(value);
  const sign = value > 0 ? "+" : "";
  return (
    <span className={`font-mono font-medium ${colorClass} ${className}`}>
      {sign}{value.toFixed(0)}
    </span>
  );
}
