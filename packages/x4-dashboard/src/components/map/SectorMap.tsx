import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useSectorPanZoom, type SectorBounds } from "../../lib/map/useSectorPanZoom";
import type { MapStation, Sector, FactionSummary, Zone, Gate, Highway } from "../../lib/map/types";
import { sectorDisplayName } from "../../lib/map/names";
import { stationCategoryLabel, stationDisplayName } from "../../lib/map/stations";
import { hexPoints } from "../../lib/map/geometry";
import { StationPopover } from "./StationPopover";
import { StationMapIcon } from "./StationMapIcon";
import { ConnectionIcon } from "./ConnectionIcon";

const HEX_R = 5000;
const HEX_H = HEX_R * Math.sqrt(3);
const HEX_W = 3 * HEX_R;
const hexPatternPath = `M 0 0 L ${HEX_R/2} ${HEX_H/2} L ${1.5*HEX_R} ${HEX_H/2} L ${2*HEX_R} 0 L ${3*HEX_R} 0 M 0 ${HEX_H} L ${HEX_R/2} ${HEX_H/2} M ${1.5*HEX_R} ${HEX_H/2} L ${2*HEX_R} ${HEX_H}`;

export function SectorMap({ sectorId }: { sectorId: string }) {
  const { data: sector, isLoading: sectorLoading } = useQuery<Sector>({
    queryKey: ["map", "sectors", sectorId],
    queryFn: () => apiGet<Sector>(`/api/v1/map/sectors/${sectorId}`),
  });

  const { data: stations, isLoading: stationsLoading } = useQuery<MapStation[]>({
    queryKey: ["map", "stations", { sectorId }],
    queryFn: () => apiGet<MapStation[]>(`/api/v1/map/stations?sector_id=${sectorId.toLowerCase()}`),
  });

  const { data: allSectors } = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => apiGet<Sector[]>("/api/v1/map/sectors?limit=2000"),
  });

  const { data: allZones } = useQuery<Zone[]>({
    queryKey: ["map-zones"],
    queryFn: () => apiGet<Zone[]>("/api/v1/map/zones?limit=5000"),
  });

  const { data: zones } = useQuery<Zone[]>({
    queryKey: ["map", "zones", { sectorId }],
    queryFn: () => apiGet<Zone[]>(`/api/v1/map/sectors/${sectorId}/zones`),
  });

  const { data: gates } = useQuery<Gate[]>({
    queryKey: ["map", "gates"],
    queryFn: () => apiGet<Gate[]>("/api/v1/map/gates?limit=5000"),
  });

  const { data: highways } = useQuery<Highway[]>({
    queryKey: ["map", "superhighways"],
    queryFn: () => apiGet<Highway[]>("/api/v1/map/superhighways?limit=5000"),
  });

  const { data: factions } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => apiGet<FactionSummary[]>("/api/v1/factions"),
  });

  const factionMap = useMemo(() => {
    const map = new Map<string, FactionSummary>();
    if (factions) {
      for (const f of factions) map.set(f.faction_id, f);
    }
    return map;
  }, [factions]);

  const sectorConnections = useMemo(() => {
    if (!zones || !gates || !highways) return [];
    
    type ConnectionDirection = 'out' | 'in' | 'both';
    const localGateZones = new Map<string, { kind: string, type: 'gate' | 'highway', direction: ConnectionDirection, x: number, z: number, id: string, targetZoneId: string }>();

    for (const z of zones) {
      const gate = gates.find(g => g.from_zone_id === z.zone_id || g.to_zone_id === z.zone_id);
      if (gate) {
        const targetZoneId = gate.from_zone_id === z.zone_id ? gate.to_zone_id : gate.from_zone_id;
        localGateZones.set(z.zone_id, { kind: gate.kind ?? "", type: 'gate', direction: 'both', x: z.x ?? 0, z: z.z ?? 0, id: z.zone_id, targetZoneId });
        continue;
      }
      const hw = highways.find(h => (h.from_zone_id === z.zone_id || h.to_zone_id === z.zone_id) && h.kind !== "localhighway");
      if (hw) {
        const isOutbound = hw.from_zone_id === z.zone_id;
        const targetZoneId = isOutbound ? hw.to_zone_id : hw.from_zone_id;
        localGateZones.set(z.zone_id, { kind: hw.kind ?? "", type: 'highway', direction: isOutbound ? 'out' : 'in', x: z.x ?? 0, z: z.z ?? 0, id: z.zone_id, targetZoneId });
      }
    }
    return Array.from(localGateZones.values());
  }, [zones, gates, highways]);

  const localPaths = useMemo(() => {
    if (!zones || !highways) return [];
    const paths = [];
    for (const hw of highways) {
      if (hw.kind !== "localhighway") continue;
      const z1 = zones.find(z => z.zone_id === hw.from_zone_id);
      const z2 = zones.find(z => z.zone_id === hw.to_zone_id);
      if (z1 && z2 && z1.x != null && z1.z != null && z2.x != null && z2.z != null) {
        paths.push({ id: `${hw.from_zone_id}-${hw.to_zone_id}`, x1: z1.x, y1: -z1.z, x2: z2.x, y2: -z2.z });
      }
    }
    return paths;
  }, [zones, highways]);

  const sectorRadius = useMemo(() => {
    let maxR = 20000;
    for (const st of stations ?? []) {
      const d = Math.sqrt((st.x ?? 0)**2 + (st.z ?? 0)**2);
      if (d > maxR) maxR = d;
    }
    return maxR + 25000;
  }, [stations]);

  // Calculate bounding box for the pan/zoom camera
  const bounds = useMemo<SectorBounds | null>(() => {
    if (!stations || stations.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    
    const points = stations.map(s => [s.x ?? 0, s.z ?? 0]);
    for (const conn of sectorConnections) {
      points.push([conn.x, conn.z]);
    }

    for (const [sx, sz] of points) {
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sz < minZ) minZ = sz;
      if (sz > maxZ) maxZ = sz;
    }
    // Add a minimum bounds if there's only 1 station or they are all perfectly aligned
    if (maxX - minX < 10000) { minX -= 50000; maxX += 50000; }
    if (maxZ - minZ < 10000) { minZ -= 50000; maxZ += 50000; }
    return { minX, maxX, minZ, maxZ };
  }, [stations, sectorConnections]);

  const panZoom = useSectorPanZoom(bounds);
  const { transform, handlers, containerRef, isPanning } = panZoom;

  const [hoveredStation, setHoveredStation] = useState<MapStation | null>(null);
  const [selectedStation, setSelectedStation] = useState<MapStation | null>(null);
  const [hoveredGate, setHoveredGate] = useState<{ x: number, z: number, label: string } | null>(null);

  if (sectorLoading || stationsLoading) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[#06060e] text-muted-foreground text-sm">
        Loading Sector...
      </div>
    );
  }

  if (!sector) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[#06060e] text-red-400 text-sm">
        Failed to load sector.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: "hidden", position: "relative", background: "#06060e", width: '100%', height: '100%' }}
      onWheel={handlers.onWheel} onMouseDown={handlers.onMouseDown} onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.onMouseUp} onMouseLeave={handlers.onMouseUp}
      className={isPanning ? "cursor-grabbing" : "cursor-grab"}
      onClick={() => setSelectedStation(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <svg width="100%" height="100%">
          <defs>
            <pattern id="hex-grid" width={HEX_W} height={HEX_H} patternUnits="userSpaceOnUse"
                     patternTransform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
               <path d={hexPatternPath} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1.5 / transform.scale} />
            </pattern>
            <linearGradient id="fadePath" x1="0" y1="0" x2="0" y2="-30000" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.7" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)" />
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
            {/* Sector Boundary */}
            <polygon points={hexPoints(0, 0, sectorRadius)} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" strokeWidth={3 / transform.scale} />
            
            {/* Local Paths */}
            {localPaths.map((p) => {
              const baseScreenStroke = 1.5;
              const screenStroke = Math.max(0.5, Math.min(6, baseScreenStroke * Math.pow(transform.scale, 0.7)));
              const strokeWidth = screenStroke / transform.scale;
              return (
                <line key={p.id} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
                      stroke="#6366f1" strokeWidth={strokeWidth} opacity={0.6} />
              );
            })}
          </g>
        </svg>
      </div>

      <svg width="100%" height="100%" style={{ display: "block", position: "absolute", inset: 0 }}>
        <g transform={`translate(${transform.x.toFixed(2)},${transform.y.toFixed(2)}) scale(${transform.scale.toFixed(6)})`}>
          
          {/* Coordinate Center Crosshair */}
          <g transform="translate(0,0)" opacity={0.1}>
             <circle r={2000} fill="none" stroke="white" strokeWidth={2 / transform.scale} />
             <line x1={-5000} y1={0} x2={5000} y2={0} stroke="white" strokeWidth={2 / transform.scale} />
             <line x1={0} y1={-5000} x2={0} y2={5000} stroke="white" strokeWidth={2 / transform.scale} />
          </g>

          {stations?.map((st) => {
            const cx = st.x ?? 0;
            const cy = -(st.z ?? 0); // X4 Z-axis maps to Screen Y (inverted)
            
            // Icon sizing scaling based on zoom, but constrained to reasonable screen pixel sizes
            const screenPx = Math.max(20, Math.min(48, transform.scale * 30000));
            const renderedSize = (screenPx / transform.scale) * (st.is_hq ? 1.3 : 1);
            
            const faction = st.owner_faction ? factionMap.get(st.owner_faction) : null;
            const color = st.is_hq ? "#fcd34d" : (faction?.color_hex ?? "#94a3b8");
            const isSelected = selectedStation?.station_id === st.station_id;

            return (
              <g key={st.station_id} transform={`translate(${cx}, ${cy})`}
                 style={{ cursor: "pointer" }}
                 onMouseEnter={() => setHoveredStation(st)}
                 onMouseLeave={() => setHoveredStation(null)}
                 onClick={(e) => { e.stopPropagation(); setSelectedStation(st); }}>
                
                {/* Invisible hit target for easier hovering */}
                <circle r={renderedSize * 1.5} fill="transparent" />

                {isSelected && (
                  <circle r={renderedSize * 0.72} fill="none" stroke="#ffffff" strokeWidth={1.5 / transform.scale} />
                )}
                {st.is_player_owned && !st.is_hq && (
                  <circle r={renderedSize * 0.6} fill="none" stroke="#ffffff" strokeWidth={0.8 / transform.scale} opacity={0.8} />
                )}

                <StationMapIcon station={st} color={color} sizeWorld={renderedSize} />

                {transform.scale > 0.0002 && (
                  <text y={renderedSize * 0.7} textAnchor="middle" fill="white" opacity={0.9}
                    fontSize={11 / transform.scale} 
                    stroke="rgba(0,0,0,0.9)" strokeWidth={3 / transform.scale} paintOrder="stroke fill"
                    style={{ pointerEvents: "none", fontWeight: 500, letterSpacing: 0.5 / transform.scale }}>
                    {stationDisplayName(st)}
                  </text>
                )}
              </g>
            );
          })}

          {sectorConnections.map((conn) => {
            const cx = conn.x;
            const cy = -conn.z;
            
            const screenPx = Math.max(20, Math.min(48, transform.scale * 30000));
            const renderedSize = screenPx / transform.scale;
            
            const isAccelerator = conn.kind === "accelerator";
            const isHighway = conn.type === "highway";
            
            const stroke = isHighway ? "#4aaeff" : (isAccelerator ? "#fcd34d" : "#64748b");
            const iconPath = isHighway ? "mapob_superhighway.png" 
                           : (isAccelerator ? "mapob_transorbital_accelerator.png" : "mapob_jumpgate.png");

            let angle = 0;
            let targetSectorName = "Unknown Sector";
            if (allZones && allSectors && sector) {
               const targetZone = allZones.find(z => z.zone_id === conn.targetZoneId);
               if (targetZone) {
                 const targetSector = allSectors.find(s => s.sector_id === targetZone.sector_id);
                 if (targetSector) {
                   targetSectorName = sectorDisplayName(targetSector);
                   const dx = (targetSector.qx ?? 0) - (sector.qx ?? 0);
                   const dy = -(targetSector.qz ?? 0) - -(sector.qz ?? 0); // invert Z to match screen Y
                   if (dx !== 0 || dy !== 0) {
                     angle = Math.atan2(dy, dx) * 180 / Math.PI + 90; 
                   }
                 }
               }
            }

            let hoverLabel = `Jump to ${targetSectorName}`;
            if (conn.type === 'highway') {
              hoverLabel = conn.direction === 'out' ? `Enter Superhighway to ${targetSectorName}` : `Exit from ${targetSectorName}`;
            }

            return (
              <g key={conn.id} transform={`translate(${cx}, ${cy})`} style={{ cursor: "pointer", color: stroke }}
                 onMouseEnter={() => setHoveredGate({ x: cx, z: cy, label: hoverLabel })}
                 onMouseLeave={() => setHoveredGate(null)}>
                <circle r={renderedSize * 1.5} fill="transparent" />
                <g transform={`rotate(${angle})`}>
                  <line x1={0} y1={0} x2={0} y2={-30000} stroke="url(#fadePath)" strokeWidth={4 / transform.scale} />
                  <g transform={conn.type === 'highway' && conn.direction === 'in' ? "rotate(180)" : undefined}>
                    <ConnectionIcon x={0} y={0} iconPath={iconPath} color={stroke} size={renderedSize} />
                  </g>
                </g>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Screen-space Overlays */}
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10, pointerEvents: "none" }}
           className="flex flex-col gap-1 drop-shadow-md">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Local Sector View</span>
        <span className="text-2xl font-bold text-foreground/90" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>
          {sectorDisplayName(sector)}
        </span>
      </div>

      <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 11, color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums" }}>
        Scale: {(transform.scale * 1000).toFixed(2)}x
      </div>

      {hoveredGate && (
        <div style={{
          position: "absolute",
          left: hoveredGate.x * transform.scale + transform.x + 16,
          top: hoveredGate.z * transform.scale + transform.y + 16,
          pointerEvents: "none", zIndex: 22, maxWidth: 220,
        }} className="rounded-md border border-border bg-popover/95 px-2 py-1.5 shadow-lg backdrop-blur text-xs">
          <p className="font-semibold leading-tight">{hoveredGate.label}</p>
        </div>
      )}

      {hoveredStation && hoveredStation.station_id !== selectedStation?.station_id && (
        <div style={{
          position: "absolute",
          left: (hoveredStation.x ?? 0) * transform.scale + transform.x + 16,
          top: -(hoveredStation.z ?? 0) * transform.scale + transform.y + 16,
          pointerEvents: "none", zIndex: 22, maxWidth: 220,
        }} className="rounded-md border border-border bg-popover/95 px-2.5 py-2 shadow-lg backdrop-blur text-xs">
          <p className="font-semibold leading-tight">{stationDisplayName(hoveredStation)}</p>
          <p className="text-muted-foreground mt-0.5">
            {hoveredStation.owner_faction ? factionMap.get(hoveredStation.owner_faction)?.name ?? hoveredStation.owner_faction : "Unknown"} · {stationCategoryLabel(hoveredStation.category)}
            {hoveredStation.is_hq && <span className="text-amber-400"> · HQ</span>}
          </p>
          {hoveredStation.is_under_construction && (
            <p className="text-sky-400 mt-0.5">Under construction</p>
          )}
          {hoveredStation.code && <p className="text-muted-foreground/60 mt-0.5">{hoveredStation.code}</p>}
        </div>
      )}

      {selectedStation && (
        <StationPopover
          station={selectedStation}
          x={(selectedStation.x ?? 0) * transform.scale + transform.x}
          y={-(selectedStation.z ?? 0) * transform.scale + transform.y}
          faction={selectedStation.owner_faction ? factionMap.get(selectedStation.owner_faction) ?? null : null}
          onClose={() => setSelectedStation(null)}
        />
      )}
    </div>
  );
}
