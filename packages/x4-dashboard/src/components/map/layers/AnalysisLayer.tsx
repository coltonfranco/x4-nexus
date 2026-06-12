// Overlays drawn above the sectors: a highlighted route path and the navigation path.
// (Trade routes themselves are shown as a profit tint on the sector hexes, not markers.)

import type { Transform } from "../../../lib/map/types";

export function RoutePathLayer({ points, transform }: { points: [number, number][]; transform: Transform }) {
  if (points.length < 2) return null;
  const w = 3 / transform.scale;
  const poly = points.map((p) => `${p[0]},${p[1]}`).join(" ");
  return (
    <g style={{ pointerEvents: "none" }}>
      <polyline points={poly} fill="none" stroke="#f59e0b" strokeWidth={w * 2.4} opacity={0.3}
        strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={poly} fill="none" stroke="#fbbf24" strokeWidth={w} opacity={0.95}
        strokeLinejoin="round" strokeLinecap="round" />
      {[points[0], points[points.length - 1]].map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={w * 1.6} fill={i === 0 ? "#34d399" : "#fbbf24"} stroke="#0b1220" strokeWidth={w * 0.3} />
      ))}
    </g>
  );
}

export function NavLayer({ points, origin, dest, transform }: {
  points: [number, number][];
  origin: [number, number] | null;
  dest: [number, number] | null;
  transform: Transform;
}) {
  const w = 3 / transform.scale;
  const poly = points.map((p) => `${p[0]},${p[1]}`).join(" ");
  return (
    <g style={{ pointerEvents: "none" }}>
      {points.length >= 2 && (
        <>
          <polyline points={poly} fill="none" stroke="#0ea5e9" strokeWidth={w * 2.2} opacity={0.25}
            strokeLinejoin="round" strokeLinecap="round" />
          <polyline points={poly} fill="none" stroke="#7dd3fc" strokeWidth={w} opacity={0.95}
            strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${w * 3} ${w * 2}`}>
            <animate attributeName="stroke-dashoffset" from={w * 5} to="0" dur="0.6s" repeatCount="indefinite" />
          </polyline>
          {points.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={w * 1.4} fill="#0ea5e9" stroke="#7dd3fc" strokeWidth={w * 0.4} />
          ))}
        </>
      )}
      {/* Only mark endpoints once a real route exists; a lone origin is shown by the
          selected sector's highlighted bounds, not a distracting dot. */}
      {origin && dest && <Endpoint p={origin} color="#22c55e" w={w} />}
      {origin && dest && <Endpoint p={dest} color="#ef4444" w={w} />}
    </g>
  );
}

function Endpoint({ p, color, w }: { p: [number, number]; color: string; w: number }) {
  return (
    <g>
      <circle cx={p[0]} cy={p[1]} r={w * 3} fill="none" stroke={color} strokeWidth={w * 0.8} opacity={0.9} />
      <circle cx={p[0]} cy={p[1]} r={w * 1.4} fill={color} />
    </g>
  );
}
