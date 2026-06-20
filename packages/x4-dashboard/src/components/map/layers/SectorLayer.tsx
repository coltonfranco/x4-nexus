// Sector hexagons: faction-colored base, optional overlay tint, alternate-resource dots,
// a centered name label, and an optional overlay badge.

import { hexPoints } from "../../../lib/map/geometry";
import { MAP_THEME } from "../../../lib/map/constants";
import { sectorDisplayName } from "../../../lib/map/names";
import type {
  Cluster,
  FactionSummary,
  Sector,
  Transform,
} from "../../../lib/map/types";
import type { SectorTint } from "../../../lib/map/overlays/useAnalysisOverlay";

import { GRID_MIN_SCREEN_RADIUS } from "./HexBuildGridLayer";

export function SectorLayer({
  visibleSectors,
  sectorCoords,
  subSectorSet,
  factionMap,
  clusterMap,
  hexSize,
  transform,
  selectedSectorId,
  hoveredSectorId,
  onSelect,
  onHover,
  onContext,
  sectorTint = null,
  sectorBadges,
  sectorTooltips,
  alternateDots,
  dimOthers = false,
  showFactionLabels = false,
  showSectorNames = true,
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
  showSectorNames?: boolean;
}) {
  return (
    <>
      {visibleSectors.map((sector) => {
        const pos = sectorCoords.get(sector.sector_id);
        if (!pos) return null;
        const [cx, cy] = pos;
        const sidLower = sector.sector_id.toLowerCase();

        const ownerFaction = sector.owner_faction
          ? factionMap.get(sector.owner_faction)
          : null;
        const cluster = sector.cluster_id
          ? clusterMap.get(sector.cluster_id)
          : null;
        const clusterFaction = cluster?.owner_faction
          ? factionMap.get(cluster.owner_faction)
          : null;
        const effectiveFaction = ownerFaction ?? clusterFaction;
        const factionColor =
          effectiveFaction?.color_hex ?? MAP_THEME.sectorFallback;

        const isSubSector = subSectorSet.has(sector.sector_id);
        const renderedHexSize = isSubSector ? hexSize * 0.5 : hexSize;

        const isSelected = sector.sector_id === selectedSectorId;
        const isHovered = sector.sector_id === hoveredSectorId;

        const tint = sectorTint?.get(sidLower) ?? null;
        const isDimmed = dimOthers && !tint;

        let fill = `${factionColor}3d`;
        let stroke = `${factionColor}d9`;
        let sw = 1.4;
        let dash: string | undefined = undefined;
        let labelColor = "#cfd8e6";
        let animate: string | undefined = undefined;

        if (tint) {
          fill = tint.fill;
          stroke = tint.stroke;
          sw = tint.strokeWidth ?? sw;
          dash = tint.strokeDasharray ?? undefined;
          labelColor = tint.labelColor ?? labelColor;
          animate = tint.animate ?? undefined;
          if (tint.innerDangerBorder) {
            stroke =
              typeof tint.innerDangerBorder === "string"
                ? tint.innerDangerBorder
                : "#ef4444";
            animate = "conflict-pulse-slow 2s ease-in-out infinite alternate";
          }
        } else if (dimOthers) {
          fill = "rgba(255,255,255,0.035)";
          stroke = "rgba(255,255,255,0.12)";
          if (isDimmed) stroke = "transparent";
        } else {
          labelColor = "#eef3fa";
        }

        if (stroke === "transparent") {
          stroke = MAP_THEME.gridLine;
          sw = 0.6;
        }

        if (isSelected) {
          stroke = MAP_THEME.navHighlight; // Bright cyan
        } else if (isHovered && !tint) {
          stroke = "#ffffff";
        }

        const badge = sectorBadges?.get(sidLower);
        const dots = alternateDots?.get(sidLower);

        const showBuildGrid =
          hexSize * transform.scale >= GRID_MIN_SCREEN_RADIUS;
        if (showBuildGrid) {
          fill = "transparent";
        }

        const fontSize = Math.max(
          3,
          Math.min(
            16,
            (renderedHexSize * 0.28) / Math.pow(transform.scale, 0.6),
          ),
        );
        const dotR = Math.max(
          1.5,
          Math.min(
            4,
            (renderedHexSize * 0.085) / Math.pow(transform.scale, 0.5),
          ),
        );
        const dotSpacing = dotR * 2.5;

        const nameSize =
          sectorDisplayName(sector).length > 16 ? fontSize * 0.8 : fontSize;

        const scaledDash = dash
          ? dash
              .split(" ")
              .map((d) =>
                (Number(d) / Math.pow(transform.scale, 0.5)).toFixed(2),
              )
              .join(" ")
          : undefined;

        return (
          <g
            key={sector.sector_id}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(sector.sector_id, e.clientX, e.clientY);
            }}
            onContextMenu={
              onContext
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onContext(sector.sector_id, e.clientX, e.clientY);
                  }
                : undefined
            }
            onMouseEnter={() => onHover(sector.sector_id)}
            onMouseLeave={() => onHover(null)}
          >
            <polygon
              points={hexPoints(cx, cy, renderedHexSize)}
              fill={fill}
              stroke={stroke}
              strokeWidth={sw}
              strokeDasharray={scaledDash}
              style={animate ? { animation: animate } : undefined}
            />

            {showSectorNames && (
              <text
                x={cx}
                y={cy - 3}
                textAnchor="middle"
                fill={labelColor}
                fontSize={nameSize}
                fontWeight="600"
                stroke="rgba(5,8,14,0.85)"
                strokeWidth={2.6}
                strokeLinejoin="round"
                paintOrder="stroke"
                style={{
                  pointerEvents: "none",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {sectorDisplayName(sector)}
              </text>
            )}

            {showFactionLabels && effectiveFaction && (
              <text
                x={cx}
                y={cy + 11}
                textAnchor="middle"
                fill="rgba(220,228,242,0.65)"
                fontSize={fontSize * 0.7}
                fontWeight="500"
                stroke="rgba(5,8,14,0.8)"
                strokeWidth={2}
                strokeLinejoin="round"
                paintOrder="stroke"
                style={{
                  pointerEvents: "none",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {effectiveFaction.name}
              </text>
            )}

            {sectorTooltips?.get(sidLower) && (
              <title>{sectorTooltips.get(sidLower)}</title>
            )}

            {badge && (
              <text
                x={cx}
                y={cy + (showFactionLabels ? 24 : 13)}
                textAnchor="middle"
                fill="#e6eefb"
                fontSize={fontSize * 0.85}
                fontWeight="600"
                stroke="rgba(5,8,14,0.85)"
                strokeWidth={2.4}
                strokeLinejoin="round"
                paintOrder="stroke"
                style={{
                  pointerEvents: "none",
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {badge}
              </text>
            )}

            {dots && dots.length > 0 && (
              <g
                transform={`translate(${cx - ((dots.length - 1) * dotSpacing) / 2},${cy + (showFactionLabels ? 30 : 20)})`}
              >
                {dots.map((color, i) => (
                  <circle
                    key={i}
                    cx={i * dotSpacing}
                    cy={0}
                    r={dotR}
                    fill={color}
                    opacity={0.9}
                    style={{ pointerEvents: "none" }}
                  />
                ))}
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
