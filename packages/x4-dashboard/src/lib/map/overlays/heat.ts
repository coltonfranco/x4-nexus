// Heat ramp for the mining overlay, matching the app-wide convention: red = low (bad),
// green = high (good). Low → high: red → amber → green.

const STOPS: [number, [number, number, number]][] = [
  [0.0, [239, 68, 68]],   // red    (#ef4444) — low
  [0.5, [245, 158, 11]],  // amber  (#f59e0b) — mid
  [1.0, [34, 197, 94]],   // green  (#22c55e) — high
];

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
