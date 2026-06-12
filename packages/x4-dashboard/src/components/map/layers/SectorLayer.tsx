// Sector hexagons: faction-colored base, optional overlay tint, alternate-resource dots,
// a centered name label, and an optional overlay badge.

import { hexPoints } from "../../../lib/map/geometry";
import { sectorDisplayName } from "../../../lib/map/names";
import type { Cluster, FactionSummary, Sector, Transform } from "../../../lib/map/types";
import type { SectorTint } from "../../../lib/map/overlays/useAnalysisOverlay";

// 0..1 opacity → two-digit hex alpha suffix for an #rrggbb color.
function alpha(o: number): string {
  return Math.round(Math.max(0, Math.min(1, o)) * 255).toString(16).padStart(2, "0");
}

export function SectorLayer({
  visibleSectors, sectorCoords, subSectorSet, factionMap, clusterMap,
  hexSize, transform,
  selectedSectorId, hoveredSectorId, onSelect, onHover, onContext,
  sectorTint = null, sectorBadges, alternateDots, dimOthers = false,
}: {
  visibleSectors: Sector[];
  sectorCoords: Map<string, [number, number]>;
  subSectorSet: Set<string>;
  factionMap: Map<string, FactionSummary>;
  clusterMap: Map<string, Cluster>;
  hexSize: number;
  transform: Transform;
  selectedSectorId: string | null;
  hoveredSectorId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onContext?: (id: string) => void;
  sectorTint?: Map<string, SectorTint> | null;
  sectorBadges?: Map<string, string>;
  alternateDots?: Map<string, string[]>;
  dimOthers?: boolean;
}) {
  return (
    <>
      {visibleSectors.map((sector) => {
        const pos = sectorCoords.get(sector.sector_id);
        if (!pos) return null;
        const [cx, cy] = pos;
        const sidLower = sector.sector_id.toLowerCase();

        const ownerFaction = sector.owner_faction ? factionMap.get(sector.owner_faction) : null;
        const cluster = sector.cluster_id ? clusterMap.get(sector.cluster_id) : null;
        const clusterFaction = cluster?.owner_faction ? factionMap.get(cluster.owner_faction) : null;
        const factionColor = (ownerFaction ?? clusterFaction)?.color_hex ?? "#2d3748";

        const isSubSector = subSectorSet.has(sector.sector_id);
        const renderedHexSize = isSubSector ? hexSize * 0.5 : hexSize;

        const isSelected = sector.sector_id === selectedSectorId;
        const isHovered = sector.sector_id === hoveredSectorId;

        const tint = sectorTint?.get(sidLower) ?? null;
        const isDimmed = dimOthers && !tint;
        const baseFill = dimOthers 
          ? (isSelected ? "#64748b40" : "#64748b2e") 
          : (isSelected ? `${factionColor}40` : `${factionColor}2a`);

        const stroke = isSelected ? "#ffffff"
          : tint ? tint.fill
          : isDimmed ? (isHovered ? "#94a3b8" : "#64748b66")
          : isHovered ? factionColor : `${factionColor}80`;

        const badge = sectorBadges?.get(sidLower);
        const dots = alternateDots?.get(sidLower);

        const fontSize = Math.max(3, Math.min(16, (renderedHexSize * 0.28) / Math.pow(transform.scale, 0.6)));
        const dotR = Math.max(1.5, Math.min(4, (renderedHexSize * 0.085) / Math.pow(transform.scale, 0.5)));
        const dotSpacing = dotR * 2.5;

        return (
          <g key={sector.sector_id} style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onSelect(sector.sector_id === selectedSectorId ? null : sector.sector_id); }}
            onContextMenu={onContext ? (e) => { e.preventDefault(); e.stopPropagation(); onContext(sector.sector_id); } : undefined}
            onMouseEnter={() => onHover(sector.sector_id)}
            onMouseLeave={() => onHover(null)}>

            <polygon points={hexPoints(cx, cy, renderedHexSize)} fill={baseFill} />
            {tint && (
              <polygon points={hexPoints(cx, cy, renderedHexSize)} fill={`${tint.fill}${alpha(tint.opacity)}`} />
            )}
            <polygon points={hexPoints(cx, cy, renderedHexSize)}
              fill="none"
              stroke={stroke}
              strokeWidth={isSelected ? 2 : tint ? 1.6 : 1.2} />

            {badge && (
              <text x={cx} y={cy + fontSize * 2.1} textAnchor="middle"
                fontSize={fontSize * 0.8} fill="rgba(255,255,255,0.9)"
                style={{ pointerEvents: "none", fontVariantNumeric: "tabular-nums" }}>
                {badge}
              </text>
            )}

            {dots && dots.length > 0 && (
              <g transform={`translate(${cx - ((dots.length - 1) * dotSpacing) / 2},${cy + fontSize * 1.5})`}>
                {dots.map((color, i) => (
                  <circle key={i} cx={i * dotSpacing} cy={0} r={dotR}
                    fill={color} opacity={0.9} style={{ pointerEvents: "none" }} />
                ))}
              </g>
            )}

            <foreignObject
              x={cx - renderedHexSize * 1.25}
              y={cy - fontSize * 3}
              width={renderedHexSize * 2.5}
              height={fontSize * 6}
              style={{ pointerEvents: "none", userSelect: "none", overflow: "visible" }}
            >
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.85)',
                  padding: `${fontSize * 0.15}px ${fontSize * 0.4}px`,
                  borderRadius: `${fontSize * 0.3}px`,
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: `${fontSize * 0.9}px`,
                  fontWeight: 500,
                  textAlign: 'center',
                  lineHeight: 1.1,
                  boxShadow: `0 0 ${fontSize * 0.3}px rgba(0,0,0,0.5)`,
                  border: `${Math.max(1, fontSize * 0.05)}px solid rgba(148, 163, 184, 0.2)`
                }}>
                  {sectorDisplayName(sector)}
                </span>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </>
  );
}
