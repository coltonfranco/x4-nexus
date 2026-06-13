// Sector hexagons: faction-colored base, optional overlay tint, alternate-resource dots,
// a centered name label, and an optional overlay badge.

import { hexPoints } from "../../../lib/map/geometry";
import { MAP_THEME } from "../../../lib/map/constants";
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
  sectorTint = null, sectorBadges, sectorTooltips, alternateDots, dimOthers = false,
  showFactionLabels = false,
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
  onSelect: (id: string | null, cx?: number, cy?: number) => void;
  onHover: (id: string | null) => void;
  onContext?: (id: string, cx: number, cy: number) => void;
  sectorTint?: Map<string, SectorTint> | null;
  sectorBadges?: Map<string, string>;
  sectorTooltips?: Map<string, string>;
  alternateDots?: Map<string, string[]>;
  dimOthers?: boolean;
  showFactionLabels?: boolean;
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
        const effectiveFaction = ownerFaction ?? clusterFaction;
        const factionColor = effectiveFaction?.color_hex ?? MAP_THEME.sectorFallback;

        const isSubSector = subSectorSet.has(sector.sector_id);
        const renderedHexSize = isSubSector ? hexSize * 0.5 : hexSize;

        const isSelected = sector.sector_id === selectedSectorId;
        const isHovered = sector.sector_id === hoveredSectorId;

        const tint = sectorTint?.get(sidLower) ?? null;
        const isDimmed = dimOthers && !tint;
        const baseFill = dimOthers 
          ? (isSelected ? MAP_THEME.hexStroke : MAP_THEME.hexHover) 
          : (isSelected ? `${factionColor}40` : `${factionColor}2a`);

        const stroke = isSelected ? "#ffffff"
          : tint ? (isHovered ? "#ffffff" : tint.fill)
          : isDimmed ? (isHovered ? MAP_THEME.hexLabel : MAP_THEME.hexFill)
          : isHovered ? factionColor : `${factionColor}80`;

        const badge = sectorBadges?.get(sidLower);
        const dots = alternateDots?.get(sidLower);

        const fontSize = Math.max(3, Math.min(16, (renderedHexSize * 0.28) / Math.pow(transform.scale, 0.6)));
        const dotR = Math.max(1.5, Math.min(4, (renderedHexSize * 0.085) / Math.pow(transform.scale, 0.5)));
        const dotSpacing = dotR * 2.5;

        // Smoothly fade out the solid background box as the user zooms in (scale > 1.5)
        // so it doesn't dominate detailed station views.
        const labelBgAlpha = Math.max(0, Math.min(0.85, 0.85 * (2.2 - transform.scale))); 
        const shadowAlpha = Math.max(0, Math.min(0.5, 0.5 * (2.2 - transform.scale))); 
        const textShadow = labelBgAlpha < 0.4 ? '0px 0px 4px rgba(0,0,0,1), 0px 0px 8px rgba(0,0,0,1)' : 'none';
        
        let borderColor = `rgba(148, 163, 184, ${labelBgAlpha * 0.25})`;  // hexLabel-derived
        if (showFactionLabels && effectiveFaction?.color_hex) {
           borderColor = labelBgAlpha > 0.1 ? `${effectiveFaction.color_hex}80` : 'transparent';
        }

        return (
          <g key={sector.sector_id} style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onSelect(sector.sector_id, e.clientX, e.clientY); }}
            onContextMenu={onContext ? (e) => { e.preventDefault(); e.stopPropagation(); onContext(sector.sector_id, e.clientX, e.clientY); } : undefined}
            onMouseEnter={() => onHover(sector.sector_id)}
            onMouseLeave={() => onHover(null)}>

            <polygon points={hexPoints(cx, cy, renderedHexSize)} fill={baseFill} />
            {tint && (
              <polygon points={hexPoints(cx, cy, renderedHexSize)} fill={`${tint.fill}${alpha(tint.opacity)}`} style={tint.animate ? { animation: tint.animate } : undefined} />
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
                {sectorTooltips?.get(sidLower) && (
                  <title>{sectorTooltips.get(sidLower)}</title>
                )}
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
              y={cy - renderedHexSize * 0.85}
              width={renderedHexSize * 2.5}
              height={fontSize * 8}
              style={{ pointerEvents: "none", userSelect: "none", overflow: "visible" }}
            >
              <div style={{
                width: '100%', height: '100%',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start'
              }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  backgroundColor: `rgba(15, 23, 42, ${labelBgAlpha})`,
                  padding: `${fontSize * 0.2}px ${fontSize * 0.4}px`,
                  borderRadius: `${fontSize * 0.4}px`,
                  boxShadow: `0 0 ${fontSize * 0.3}px rgba(0,0,0,${shadowAlpha})`,
                  border: `${Math.max(1, fontSize * 0.05)}px solid ${borderColor}`,
                  gap: `${fontSize * 0.15}px`,
                  transition: 'background-color 0.1s, border-color 0.1s, box-shadow 0.1s',
                }}>
                  <span style={{
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: `${fontSize * 0.9}px`,
                    fontWeight: 600,
                    lineHeight: 1.1,
                    textAlign: 'center',
                    textShadow: textShadow,
                  }}>
                    {sectorDisplayName(sector)}
                  </span>
                  
                  {showFactionLabels && effectiveFaction && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: `${fontSize * 0.25}px`,
                    }}>
                      {effectiveFaction.icon_url && (
                        <div style={{
                          width: `${fontSize * 0.9}px`, 
                          height: `${fontSize * 0.9}px`, 
                          backgroundColor: effectiveFaction.color_hex ?? 'rgba(255,255,255,0.85)',
                          WebkitMaskImage: `url(${effectiveFaction.icon_url})`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          filter: labelBgAlpha < 0.4 ? 'drop-shadow(0 0 4px rgba(0,0,0,1))' : 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
                          transition: 'filter 0.1s'
                        }} />
                      )}
                      {transform.scale >= 0.8 && (
                        <span style={{
                          color: effectiveFaction.color_hex ?? 'rgba(255,255,255,0.7)',
                          fontSize: `${fontSize * 0.65}px`,
                          fontWeight: 500,
                          lineHeight: 1,
                          whiteSpace: 'nowrap',
                          textShadow: textShadow,
                        }}>
                          {effectiveFaction.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </foreignObject>
          </g>
        );
      })}
    </>
  );
}
