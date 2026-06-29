// Heat ramp for the mining overlay: red = low, green = high.
import { STATUS_COLORS } from "../constants";

const RED   = hexToRgb(STATUS_COLORS.danger);
const AMBER = hexToRgb(STATUS_COLORS.warning);
const GREEN = hexToRgb(STATUS_COLORS.success);

const STOPS: [number, [number, number, number]][] = [
  [0.0, RED],
  [0.5, AMBER],
  [1.0, GREEN],
];

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

export function heatColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [hi, hiC] = STOPS[i];
    if (x <= hi) {
      const [lo, loC] = STOPS[i - 1];
      const f = (x - lo) / (hi - lo || 1);
      const c = loC.map((v, k) => Math.round(v + (hiC[k] - v) * f));
      return `#${c.map(v => v.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  const last = STOPS[STOPS.length - 1][1];
  return `#${last.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
