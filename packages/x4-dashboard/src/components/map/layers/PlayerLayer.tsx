// Player position marker — a pulsing cyan chevron rendered at the player's current
// zone (or sector centre when zone resolution is unavailable). The marker scales with
// zoom like station icons so it stays readable at every level.

import type { Transform } from "../../../lib/map/types";

const PLAYER_COLOR = "#00e5ff";
const PLAYER_GLOW = "#00e5ff66";

export function PlayerLayer({
  sectorId,
  zoneId,
  sectorCoords,
  zoneScreenPos,
  hexSize,
  transform,
}: {
  sectorId: string | null;
  zoneId: string | null;
  sectorCoords: Map<string, [number, number]>;
  zoneScreenPos: Map<string, [number, number]>;
  hexSize: number;
  transform: Transform;
}) {
  if (!sectorId && !zoneId) return null;

  // Resolve screen position: prefer zone-level precision, fall back to sector centre.
  let pos: [number, number] | undefined;
  if (zoneId) {
    pos = zoneScreenPos.get(zoneId);
  }
  if (!pos && sectorId) {
    // zoneScreenPos keys are zone ids; sectorCoords keys are sector ids — try both
    // casings for sector lookup (save-derived ids are lowercase, static keys PascalCase).
    const candidates = [sectorId, sectorId.toLowerCase()];
    for (const c of candidates) {
      const p = sectorCoords.get(c);
      if (p) { pos = p; break; }
    }
  }
  if (!pos) return null;

  const [cx, cy] = pos;
  const onScreenHexR = hexSize * transform.scale;
  // Slightly larger than a typical station icon so the player stands out.
  const screenPx = Math.min(64, Math.max(20, onScreenHexR * 0.13));
  const sizeWorld = screenPx / transform.scale;
  const r = sizeWorld * 0.45;

  return (
    <g transform={`translate(${cx},${cy})`} style={{ pointerEvents: "none" }}>
      {/* Outer glow ring */}
      <circle r={r * 0.9} fill="none" stroke={PLAYER_GLOW} strokeWidth={3 / transform.scale} opacity={0.5}>
        <animate attributeName="r" values={`${r * 0.85};${r * 1.15};${r * 0.85}`} dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0.15;0.5" dur="2s" repeatCount="indefinite" />
      </circle>

      {/* Solid inner disc — the player pip */}
      <circle r={r * 0.32} fill={PLAYER_COLOR} opacity={0.95} />

      {/* Directional chevron (upward-pointing) — gives the player a facing indicator */}
      <polygon
        points={`0,${-r * 0.85} ${-r * 0.38},${-r * 0.2} ${r * 0.38},${-r * 0.2}`}
        fill={PLAYER_COLOR}
        opacity={0.9}
      />

      {/* Central dot */}
      <circle r={r * 0.18} fill="#ffffff" opacity={0.8} />
    </g>
  );
}
