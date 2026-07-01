import { ProgressTrack, clampPct } from "../ui/progress-track";

// A value rendered as a proportional bar (vs the column max) + the formatted number.
// Used in the equipment comparison tables to eyeball the best part at a glance.
export function MetricBar({
  value,
  max,
  format,
  color = "bg-primary",
}: {
  value: number | null;
  max: number;
  format: (n: number) => string;
  color?: string;
}) {
  if (value == null) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = clampPct(value, max);
  return (
    <div className="flex items-center gap-2">
      <ProgressTrack
        pct={pct}
        trackClassName="h-1.5 flex-1 rounded-full bg-muted"
        fillClassName={`h-full rounded-full ${color}`}
      />
      <span className="w-16 shrink-0 text-right text-xs font-medium tabular-nums">{format(value)}</span>
    </div>
  );
}
