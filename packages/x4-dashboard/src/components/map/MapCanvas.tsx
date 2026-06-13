// The pannable/zoomable SVG canvas: composes the grid, link, sector, and overlay layers,
// and renders screen-space HUD bits (route tooltip, nav readout, zoom, legend).

import { type RefObject, useState } from "react";
import { X } from "lucide-react";

import { stationCategoryLabel, stationDisplayName } from "../../lib/map/stations";

import type { MapData } from "../../lib/map/useMapData";
import type { MapLayout } from "../../lib/map/useMapLayout";
import type { MapStation, Transform } from "../../lib/map/types";
import type { AnalysisOverlay } from "../../lib/map/overlays/useAnalysisOverlay";
import { HexGridLayer } from "./layers/HexGridLayer";
import { HexBuildGridLayer } from "./layers/HexBuildGridLayer";
import { GateLayer, HighwayLayer } from "./layers/LinkLayer";
import { SectorLayer } from "./layers/SectorLayer";
import { StationLayer } from "./layers/StationLayer";
import { NavLayer, RoutePathLayer } from "./layers/AnalysisLayer";
import { StationPopover } from "./StationPopover";

export type MapToggles = {
  showGates: boolean;
  showHighways: boolean;
  showLocalHighways: boolean;
  showGrid: boolean;
  showStations: boolean;
  showFactionLogos: boolean;
};

