// Procedural ~10km hex "zone" grid drawn inside a sector when zoomed in close,
// mirroring X4's in-game station-placement grid. Purely cosmetic: a regular
// flat-top tiling clipped to each sector hex and culled to the visible viewport
// (the on-screen cell count stays small no matter how large the sector is).

import { hexPoints } from "../../../lib/map/geometry";
import { MAP_THEME } from "../../../lib/map/constants";
import { SQRT3 } from "../../../lib/map/constants";
import type { Cluster, FactionSummary, Sector, Transform } from "../../../lib/map/types";
import type { SectorTint } from "../../../lib/map/overlays/useAnalysisOverlay";

// Build-grid cell size, corner-to-corner ("about 10km across" per the game UI).
const GRID_KM = 10;
// Show the grid only once a sector hex is at least this many screen px in radius,
// i.e. the user has zoomed deep into a single sector.
export const GRID_MIN_SCREEN_RADIUS = 700;

export function HexBuildGridLayer({
  visibleSectors, sectorCoords, subSectorSet, factionMap, clusterMap, hexSize, zoneScaleMap, transform, viewport, sectorTint, dimOthers
}: {
  visibleSectors: Sector[];
  sectorCoords: Map<string, [number, number]>;
  subSectorSet: Set<string>;
  factionMap: Map<string, FactionSummary>;
  clusterMap: Map<string, Cluster>;
  hexSize: number;
  zoneScaleMap: Map<string, number>;
  transform: Transform;
  viewport: { w: number; h: number };
  sectorTint?: Map<string, SectorTint> | null;
  dimOthers?: boolean;
}) {
  if (!zoneScaleMap.has("__default") || viewport.w === 0) return null;
  if (hexSize * transform.scale < GRID_MIN_SCREEN_RADIUS) return null;
  const defaultScale = zoneScaleMap.get("__default")!;

  // Visible world-space rect (the grid lives inside the scaled <g>).
  const vMinX = (0 - transform.x) / transform.scale;
  const vMaxX = (viewport.w - transform.x) / transform.scale;
  const vMinY = (0 - transform.y) / transform.scale;
  const vMaxY = (viewport.h - transform.y) / transform.scale;

  const polysByStyle = new Map<string, string[]>();

  for (const sector of visibleSectors) {
    const center = sectorCoords.get(sector.sector_id);
    if (!center) continue;
    const [cx, cy] = center;
    const isSub = subSectorSet.has(sector.sector_id);
    const R = isSub ? hexSize * 0.5 : hexSize; // sector hex circumradius (world)
    // Skip sectors entirely outside the viewport.
    if (cx + R < vMinX || cx - R > vMaxX || cy + R < vMinY || cy - R > vMaxY) continue;

    const baseScale = zoneScaleMap.get(sector.sector_id) ?? defaultScale;
    const sectorScale = isSub ? baseScale * 0.5 : baseScale;
    const cellR = (GRID_KM * 1000 * sectorScale) / 2; // small-hex circumradius (world)
    if (cellR <= 0.001) continue;
    const margin = cellR * 2;

    const ownerFaction = sector.owner_faction ? factionMap.get(sector.owner_faction) : null;
    const cluster = sector.cluster_id ? clusterMap.get(sector.cluster_id) : null;
    const clusterFaction = cluster?.owner_faction ? factionMap.get(cluster.owner_faction) : null;
    const effectiveFaction = ownerFaction ?? clusterFaction;
    const factionColor = effectiveFaction?.color_hex ?? MAP_THEME.sectorFallback;

    const sidLower = sector.sector_id.toLowerCase();
    const tint = sectorTint?.get(sidLower);
    
    let zoomedOutFill = `${factionColor}3d`;
    if (tint) {
      zoomedOutFill = tint.fill;
    } else if (dimOthers) {
      zoomedOutFill = "rgba(255,255,255,0.035)";
    }

    // The grid background drops to transparent (so the space background shows), 
    // and the grid lines take the exact color and opacity of the zoomed-out background.
    const cellFill = "transparent";
    const cellStroke = zoomedOutFill;

    const styleKey = `${cellFill}|${cellStroke}`;
    if (!polysByStyle.has(styleKey)) {
      polysByStyle.set(styleKey, []);
    }
    const targetPolys = polysByStyle.get(styleKey)!;

    // Iterate only the axial cells whose centres fall in the viewport ∩ sector.
    const dxMin = Math.max(vMinX, cx - R) - cx - margin;
    const dxMax = Math.min(vMaxX, cx + R) - cx + margin;
    const dyMin = Math.max(vMinY, cy - R) - cy - margin;
    const dyMax = Math.min(vMaxY, cy + R) - cy + margin;

    const qMin = Math.floor(dxMin / (1.5 * cellR));
    const qMax = Math.ceil(dxMax / (1.5 * cellR));
    for (let q = qMin; q <= qMax; q++) {
      const px = 1.5 * cellR * q;
      const rMin = Math.floor((dyMin / cellR - (SQRT3 / 2) * q) / SQRT3);
      const rMax = Math.ceil((dyMax / cellR - (SQRT3 / 2) * q) / SQRT3);
      for (let r = rMin; r <= rMax; r++) {
        const py = cellR * ((SQRT3 / 2) * q + SQRT3 * r);
        // Clip to the flat-top sector hex (drop cells outside its bounds).
        const apx = Math.abs(px), apy = Math.abs(py);
        if (apx > R || apy > (R * SQRT3) / 2 || apy > SQRT3 * (R - apx)) continue;
        targetPolys.push(hexPoints(cx + px, cy + py, cellR));
      }
    }
  }

  if (polysByStyle.size === 0) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      {Array.from(polysByStyle.entries()).map(([styleKey, polys], gIdx) => {
        const [fill, stroke] = styleKey.split("|");
        return (
          <g key={`bg-group-${gIdx}`} fill={fill}>
            {polys.map((pts, i) => (
              <polygon key={`bz-${gIdx}-${i}`} points={pts}
                stroke={stroke} strokeWidth={1.2 / transform.scale} />
            ))}
          </g>
        );
      })}
    </g>
  );
}
