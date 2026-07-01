import type { CSSProperties } from "react";
import { cn } from "../../lib/utils";

/** Percentage of `value` between `min` and `max`, clamped to [0, 100]. Shared
 *  clamp math behind StatBar/MetricBar/PriceBar's "value vs range" bars. */
export function clampPct(value: number, max: number, min = 0): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

/** Track + fill bar — the shared markup behind a "value visualised as a filled
 *  horizontal bar" display. Callers own their own track/fill styling; this just
 *  centralizes the two-div structure and the fill's computed width. */
export function ProgressTrack({
  pct,
  trackClassName,
  fillClassName,
  trackStyle,
  fillStyle,
}: {
  pct: number;
  trackClassName?: string;
  fillClassName?: string;
  trackStyle?: CSSProperties;
  fillStyle?: CSSProperties;
}) {
  return (
    <div className={cn("overflow-hidden", trackClassName)} style={trackStyle}>
      <div className={fillClassName} style={{ width: `${pct}%`, ...fillStyle }} />
    </div>
  );
}