type PanZoomHandlers = {
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
};

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function MapCanvas({
  data, layout, toggles, overlay, transform, viewport, isPanning, containerRef, handlers,
  selectedSectorId, hoveredSectorId, onSelectSector, onHoverSector, onContextSector,
  navFrom, navTo, onClearNav, sectorName,
  selectedStation, onSelectStation, showFactionLabels,
}: {
  data: MapData;
  layout: MapLayout;
  toggles: MapToggles;
  overlay: AnalysisOverlay;
  transform: Transform;
  viewport: { w: number; h: number };
  isPanning: boolean;
  containerRef: RefObject<HTMLDivElement>;
  handlers: PanZoomHandlers;
  selectedSectorId: string | null;
  hoveredSectorId: string | null;
  onSelectSector: (id: string | null, mapPos?: [number, number]) => void;
  onHoverSector: (id: string | null) => void;
  onContextSector: (id: string, mapPos?: [number, number]) => void;
  navFrom: string | null;
  navTo: string | null;
  onClearNav: () => void;
  sectorName: (id: string) => string;
  selectedStation: MapStation | null;
  onSelectStation: (st: MapStation | null) => void;
  showFactionLabels?: boolean;
}) {
  const {
    sectorCoords, hexSize, zoneScaleMap, bgGrid, zoneScreenPos, overlappingPaths, zoneMap,
    visibleSectors, visibleSectorIds, subSectorSet, factionMap, clusterMap, stationScreenPos,
  } = layout;

  // In trade-routes view, hovering a buy sector shows its routes (the whole hex is the
  // target now — no tiny dot to hit).
  const hoveredMarker = hoveredSectorId
    ? overlay.routeMarkers.find((m) => m.id === hoveredSectorId.toLowerCase()) ?? null
    : null;

  // Hovered station (local to the canvas) → lightweight name/type tooltip.
  const [hoveredStation, setHoveredStation] = useState<MapStation | null>(null);
  const tooltipStation =
    hoveredStation && hoveredStation.station_id !== selectedStation?.station_id ? hoveredStation : null;
  const tooltipPos = tooltipStation ? stationScreenPos.get(tooltipStation.station_id) ?? null : null;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: "hidden", position: "relative", background: "#06060e" }}
      onWheel={handlers.onWheel} onMouseDown={handlers.onMouseDown} onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.onMouseUp} onMouseLeave={handlers.onMouseUp}
      className={isPanning ? "cursor-grabbing" : "cursor-grab"}
      onClick={() => { onSelectSector(null); onSelectStation(null); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {data.isLoading && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
          Loading map…
        </div>
      )}

      <svg width="100%" height="100%" style={{ display: "block", position: "absolute", inset: 0 }}>
        <g transform={`translate(${transform.x.toFixed(2)},${transform.y.toFixed(2)}) scale(${transform.scale.toFixed(4)})`}>

          {toggles.showGrid && <HexGridLayer cells={bgGrid} hexSize={hexSize} />}

          <HighwayLayer
            highways={data.highways}
            showHighways={toggles.showHighways}
            showLocalHighways={toggles.showLocalHighways}
            zoneMap={zoneMap} zoneScreenPos={zoneScreenPos} sectorCoords={sectorCoords}
            visibleSectorIds={visibleSectorIds} overlappingPaths={overlappingPaths} transform={transform}
          />

          <GateLayer
            gates={data.gates}
            showGates={toggles.showGates}
            zoneMap={zoneMap} zoneScreenPos={zoneScreenPos} sectorCoords={sectorCoords}
            visibleSectorIds={visibleSectorIds} overlappingPaths={overlappingPaths} transform={transform}
          />

          <SectorLayer
            visibleSectors={visibleSectors} sectorCoords={sectorCoords} subSectorSet={subSectorSet}
            factionMap={factionMap} clusterMap={clusterMap}
            hexSize={hexSize} transform={transform}
            selectedSectorId={selectedSectorId} hoveredSectorId={hoveredSectorId}
            onSelect={(id, cx, cy) => {
              let mapPos: [number, number] | undefined;
              if (cx !== undefined && cy !== undefined && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                mapPos = [(cx - rect.left - transform.x) / transform.scale, (cy - rect.top - transform.y) / transform.scale];
              }
              onSelectSector(id, mapPos);
            }}
            onHover={onHoverSector}
            onContext={(id, cx, cy) => {
              let mapPos: [number, number] | undefined;
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                mapPos = [(cx - rect.left - transform.x) / transform.scale, (cy - rect.top - transform.y) / transform.scale];
              }
              onContextSector(id, mapPos);
            }}
            sectorTint={overlay.sectorTint} sectorBadges={overlay.sectorBadges}
            alternateDots={overlay.alternateDots} dimOthers={overlay.dimOthers}
            showFactionLabels={showFactionLabels}
          />

          <HexBuildGridLayer
            visibleSectors={visibleSectors} sectorCoords={sectorCoords} subSectorSet={subSectorSet}
            hexSize={hexSize} zoneScaleMap={zoneScaleMap} transform={transform} viewport={viewport}
          />

          {toggles.showStations && (
            <StationLayer
              stations={data.stations} stationScreenPos={stationScreenPos} factionMap={factionMap}
              hexSize={hexSize} transform={transform}
              selectedStationId={selectedStation?.station_id ?? null} onSelect={onSelectStation}
              onHover={setHoveredStation}
            />
          )}

          <RoutePathLayer segments={overlay.highlightSegments} transform={transform} />
          <NavLayer segments={overlay.navSegments} origin={overlay.navOrigin} dest={overlay.navDest} transform={transform} />
        </g>
      </svg>

      {/* Route tooltip (screen-space, anchored to the hovered marker) */}
      {hoveredMarker && (
        <div style={{
          position: "absolute",
          left: hoveredMarker.coord[0] * transform.scale + transform.x + 10,
          top: hoveredMarker.coord[1] * transform.scale + transform.y + 10,
          pointerEvents: "none", zIndex: 20, maxWidth: 240,
        }} className="rounded-md border border-border bg-popover/95 px-2.5 py-2 shadow-lg backdrop-blur text-xs">
          <p className="font-semibold mb-1">Routes from {sectorName(hoveredMarker.id)}</p>
          <div className="flex flex-col gap-1">
            {hoveredMarker.routes.map((r, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-foreground">{r.wareName} → <span className="text-amber-400">{sectorName(r.sellSector)}</span></span>
                <span className="text-muted-foreground tabular-nums">
                  {compact(r.profitPerHour)} cr/hr{r.hops != null ? ` · ${r.hops} jump${r.hops === 1 ? "" : "s"}` : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground/60 mt-1">click to map the top route</p>
        </div>
      )}

      {/* Station hover tooltip (screen-space, name + faction + type). */}
      {tooltipStation && tooltipPos && (
        <div style={{
          position: "absolute",
          left: tooltipPos[0] * transform.scale + transform.x + 12,
          top: tooltipPos[1] * transform.scale + transform.y + 12,
          pointerEvents: "none", zIndex: 22, maxWidth: 220,
        }} className="rounded-md border border-border bg-popover/95 px-2.5 py-2 shadow-lg backdrop-blur text-xs">
          <p className="font-semibold leading-tight">{stationDisplayName(tooltipStation)}</p>
          <p className="text-muted-foreground mt-0.5">
            {(tooltipStation.owner_faction ? factionMap.get(tooltipStation.owner_faction)?.name : null)
              ?? tooltipStation.owner_faction ?? "Unknown"} · {stationCategoryLabel(tooltipStation.category)}
            {tooltipStation.is_hq && <span className="text-amber-400"> · HQ</span>}
          </p>
          {tooltipStation.is_under_construction && (
            <p className="text-sky-400 mt-0.5">Under construction</p>
          )}
          {tooltipStation.code && <p className="text-muted-foreground/60 mt-0.5">{tooltipStation.code}</p>}
        </div>
      )}

      {/* Station info popover (screen-space, anchored to the selected station). */}
      {selectedStation && stationScreenPos.get(selectedStation.station_id) && (
        <StationPopover
          station={selectedStation}
          x={stationScreenPos.get(selectedStation.station_id)![0] * transform.scale + transform.x}
          y={stationScreenPos.get(selectedStation.station_id)![1] * transform.scale + transform.y}
          faction={selectedStation.owner_faction ? factionMap.get(selectedStation.owner_faction) ?? null : null}
          onClose={() => onSelectStation(null)}
        />
      )}

      {/* Current Sector HUD (only visible when zoomed in) */}
      {(() => {
        if (transform.scale < 1.2 || viewport.w === 0) return null;
        const centerMapX = (viewport.w / 2 - transform.x) / transform.scale;
        const centerMapY = (viewport.h / 2 - transform.y) / transform.scale;
        
        let centerSectorId: string | null = null;
        let minDist = Infinity;
        for (const [sid, [cx, cy]] of sectorCoords.entries()) {
          const dx = cx - centerMapX;
          const dy = cy - centerMapY;
          const distSq = dx * dx + dy * dy;
          if (distSq < minDist && distSq < hexSize * hexSize * 1.5) { 
            minDist = distSq;
            centerSectorId = sid;
          }
        }

        if (!centerSectorId) return null;
        
        const sector = data.sectors.find(s => s.sector_id === centerSectorId);
        const faction = sector?.owner_faction ? factionMap.get(sector.owner_faction) : null;
        
        return (
          <div style={{ position: "absolute", top: 12, left: 12, zIndex: 10, pointerEvents: "none" }}
            className="flex flex-col gap-1 drop-shadow-md backdrop-blur-sm bg-background/30 px-3 py-2 rounded-lg border border-border/30">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Current Sector</span>
            <div className="flex items-center gap-2">
              {faction?.icon_url && toggles.showFactionLogos && (
                <div style={{
                  width: '18px', height: '18px', flexShrink: 0,
                  backgroundColor: faction.color_hex ?? 'rgba(255,255,255,0.85)',
                  WebkitMaskImage: `url(${faction.icon_url})`,
                  WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
                  filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.8))'
                }} />
              )}
              <span className="text-xl font-bold text-foreground/95 tracking-tight" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}>
                {sectorName(centerSectorId)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Navigation readout (prominent, on the map) — only once a route is plotted. */}
      {navFrom && navTo && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 15 }}
          className="rounded-lg border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-400">{sectorName(navFrom)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-semibold text-red-400">{sectorName(navTo)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-sky-400">
            {overlay.pathHops != null ? `${overlay.pathHops} jump${overlay.pathHops === 1 ? "" : "s"}` : (overlay.navSegments.length > 0 ? "0 jumps" : "no route")}
          </span>
          {overlay.pathDistanceKm != null && overlay.navSegments.length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-indigo-400">
                {overlay.pathDistanceKm.toFixed(0)} km
              </span>
            </>
          )}
          <button onClick={onClearNav} title="Clear route (Esc)"
            className="ml-1 -mr-1 flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 12, left: 12, fontSize: 11, color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(transform.scale * 100)}%
      </div>

      <div style={{ position: "absolute", bottom: 12, right: 248, display: "flex", gap: 12, alignItems: "center", fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#2dd4bf" strokeWidth="1.5" strokeDasharray="8 4" opacity="0.6" /></svg>
          Jump Gate
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#fcd34d" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.6" /></svg>
          Accelerator
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#4aaeff" strokeWidth="1.5" strokeDasharray="7 4" opacity="0.6" /></svg>
          Superhighway
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#6366f1" strokeWidth="0.8" strokeDasharray="4 4" opacity="0.6" /></svg>
          Local Highway
        </span>
      </div>
    </div>
  );
}
