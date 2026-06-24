// The pannable/zoomable SVG canvas: composes the grid, link, sector, and overlay layers,
// and renders screen-space HUD bits (route tooltip, nav readout, zoom, legend).

import { type RefObject, useState, Fragment } from "react";
import { X } from "lucide-react";

import {
  stationCategoryLabel,
  stationDisplayName,
} from "../../lib/map/stations";
import { RESOURCE_COLORS } from "../../lib/map/constants";

import type { MapData } from "../../lib/map/useMapData";
import type { MapLayout } from "../../lib/map/useMapLayout";
import type { MapStation, Transform, Sector } from "../../lib/map/types";
import type { AnalysisOverlay } from "../../lib/map/overlays/useAnalysisOverlay";
import { HexGridLayer } from "./layers/HexGridLayer";
import { HexBuildGridLayer } from "./layers/HexBuildGridLayer";
import { GateLayer, HighwayLayer } from "./layers/LinkLayer";
import { SectorLayer } from "./layers/SectorLayer";
import { StationLayer } from "./layers/StationLayer";
import { PlayerLayer } from "./layers/PlayerLayer";
import { NavLayer } from "./layers/AnalysisLayer";
import { StationPopover } from "./StationPopover";
import { Currency } from "../Currency";
import { PageLoaderPreset } from "../PageLoader";

export type MapToggles = {
  showGates: boolean;
  showHighways: boolean;
  showLocalHighways: boolean;
  showGrid: boolean;
  showStations: boolean;
  showFactionLogos: boolean;
  showSectorNames: boolean;
  showPlayer: boolean;
  bgStyle: "nebula" | "starfield" | "flat";
};

type PanZoomHandlers = {
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
};

