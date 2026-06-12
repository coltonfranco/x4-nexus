// The pannable/zoomable SVG canvas: composes the grid, link, sector, and overlay layers,
// and renders screen-space HUD bits (route tooltip, nav readout, zoom, legend).

import { type RefObject } from "react";
import { X } from "lucide-react";

import type { MapData } from "../../lib/map/useMapData";
import type { MapLayout } from "../../lib/map/useMapLayout";
import type { Transform } from "../../lib/map/types";
import type { AnalysisOverlay } from "../../lib/map/overlays/useAnalysisOverlay";
import { HexGridLayer } from "./layers/HexGridLayer";
import { GateLayer, HighwayLayer } from "./layers/LinkLayer";
import { SectorLayer } from "./layers/SectorLayer";
import { NavLayer, RoutePathLayer } from "./layers/AnalysisLayer";

export type MapToggles = {
  showGates: boolean;
  showHighways: boolean;
  showLocalHighways: boolean;
  showGrid: boolean;
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
  data, layout, toggles, overlay, transform, isPanning, containerRef, handlers,
  selectedSectorId, hoveredSectorId, onSelectSector, onHoverSector, onContextSector,
  navFrom, navTo, onClearNav, sectorName,
}: {
  data: MapData;
  layout: MapLayout;
  toggles: MapToggles;
  overlay: AnalysisOverlay;
  transform: Transform;
  isPanning: boolean;
  containerRef: RefObject<HTMLDivElement>;
  handlers: PanZoomHandlers;
  selectedSectorId: string | null;
  hoveredSectorId: string | null;
  onSelectSector: (id: string | null) => void;
  onHoverSector: (id: string | null) => void;
  onContextSector: (id: string) => void;
  navFrom: string | null;
  navTo: string | null;
  onClearNav: () => void;
  sectorName: (id: string) => string;
}) {
  const {
    sectorCoords, hexSize, bgGrid, zoneScreenPos, overlappingPaths, zoneMap,
    visibleSectors, visibleSectorIds, subSectorSet, factionMap, clusterMap,
  } = layout;

  // In trade-routes view, hovering a buy sector shows its routes (the whole hex is the
  // target now — no tiny dot to hit).
  const hoveredMarker = hoveredSectorId
    ? overlay.routeMarkers.find((m) => m.id === hoveredSectorId.toLowerCase()) ?? null
    : null;

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, overflow: "hidden", position: "relative", background: "#06060e" }}
      onWheel={handlers.onWheel} onMouseDown={handlers.onMouseDown} onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.onMouseUp} onMouseLeave={handlers.onMouseUp}
      className={isPanning ? "cursor-grabbing" : "cursor-grab"}
      onClick={() => onSelectSector(null)}
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
            onSelect={onSelectSector} onHover={onHoverSector} onContext={onContextSector}
            sectorTint={overlay.sectorTint} sectorBadges={overlay.sectorBadges}
            alternateDots={overlay.alternateDots} dimOthers={overlay.dimOthers}
          />

          <RoutePathLayer points={overlay.highlightPath} transform={transform} />
          <NavLayer points={overlay.pathPoints} origin={overlay.navOrigin} dest={overlay.navDest} transform={transform} />
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

      {/* Navigation readout (prominent, on the map) — only once a route is plotted. */}
      {navFrom && navTo && (
        <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 15 }}
          className="rounded-lg border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-400">{sectorName(navFrom)}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-semibold text-red-400">{sectorName(navTo)}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-sky-400">
            {overlay.pathHops != null ? `${overlay.pathHops} jump${overlay.pathHops === 1 ? "" : "s"}` : "no route"}
          </span>
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
