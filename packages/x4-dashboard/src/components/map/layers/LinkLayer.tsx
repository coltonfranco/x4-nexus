// Inter-sector links: superhighways/local highways and gates/accelerators.
//
// Highways and gates share their geometry math (overlap separation, icon trimming,
// scale-aware stroke sizing) but differ in styling and animation, so they live as
// two components in one module rather than a single forced abstraction.

import { ConnectionIcon } from "../ConnectionIcon";
import { MAP_THEME } from "../../../lib/map/constants";
import type { OverlappingPaths } from "../../../lib/map/positions";
import type { Gate, Highway, Transform, Zone } from "../../../lib/map/types";
import type { BorderTensionEntry } from "../../../lib/map/overlays/useAnalysisData";

type LinkContext = {
  zoneMap: Map<string, Zone>;
  zoneScreenPos: Map<string, [number, number]>;
  sectorCoords: Map<string, [number, number]>;
  visibleSectorIds: Set<string>;
  overlappingPaths: OverlappingPaths;
  transform: Transform;
  borderTensions?: Map<string, BorderTensionEntry>;
  setHoveredLinkId?: (id: string | null) => void;
};

export function HighwayLayer({
  highways, showHighways, showLocalHighways,
  zoneMap, zoneScreenPos, sectorCoords, visibleSectorIds, overlappingPaths, transform, borderTensions, setHoveredLinkId
}: LinkContext & { highways: Highway[]; showHighways: boolean; showLocalHighways: boolean }) {
  return (
    <>
      {highways.map((hw) => {
        const isLocal = hw.kind === "localhighway";
        if (isLocal && !showLocalHighways) return null;
        if (!isLocal && !showHighways) return null;

        // Blacklist anomalous one-off highway in Nopileos' Fortune II
        if (hw.from_zone_id === 'Zone020_Cluster_04_Sector001_macro' || hw.to_zone_id === 'Zone020_Cluster_04_Sector001_macro') {
          return null;
        }

        const z1 = zoneMap.get(hw.from_zone_id), z2 = zoneMap.get(hw.to_zone_id);
        if (!z1?.sector_id || !z2?.sector_id) return null;
        if (!visibleSectorIds.has(z1.sector_id) || !visibleSectorIds.has(z2.sector_id)) return null;

        const p1 = zoneScreenPos.get(hw.from_zone_id) ?? sectorCoords.get(z1.sector_id);
        const p2 = zoneScreenPos.get(hw.to_zone_id) ?? sectorCoords.get(z2.sector_id);
        if (!p1 || !p2) return null;

        const stroke = isLocal ? MAP_THEME.localhighway : MAP_THEME.superhighway;
        const baseScreenStroke = isLocal ? 1.0 : 2.0;
        const screenStroke = Math.max(0.5, Math.min(6, baseScreenStroke * Math.pow(transform.scale, 0.7)));
        const strokeWidth = screenStroke / transform.scale;

        const opacity = isLocal ? 0.6 : 0.8;

        const showIcons = transform.scale > 1.5 && !isLocal;
        const showAnimation = transform.scale > 2.0;
        const screenPixelSize = Math.max(8, Math.min(32, 16 * Math.pow(transform.scale, 0.6)));
        const iconSize = screenPixelSize / transform.scale;
        const dotSize = Math.max(1.5, 4 / transform.scale);
        // Endpoint dots are loud when zoomed out; fade them with distance.
        const nodeOpacity = Math.max(0.2, Math.min(0.65, transform.scale * 0.45));

        const sig = overlappingPaths.getSig(p1, p2);
        const isOverlapping = transform.scale > 3.0 && (overlappingPaths.counts.get(sig) ?? 0) > 1;

        let sp1 = p1, sp2 = p2;
        if (isOverlapping) {
          const dx_raw = p2[0] - p1[0], dy_raw = p2[1] - p1[1], d_raw = Math.max(0.1, Math.sqrt(dx_raw*dx_raw + dy_raw*dy_raw));
          const nx = -dy_raw / d_raw, ny = dx_raw / d_raw;
          const sep = strokeWidth / 2.2;
          sp1 = [p1[0] + nx * sep, p1[1] + ny * sep];
          sp2 = [p2[0] + nx * sep, p2[1] + ny * sep];
        }

        let l1 = sp1, l2 = sp2;
        if (showIcons) {
          const dx = sp2[0] - sp1[0], dy = sp2[1] - sp1[1], d = Math.sqrt(dx*dx + dy*dy);
          if (d > iconSize) {
            const r = iconSize * 0.65 / d;
            l1 = [sp1[0] + dx*r, sp1[1] + dy*r];
            l2 = [sp2[0] - dx*r, sp2[1] - dy*r];
          }
        }

        const lineLen = Math.max(10, Math.sqrt(Math.pow(l2[0]-l1[0], 2) + Math.pow(l2[1]-l1[1], 2)));

        const a = z1.sector_id.toLowerCase();
        const b = z2.sector_id.toLowerCase();
        const tension = !isLocal ? (borderTensions?.get(`${a}_${b}`) || borderTensions?.get(`${b}_${a}`)) : undefined;
        
        let finalStroke: string = stroke;
        let finalAnim: string | undefined = undefined;
        let isTension = false;
        
        if (tension) {
          isTension = true;
          if (tension.intensity >= 0.8) {
            finalStroke = "rgb(239, 68, 68)"; // Red
            finalAnim = "conflict-pulse-fast 0.6s ease-in-out infinite alternate";
          } else if (tension.intensity >= 0.5) {
            finalStroke = "rgb(239, 68, 68)"; // Red
          } else if (tension.intensity >= 0.3) {
            finalStroke = "rgb(249, 115, 22)"; // Orange
          } else {
            finalStroke = "rgb(234, 179, 8)"; // Yellow
          }
        }

        const linkId = `hw-${hw.from_zone_id}-${hw.to_zone_id}`;

        return (
          <g key={linkId}>
            <line
              x1={l1[0]} y1={l1[1]} x2={l2[0]} y2={l2[1]}
              stroke={finalStroke} strokeWidth={strokeWidth} opacity={showAnimation ? opacity * 0.2 : opacity * 0.6} />
            {showAnimation && (
              <line
                x1={l1[0]} y1={l1[1]} x2={l2[0]} y2={l2[1]}
                stroke={finalStroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={isLocal ? `6 ${lineLen}` : "3 6"} opacity={opacity * 1.5}
                style={{ animation: finalAnim }}>
                <animate attributeName="stroke-dashoffset" from="0" to={isLocal ? -lineLen : -9} dur={isLocal ? "4s" : "1.5s"} repeatCount="indefinite" />
              </line>
            )}
            {showIcons ? (
              <g style={{ animation: finalAnim }}>
                <ConnectionIcon x={p1[0]} y={p1[1]} iconPath="mapob_superhighway.png" color={finalStroke} size={iconSize} />
                <ConnectionIcon x={p2[0]} y={p2[1]} iconPath="mapob_superhighway.png" color={finalStroke} size={iconSize} />
              </g>
            ) : (
              <g style={{ animation: finalAnim }}>
                <circle cx={p1[0]} cy={p1[1]} r={dotSize} fill={finalStroke} opacity={nodeOpacity} />
                <circle cx={p2[0]} cy={p2[1]} r={dotSize} fill={finalStroke} opacity={nodeOpacity} />
              </g>
            )}
            {setHoveredLinkId && isTension && (
              <line
                x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
                stroke="transparent" strokeWidth={Math.max(12, strokeWidth * 4)}
                className="cursor-pointer"
                onPointerEnter={() => setHoveredLinkId(linkId)}
                onPointerLeave={() => setHoveredLinkId(null)}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

export function GateLayer({
  gates, showGates,
  zoneMap, zoneScreenPos, sectorCoords, visibleSectorIds, overlappingPaths, transform, borderTensions, setHoveredLinkId
}: LinkContext & { gates: Gate[]; showGates: boolean }) {
  if (!showGates) return null;
  return (
    <>
      {gates.map((g) => {
        const z1 = zoneMap.get(g.from_zone_id), z2 = zoneMap.get(g.to_zone_id);
        if (!z1?.sector_id || !z2?.sector_id || z1.sector_id === z2.sector_id) return null;
        if (!visibleSectorIds.has(z1.sector_id) || !visibleSectorIds.has(z2.sector_id)) return null;
        const p1 = zoneScreenPos.get(g.from_zone_id) ?? sectorCoords.get(z1.sector_id);
        const p2 = zoneScreenPos.get(g.to_zone_id) ?? sectorCoords.get(z2.sector_id);
        if (!p1 || !p2) return null;
        const isAccelerator = g.kind === "accelerator";
        const stroke = isAccelerator ? MAP_THEME.accelerator : MAP_THEME.gate; // Yellow for accelerator, Slate for warp gate

        const baseScreenStroke = isAccelerator ? 1.5 : 1.0;
        const screenStroke = Math.max(0.5, Math.min(6, baseScreenStroke * Math.pow(transform.scale, 0.7)));
        const strokeWidth = screenStroke / transform.scale;

        const dur = isAccelerator ? "4s" : "6s";
        const baseOpacity = isAccelerator ? 0.65 : 0.5;
        const animVals = isAccelerator ? "0.4;0.8;0.4" : "0.3;0.7;0.3";

        const showIcons = transform.scale > 1.5;
        const showAnimation = transform.scale > 2.0;
        const screenPixelSize = Math.max(10, Math.min(40, 20 * Math.pow(transform.scale, 0.6)));
        const iconSize = screenPixelSize / transform.scale;
        const dotSize = Math.max(1.5, 4 / transform.scale);
        const iconPath = isAccelerator ? "mapob_transorbital_accelerator.png" : "mapob_jumpgate.png";

        const sig = overlappingPaths.getSig(p1, p2);
        const isOverlapping = transform.scale > 3.0 && (overlappingPaths.counts.get(sig) ?? 0) > 1;

        let sp1 = p1, sp2 = p2;
        if (isOverlapping) {
          const dx_raw = p2[0] - p1[0], dy_raw = p2[1] - p1[1], d_raw = Math.max(0.1, Math.sqrt(dx_raw*dx_raw + dy_raw*dy_raw));
          const nx = -dy_raw / d_raw, ny = dx_raw / d_raw;
          const sep = strokeWidth / 2.2;
          sp1 = [p1[0] + nx * sep, p1[1] + ny * sep];
          sp2 = [p2[0] + nx * sep, p2[1] + ny * sep];
        }

        let l1 = sp1, l2 = sp2;
        if (showIcons) {
          const dx = sp2[0] - sp1[0], dy = sp2[1] - sp1[1], d = Math.sqrt(dx*dx + dy*dy);
          if (d > iconSize) {
            const r = iconSize * 0.45 / d;
            l1 = [sp1[0] + dx*r, sp1[1] + dy*r];
            l2 = [sp2[0] - dx*r, sp2[1] - dy*r];
          }
        }

        const a = z1.sector_id.toLowerCase();
        const b = z2.sector_id.toLowerCase();
        const tension = borderTensions?.get(`${a}_${b}`) || borderTensions?.get(`${b}_${a}`);
        
        let finalStroke: string = stroke;
        let finalAnim: string | undefined = undefined;
        let isTension = false;
        
        if (tension) {
          isTension = true;
          if (tension.intensity >= 0.8) {
            finalStroke = "rgb(239, 68, 68)"; // Red
            finalAnim = "conflict-pulse-fast 0.6s ease-in-out infinite alternate";
          } else if (tension.intensity >= 0.5) {
            finalStroke = "rgb(239, 68, 68)"; // Red
          } else if (tension.intensity >= 0.3) {
            finalStroke = "rgb(249, 115, 22)"; // Orange
          } else {
            finalStroke = "rgb(234, 179, 8)"; // Yellow
          }
        }

        const linkId = `gate-${g.from_zone_id}-${g.to_zone_id}`;
        
        return (
          <g key={linkId}>
            <line
              x1={l1[0]} y1={l1[1]} x2={l2[0]} y2={l2[1]}
              stroke={finalStroke} strokeWidth={strokeWidth} opacity={showAnimation ? baseOpacity : baseOpacity * 0.7}
              style={{ animation: finalAnim }}>
              {showAnimation && !finalAnim && (
                <animate attributeName="opacity" values={animVals} dur={dur} repeatCount="indefinite" />
              )}
            </line>
            {showIcons ? (
              <g style={{ animation: finalAnim }}>
                <ConnectionIcon x={p1[0]} y={p1[1]} iconPath={iconPath} color={finalStroke} size={iconSize} />
                <ConnectionIcon x={p2[0]} y={p2[1]} iconPath={iconPath} color={finalStroke} size={iconSize} />
              </g>
            ) : (
              <g style={{ animation: finalAnim }}>
                <circle cx={p1[0]} cy={p1[1]} r={dotSize} fill={finalStroke} opacity={0.6} />
                <circle cx={p2[0]} cy={p2[1]} r={dotSize} fill={finalStroke} opacity={0.6} />
              </g>
            )}
            {setHoveredLinkId && isTension && (
              <line
                x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]}
                stroke="transparent" strokeWidth={Math.max(12, strokeWidth * 4)}
                className="cursor-pointer"
                onPointerEnter={() => setHoveredLinkId(linkId)}
                onPointerLeave={() => setHoveredLinkId(null)}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