export function MapCanvas({
  data,
  layout,
  toggles,
  overlay,
  transform,
  viewport,
  isPanning,
  containerRef,
  handlers,
  selectedSectorId,
  hoveredSectorId,
  onSelectSector,
  onHoverSector,
  onContextSector,
  navFrom,
  navTo,
  onClearNav,
  sectorName,
  selectedStation,
  onSelectStation,
  showFactionLabels,
  playerSectorId,
  playerZoneId,
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
  playerSectorId?: string | null;
  playerZoneId?: string | null;
}) {
  const {
    sectorCoords,
    hexSize,
    zoneScaleMap,
    bgGrid,
    zoneScreenPos,
    overlappingPaths,
    zoneMap,
    visibleSectors,
    visibleSectorIds,
    subSectorSet,
    factionMap,
    clusterMap,
    stationScreenPos,
  } = layout;

  // In trade-routes view, hovering a buy sector shows its routes (the whole hex is the
  // target now — no tiny dot to hit).
  const hoveredMarker = hoveredSectorId
    ? (overlay.routeMarkers.find(
        (m) => m.id === hoveredSectorId.toLowerCase(),
      ) ?? null)
    : null;

  // Hovered station (local to the canvas) → lightweight name/type tooltip.
  const [hoveredStation, setHoveredStation] = useState<MapStation | null>(null);
  const tooltipStation =
    hoveredStation && hoveredStation.station_id !== selectedStation?.station_id
      ? hoveredStation
      : null;
  const tooltipPos = tooltipStation
    ? (stationScreenPos.get(tooltipStation.station_id) ?? null)
    : null;

  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: "hidden",
        position: "relative",
        background:
          "radial-gradient(120% 120% at 50% 0%, #0c1322 0%, #070b14 55%, #05070e 100%)",
      }}
      onWheel={handlers.onWheel}
      onMouseDown={handlers.onMouseDown}
      onMouseMove={handlers.onMouseMove}
      onMouseUp={handlers.onMouseUp}
      onMouseLeave={handlers.onMouseUp}
      className={isPanning ? "cursor-grabbing" : "cursor-grab"}
      onClick={() => {
        onSelectSector(null);
        onSelectStation(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {data.isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 50,
            backgroundColor: "#06060e",
          }}
        >
          <PageLoaderPreset preset="map" />
        </div>
      )}

      {toggles.bgStyle === "nebula" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            background:
              "radial-gradient(40% 40% at 18% 70%, rgba(125,143,171,0.10), transparent 70%), radial-gradient(38% 38% at 50% 22%, rgba(59,130,212,0.10), transparent 70%), radial-gradient(34% 40% at 82% 38%, rgba(189,58,158,0.09), transparent 70%), radial-gradient(30% 36% at 78% 80%, rgba(155,108,240,0.07), transparent 70%), radial-gradient(30% 30% at 30% 28%, rgba(39,179,192,0.06), transparent 70%)",
          }}
        />
      )}

      {toggles.bgStyle !== "flat" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "200%",
              height: "200%",
              left: "-50%",
              top: "-50%",
              transform: `translate(${transform.x * 0.03}px, ${transform.y * 0.03}px)`,
              backgroundImage: `radial-gradient(1px 1px at 10% 10%, rgba(205,214,236,0.3) 100%, transparent), radial-gradient(1px 1px at 25% 40%, rgba(205,214,236,0.3) 100%, transparent), radial-gradient(1.5px 1.5px at 40% 80%, rgba(205,214,236,0.2) 100%, transparent), radial-gradient(1px 1px at 60% 20%, rgba(205,214,236,0.3) 100%, transparent), radial-gradient(1px 1px at 80% 60%, rgba(205,214,236,0.2) 100%, transparent), radial-gradient(1.5px 1.5px at 90% 90%, rgba(205,214,236,0.4) 100%, transparent)`,
              backgroundSize: "250px 250px",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: "200%",
              height: "200%",
              left: "-50%",
              top: "-50%",
              transform: `translate(${transform.x * 0.08}px, ${transform.y * 0.08}px)`,
              backgroundImage: `radial-gradient(1.5px 1.5px at 15% 75%, rgba(205,214,236,0.6) 100%, transparent), radial-gradient(1.5px 1.5px at 50% 50%, rgba(205,214,236,0.3) 100%, transparent), radial-gradient(1px 1px at 85% 35%, rgba(205,214,236,0.5) 100%, transparent)`,
              backgroundSize: "400px 400px",
            }}
          />
        </div>
      )}

      <svg
        width="100%"
        height="100%"
        style={{ display: "block", position: "absolute", inset: 0 }}
      >
        <g
          transform={`translate(${transform.x.toFixed(2)},${transform.y.toFixed(2)}) scale(${transform.scale.toFixed(4)})`}
        >
          {toggles.showGrid && (
            <HexGridLayer cells={bgGrid} hexSize={hexSize} />
          )}

          <HexBuildGridLayer
            visibleSectors={visibleSectors}
            sectorCoords={sectorCoords}
            subSectorSet={subSectorSet}
            factionMap={layout.factionMap}
            clusterMap={layout.clusterMap}
            sectorTint={overlay.sectorTint}
            dimOthers={overlay.dimOthers}
            hexSize={hexSize}
            zoneScaleMap={zoneScaleMap}
            transform={transform}
            viewport={viewport}
          />

          <SectorLayer
            visibleSectors={visibleSectors}
            sectorCoords={sectorCoords}
            subSectorSet={subSectorSet}
            factionMap={factionMap}
            clusterMap={clusterMap}
            hexSize={hexSize}
            transform={transform}
            selectedSectorId={selectedSectorId}
            hoveredSectorId={hoveredSectorId}
            onSelect={(id, cx, cy) => {
              let mapPos: [number, number] | undefined;
              if (
                cx !== undefined &&
                cy !== undefined &&
                containerRef.current
              ) {
                const rect = containerRef.current.getBoundingClientRect();
                mapPos = [
                  (cx - rect.left - transform.x) / transform.scale,
                  (cy - rect.top - transform.y) / transform.scale,
                ];
              }
              onSelectSector(id, mapPos);
            }}
            onHover={onHoverSector}
            onContext={(id, cx, cy) => {
              let mapPos: [number, number] | undefined;
              if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                mapPos = [
                  (cx - rect.left - transform.x) / transform.scale,
                  (cy - rect.top - transform.y) / transform.scale,
                ];
              }
              onContextSector(id, mapPos);
            }}
            sectorTint={overlay.sectorTint}
            sectorBadges={overlay.sectorBadges}
            sectorTooltips={overlay.sectorTooltips}
            alternateDots={overlay.alternateDots}
            dimOthers={overlay.dimOthers}
            showFactionLabels={showFactionLabels}
            showSectorNames={toggles.showSectorNames}
          />

          <HighwayLayer
            highways={data.highways}
            showHighways={toggles.showHighways}
            showLocalHighways={toggles.showLocalHighways}
            zoneMap={zoneMap}
            zoneScreenPos={zoneScreenPos}
            sectorCoords={sectorCoords}
            visibleSectorIds={visibleSectorIds}
            overlappingPaths={overlappingPaths}
            transform={transform}
            borderTensions={overlay.borderTensions}
            setHoveredLinkId={setHoveredLinkId}
          />

          <GateLayer
            gates={data.gates}
            showGates={toggles.showGates}
            zoneMap={zoneMap}
            zoneScreenPos={zoneScreenPos}
            sectorCoords={sectorCoords}
            visibleSectorIds={visibleSectorIds}
            overlappingPaths={overlappingPaths}
            transform={transform}
            borderTensions={overlay.borderTensions}
            setHoveredLinkId={setHoveredLinkId}
          />

          {toggles.showStations && (
            <StationLayer
              stations={data.stations}
              stationScreenPos={stationScreenPos}
              factionMap={factionMap}
              hexSize={hexSize}
              transform={transform}
              selectedStationId={selectedStation?.station_id ?? null}
              onSelect={onSelectStation}
              onHover={setHoveredStation}
            />
          )}

          {toggles.showPlayer && (
            <PlayerLayer
              sectorId={playerSectorId ?? null}
              zoneId={playerZoneId ?? null}
              sectorCoords={sectorCoords}
              zoneScreenPos={zoneScreenPos}
              hexSize={hexSize}
              transform={transform}
            />
          )}

          <NavLayer
            segments={overlay.navSegments}
            origin={overlay.navOrigin}
            dest={overlay.navDest}
            transform={transform}
          />
        </g>
      </svg>

      {/* Route tooltip (screen-space, anchored to the hovered marker) */}
      {hoveredMarker && (
        <div
          style={{
            position: "absolute",
            left: hoveredMarker.coord[0] * transform.scale + transform.x + 10,
            top: hoveredMarker.coord[1] * transform.scale + transform.y + 10,
            pointerEvents: "none",
            zIndex: 20,
            maxWidth: 240,
          }}
          className="rounded-md border border-border bg-popover/95 px-2.5 py-2 shadow-lg backdrop-blur text-xs"
        >
          <p className="font-semibold mb-1">
            Routes from {sectorName(hoveredMarker.id)}
          </p>
          <div className="flex flex-col gap-1">
            {hoveredMarker.routes.map((r, i) => (
              <div key={i} className="flex flex-col">
                <span className="text-foreground">
                  {r.wareName} →{" "}
                  <span className="text-amber-400">
                    {sectorName(r.sellSector)}
                  </span>
                </span>
                <span className="text-muted-foreground tabular-nums flex items-center gap-1">
                  <Currency
                    value={r.profitPerHour}
                    abbreviate
                    className="text-muted-foreground"
                  />{" "}
                  /hr
                  {r.hops != null
                    ? ` · ${r.hops} jump${r.hops === 1 ? "" : "s"}`
                    : ""}
                </span>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground/60 mt-1">
            click to map the top route
          </p>
        </div>
      )}

      {/* Station hover tooltip (screen-space, name + faction + type). */}
      {tooltipStation && tooltipPos && (
        <div
          style={{
            position: "absolute",
            left: tooltipPos[0] * transform.scale + transform.x + 12,
            top: tooltipPos[1] * transform.scale + transform.y + 12,
            pointerEvents: "none",
            zIndex: 22,
            maxWidth: 220,
          }}
          className="rounded-md border border-border bg-popover/95 px-2.5 py-2 shadow-lg backdrop-blur text-xs"
        >
          <p className="font-semibold leading-tight">
            {stationDisplayName(tooltipStation)}
          </p>
          <p className="text-muted-foreground mt-0.5">
            {(tooltipStation.owner_faction
              ? factionMap.get(tooltipStation.owner_faction)?.name
              : null) ??
              tooltipStation.owner_faction ??
              "Unknown"}{" "}
            · {stationCategoryLabel(tooltipStation.category)}
            {tooltipStation.is_hq && (
              <span className="text-amber-400"> · HQ</span>
            )}
          </p>
          {tooltipStation.is_under_construction && (
            <p className="text-sky-400 mt-0.5">Under construction</p>
          )}
          {tooltipStation.code && (
            <p className="text-muted-foreground/60 mt-0.5">
              {tooltipStation.code}
            </p>
          )}
        </div>
      )}

      {/* Sector hover tooltip (screen-space, conflict or forces). */}
      {hoveredSectorId &&
        (overlay.sectorConflicts?.has(hoveredSectorId.toLowerCase()) ||
          overlay.sectorForces?.has(hoveredSectorId.toLowerCase())) &&
        (() => {
          const hid = hoveredSectorId.toLowerCase();
          const conflict = overlay.sectorConflicts?.get(hid);
          const forces = overlay.sectorForces?.get(hid);
          const pos = layout.sectorCoords.get(hoveredSectorId);
          if (!pos) return null;

          const sectorObj = data.sectors.find(
            (s: Sector) => s.sector_id.toLowerCase() === hid,
          );
          let owner = sectorObj?.owner_faction;
          if (!owner && sectorObj?.cluster_id) {
            owner =
              layout.clusterMap.get(sectorObj.cluster_id)?.owner_faction ??
              null;
          }
          const ownerHex = owner
            ? layout.factionMap.get(owner)?.color_hex
            : undefined;

          return (
            <div
              style={{
                position: "absolute",
                left: pos[0] * transform.scale + transform.x + 12,
                top: pos[1] * transform.scale + transform.y + 12,
                pointerEvents: "none",
                zIndex: 22,
                maxWidth: 260,
              }}
              className="rounded-md border border-border bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur text-sm"
            >
              <p className="font-semibold border-b border-border/50 pb-1.5 mb-2">
                <span style={{ color: ownerHex ?? "inherit" }}>
                  {sectorName(hoveredSectorId)}
                </span>
                {conflict && (
                  <span className="text-muted-foreground font-normal ml-1 capitalize">
                    {conflict.type === "invasion"
                      ? `${conflict.invader_name} Invasion`
                      : conflict.type}
                  </span>
                )}
              </p>
              {conflict?.type === "invasion" && (
                <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
                  {conflict.invader_name} has launched an assault against{" "}
                  {conflict.sector_owner_name || "the local sector owner"}.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {forces?.sides ? (
                  forces.sides.map((side, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-1.5 border-b border-border/30 pb-2.5 last:border-0 last:pb-0 relative"
                    >
                      {i > 0 && (
                        <div className="absolute -top-[17px] left-1/2 -translate-x-1/2 bg-popover/95 px-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          VS
                        </div>
                      )}
                      {side.factions.map((f) => {
                        const faction = factionMap.get(f.faction_id);
                        return (
                          <div
                            key={f.faction_id}
                            className="flex items-center justify-between gap-4"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{
                                  backgroundColor: faction?.color_hex ?? "#888",
                                }}
                              />
                              <span>{faction?.name ?? f.faction_name}</span>
                            </div>
                            <span className="tabular-nums font-medium">
                              {f.fighter_count}
                            </span>
                          </div>
                        );
                      })}
                      {side.factions.length > 1 && (
                        <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
                          <span className="pl-4">Alliance Total</span>
                          <span className="tabular-nums">
                            {side.fighter_count}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex flex-col gap-1.5 pb-1">
                    {forces?.factions.map((f) => {
                      const faction = factionMap.get(f.faction_id);
                      return (
                        <div
                          key={f.faction_id}
                          className="flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{
                                backgroundColor: faction?.color_hex ?? "#888",
                              }}
                            />
                            <span>{faction?.name ?? f.faction_name}</span>
                          </div>
                          <span className="tabular-nums font-medium">
                            {f.fighter_count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-xs font-semibold text-muted-foreground">
                <span>Total Fighters</span>
                <span className="tabular-nums">{forces?.fighter_count}</span>
              </div>
            </div>
          );
        })()}

      {/* Border Tension tooltip */}
      {hoveredLinkId &&
        (() => {
          const parts = hoveredLinkId.split("-");
          if (parts.length !== 3) return null;
          const z1 = zoneMap.get(parts[1]);
          const z2 = zoneMap.get(parts[2]);
          if (!z1?.sector_id || !z2?.sector_id) return null;

          const a = z1.sector_id.toLowerCase();
          const b = z2.sector_id.toLowerCase();
          const tension =
            overlay.borderTensions?.get(`${a}_${b}`) ||
            overlay.borderTensions?.get(`${b}_${a}`);
          if (!tension) return null;

          const p1 =
            zoneScreenPos.get(parts[1]) ?? sectorCoords.get(z1.sector_id);
          const p2 =
            zoneScreenPos.get(parts[2]) ?? sectorCoords.get(z2.sector_id);
          if (!p1 || !p2) return null;

          const cx = (p1[0] + p2[0]) / 2;
          const cy = (p1[1] + p2[1]) / 2;

          const sA = data.sectors.find(
            (s: Sector) => s.sector_id.toLowerCase() === a,
          );
          const sB = data.sectors.find(
            (s: Sector) => s.sector_id.toLowerCase() === b,
          );

          let ownerA = sA?.owner_faction;
          if (!ownerA && sA?.cluster_id)
            ownerA =
              layout.clusterMap.get(sA.cluster_id)?.owner_faction ?? null;

          let ownerB = sB?.owner_faction;
          if (!ownerB && sB?.cluster_id)
            ownerB =
              layout.clusterMap.get(sB.cluster_id)?.owner_faction ?? null;

          const hexA = ownerA
            ? layout.factionMap.get(ownerA)?.color_hex
            : undefined;
          const hexB = ownerB
            ? layout.factionMap.get(ownerB)?.color_hex
            : undefined;

          let dotColorClass = "bg-yellow-500";
          let textColorClass = "text-yellow-500";
          let borderColorClass = "border-yellow-500/50";
          let isPulsing = false;

          if (tension.intensity >= 0.8) {
            dotColorClass = "bg-red-500";
            textColorClass = "text-red-400";
            borderColorClass = "border-red-500/50";
            isPulsing = true;
          } else if (tension.intensity >= 0.5) {
            dotColorClass = "bg-red-500";
            textColorClass = "text-red-400";
            borderColorClass = "border-red-500/50";
          } else if (tension.intensity >= 0.3) {
            dotColorClass = "bg-orange-500";
            textColorClass = "text-orange-400";
            borderColorClass = "border-orange-500/50";
          }

          const entryA = overlay.sectorForces?.get(a);
          const entryB = overlay.sectorForces?.get(b);
          const forcesA: any[] = entryA?.factions ?? tension.from_forces;
          const forcesB: any[] = entryB?.factions ?? tension.to_forces;

          return (
            <div
              style={{
                position: "absolute",
                left: cx * transform.scale + transform.x + 12,
                top: cy * transform.scale + transform.y + 12,
                pointerEvents: "none",
                zIndex: 22,
                maxWidth: 320,
              }}
              className={`rounded-md border ${borderColorClass} bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur text-sm`}
            >
              <p
                className={`font-semibold ${textColorClass} border-b border-border/50 pb-1.5 mb-2 flex items-center gap-2`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${dotColorClass} ${isPulsing ? "animate-pulse" : ""}`}
                />{" "}
                Border Tension
              </p>
              <div className="flex gap-4">
                <div className="flex-1 flex flex-col gap-1.5 border-r border-border/30 pr-4">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    <span style={{ color: hexA ?? "inherit" }}>
                      {sectorName(tension.from_sector_id)}
                    </span>
                  </p>
                  {entryA?.sides
                    ? entryA.sides.map((side: any, i: number) => (
                        <Fragment key={i}>
                          {i > 0 && (
                            <div className="text-center text-xs font-bold text-muted-foreground my-1 border-t border-border/20 pt-1">
                              vs
                            </div>
                          )}
                          {side.factions.map((f: any) => {
                            const faction = factionMap.get(f.faction_id);
                            return (
                              <div
                                key={f.faction_id}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor:
                                        faction?.color_hex ?? "#888",
                                    }}
                                  />
                                  <span>{faction?.name ?? f.faction_name}</span>
                                </div>
                                <span className="tabular-nums font-medium">
                                  {f.fighter_count}
                                </span>
                              </div>
                            );
                          })}
                          {side.factions.length > 1 && (
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground mt-0.5 pl-3.5">
                              <span className="text-xs">Alliance Total</span>
                              <span className="tabular-nums font-medium">
                                {side.fighter_count}
                              </span>
                            </div>
                          )}
                        </Fragment>
                      ))
                    : forcesA.map((f: any) => {
                        const faction = factionMap.get(f.faction_id);
                        return (
                          <div
                            key={f.faction_id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: faction?.color_hex ?? "#888",
                                }}
                              />
                              <span>
                                {faction?.name ??
                                  ("faction_name" in f
                                    ? (f as any).faction_name
                                    : f.faction_id)}
                              </span>
                            </div>
                            <span className="tabular-nums font-medium">
                              {f.fighter_count}
                            </span>
                          </div>
                        );
                      })}
                </div>
                <div className="flex-1 flex flex-col gap-1.5 pl-1">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    <span style={{ color: hexB ?? "inherit" }}>
                      {sectorName(tension.to_sector_id)}
                    </span>
                  </p>
                  {entryB?.sides
                    ? entryB.sides.map((side: any, i: number) => (
                        <Fragment key={i}>
                          {i > 0 && (
                            <div className="text-center text-xs font-bold text-muted-foreground my-1 border-t border-border/20 pt-1">
                              vs
                            </div>
                          )}
                          {side.factions.map((f: any) => {
                            const faction = factionMap.get(f.faction_id);
                            return (
                              <div
                                key={f.faction_id}
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor:
                                        faction?.color_hex ?? "#888",
                                    }}
                                  />
                                  <span>{faction?.name ?? f.faction_name}</span>
                                </div>
                                <span className="tabular-nums font-medium">
                                  {f.fighter_count}
                                </span>
                              </div>
                            );
                          })}
                          {side.factions.length > 1 && (
                            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground mt-0.5 pl-3.5">
                              <span className="text-xs">Alliance Total</span>
                              <span className="tabular-nums font-medium">
                                {side.fighter_count}
                              </span>
                            </div>
                          )}
                        </Fragment>
                      ))
                    : forcesB.map((f: any) => {
                        const faction = factionMap.get(f.faction_id);
                        return (
                          <div
                            key={f.faction_id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{
                                  backgroundColor: faction?.color_hex ?? "#888",
                                }}
                              />
                              <span>
                                {faction?.name ??
                                  ("faction_name" in f
                                    ? (f as any).faction_name
                                    : f.faction_id)}
                              </span>
                            </div>
                            <span className="tabular-nums font-medium">
                              {f.fighter_count}
                            </span>
                          </div>
                        );
                      })}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Sector hover tooltip (screen-space, resources). */}
      {hoveredSectorId &&
        overlay.sectorResources?.has(hoveredSectorId.toLowerCase()) &&
        (() => {
          const sr = overlay.sectorResources.get(
            hoveredSectorId.toLowerCase(),
          )!;
          const pos = layout.sectorCoords.get(hoveredSectorId);
          if (!pos) return null;
          return (
            <div
              style={{
                position: "absolute",
                left: pos[0] * transform.scale + transform.x + 12,
                top: pos[1] * transform.scale + transform.y + 12,
                pointerEvents: "none",
                zIndex: 22,
                minWidth: 180,
                maxWidth: 260,
              }}
              className="rounded-md border border-border bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur text-sm"
            >
              <p className="font-semibold border-b border-border/50 pb-1.5 mb-2">
                {sectorName(hoveredSectorId)}{" "}
                <span className="text-muted-foreground font-normal ml-1">
                  Resources
                </span>
              </p>
              <div className="flex flex-col gap-1.5">
                {sr.all.map((res) => {
                  const color =
                    RESOURCE_COLORS[res.ware] ?? "var(--muted-foreground)";
                  return (
                    <div
                      key={res.ware}
                      className="flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3.5 h-3.5 shrink-0"
                          style={{
                            backgroundColor: color,
                            WebkitMaskImage: `url(/static/icons/wares/ware_${res.ware === "rawscrap" ? "scrapmetal" : res.ware}.png)`,
                            WebkitMaskSize: "contain",
                            WebkitMaskRepeat: "no-repeat",
                            WebkitMaskPosition: "center",
                          }}
                        />
                        <span className="capitalize">
                          {res.ware.replace(/_/g, " ")}
                        </span>
                      </div>
                      <span className="tabular-nums font-medium text-muted-foreground">
                        {res.label}
                      </span>
                    </div>
                  );
                })}
                {overlay.sectorSunlight?.get(hoveredSectorId.toLowerCase()) && (
                  <div className="flex items-center justify-between gap-4 border-t border-border/30 pt-1.5 mt-0.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full mx-[2px]"
                        style={{ backgroundColor: RESOURCE_COLORS.sunlight }}
                      />
                      <span className="capitalize">Sunlight</span>
                    </div>
                    <span className="tabular-nums font-medium text-muted-foreground">
                      {overlay.sectorSunlight.get(
                        hoveredSectorId.toLowerCase(),
                      )}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Sector hover tooltip (screen-space, ware prices). */}
      {hoveredSectorId &&
        overlay.sectorWarePrices?.has(hoveredSectorId.toLowerCase()) &&
        (() => {
          const wp = overlay.sectorWarePrices.get(
            hoveredSectorId.toLowerCase(),
          )!;
          const pos = layout.sectorCoords.get(hoveredSectorId);
          if (!pos) return null;
          const net = wp.supply - wp.demand;
          return (
            <div
              style={{
                position: "absolute",
                left: pos[0] * transform.scale + transform.x + 12,
                top: pos[1] * transform.scale + transform.y + 12,
                pointerEvents: "none",
                zIndex: 22,
                minWidth: 200,
                maxWidth: 260,
              }}
              className="rounded-md border border-border bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur text-sm"
            >
              <p className="font-semibold border-b border-border/50 pb-1.5 mb-2">
                {sectorName(hoveredSectorId)}{" "}
                <span className="text-muted-foreground font-normal ml-1">
                  Trade
                </span>
              </p>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: "var(--success)" }}
                    />
                    <span>Supply</span>
                  </div>
                  <span className="tabular-nums font-medium">
                    {wp.supply.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: "var(--danger)" }}
                    />
                    <span>Demand</span>
                  </div>
                  <span className="tabular-nums font-medium">
                    {wp.demand.toLocaleString()}
                  </span>
                </div>
                <div className="border-t border-border/30 pt-1.5 mt-0.5 flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Net</span>
                  <span
                    className={`tabular-nums font-bold ${net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-muted-foreground"}`}
                  >
                    {net >= 0 ? "+" : ""}
                    {net.toLocaleString()}
                  </span>
                </div>
                {wp.bestBuyPrice != null && (
                  <div className="border-t border-border/30 pt-1.5 mt-0.5 flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Best buy</span>
                    <Currency value={wp.bestBuyPrice} icon={false} />
                  </div>
                )}
                {wp.bestSellPrice != null && (
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Best sell</span>
                    <Currency value={wp.bestSellPrice} icon={false} />
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Station info popover (screen-space, anchored to the selected station). */}
      {selectedStation && stationScreenPos.get(selectedStation.station_id) && (
        <StationPopover
          station={selectedStation}
          x={
            stationScreenPos.get(selectedStation.station_id)![0] *
              transform.scale +
            transform.x
          }
          y={
            stationScreenPos.get(selectedStation.station_id)![1] *
              transform.scale +
            transform.y
          }
          faction={
            selectedStation.owner_faction
              ? (factionMap.get(selectedStation.owner_faction) ?? null)
              : null
          }
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

        const sector = data.sectors.find((s) => s.sector_id === centerSectorId);
        const faction = sector?.owner_faction
          ? factionMap.get(sector.owner_faction)
          : null;

        return (
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              zIndex: 10,
              pointerEvents: "none",
            }}
            className="flex flex-col gap-1 drop-shadow-md backdrop-blur-sm bg-background/30 px-3 py-2 rounded-lg border border-border/30"
          >
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Current Sector
            </span>
            <div className="flex items-center gap-2">
              {faction?.icon_url && toggles.showFactionLogos && (
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    flexShrink: 0,
                    backgroundColor:
                      faction.color_hex ?? "rgba(255,255,255,0.85)",
                    WebkitMaskImage: `url(${faction.icon_url})`,
                    WebkitMaskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    filter: "drop-shadow(0 0 2px rgba(0,0,0,0.8))",
                  }}
                />
              )}
              <span
                className="text-xl font-bold text-foreground/95 tracking-tight"
                style={{ textShadow: "0 2px 10px rgba(0,0,0,0.8)" }}
              >
                {sectorName(centerSectorId)}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Navigation readout (prominent, on the map) — only once a route is plotted. */}
      {navFrom && navTo && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 15,
          }}
          className="rounded-lg border border-border bg-card/90 px-3 py-2 shadow-lg backdrop-blur flex items-center gap-3 text-sm"
        >
          <span className="font-semibold text-emerald-400">
            {sectorName(navFrom)}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-semibold text-red-400">
            {sectorName(navTo)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums text-sky-400">
            {overlay.pathHops != null
              ? `${overlay.pathHops} jump${overlay.pathHops === 1 ? "" : "s"}`
              : overlay.navSegments.length > 0
                ? "0 jumps"
                : "no route"}
          </span>
          {overlay.pathDistanceKm != null && overlay.navSegments.length > 0 && (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-indigo-400">
                {overlay.pathDistanceKm.toFixed(0)} km
              </span>
            </>
          )}
          <button
            onClick={onClearNav}
            title="Clear route (Esc)"
            className="ml-1 -mr-1 flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          fontSize: 11,
          color: "rgba(255,255,255,0.25)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {Math.round(transform.scale * 100)}%
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 12,
          right: 248,
          display: "flex",
          gap: 12,
          alignItems: "center",
          fontSize: 10,
          color: "rgba(255,255,255,0.35)",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke="#2dd4bf"
              strokeWidth="1.5"
              strokeDasharray="8 4"
              opacity="0.6"
            />
          </svg>
          Jump Gate
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke="#fcd34d"
              strokeWidth="1.2"
              strokeDasharray="3 4"
              opacity="0.6"
            />
          </svg>
          Accelerator
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke="#4aaeff"
              strokeWidth="1.5"
              strokeDasharray="7 4"
              opacity="0.6"
            />
          </svg>
          Superhighway
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="20" height="8">
            <line
              x1="0"
              y1="4"
              x2="20"
              y2="4"
              stroke="#6366f1"
              strokeWidth="0.8"
              strokeDasharray="4 4"
              opacity="0.6"
            />
          </svg>
          Local Highway
        </span>
      </div>
    </div>
  );
}
