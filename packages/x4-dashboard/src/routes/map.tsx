import { useCallback, useEffect, useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { MapIcon, RotateCcw } from "lucide-react";

import { AnalysisPanel } from "../components/map/AnalysisPanel";
import { ControlPanel } from "../components/map/ControlPanel";
import { MapCanvas, type MapToggles } from "../components/map/MapCanvas";
import { NavPanel } from "../components/map/NavPanel";
import { SectorDetailPanel } from "../components/map/SectorDetailPanel";
import { sectorDisplayName } from "../lib/map/names";
import { useMapData } from "../lib/map/useMapData";
import { useMapLayout } from "../lib/map/useMapLayout";
import { usePanZoom } from "../lib/map/usePanZoom";
import type { FillMode } from "../lib/map/overlays/types";
import { useEconomyWares } from "../lib/map/overlays/useAnalysisData";
import { useAnalysisOverlay } from "../lib/map/overlays/useAnalysisOverlay";

const mapApi = getRouteApi("/map");

export default function MapPage() {
  const search = mapApi.useSearch();
  const data = useMapData();

  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [hoveredSectorId, setHoveredSectorId] = useState<string | null>(null);
  const [toggles, setToggles] = useState<MapToggles>({
    showGates: true,
    showHighways: true,
    showLocalHighways: true,
    showGrid: true,
  });
  const [activeDlcs, setActiveDlcs] = useState<Set<string> | null>(null);

  // Overlay state.
  const [fillMode, setFillMode] = useState<FillMode>(search.ware || search.routes ? "trade" : "faction");
  const [resource, setResource] = useState<string | null>(null);
  const [wareId, setWareId] = useState<string | null>(search.ware ?? null);
  const [maxJumps, setMaxJumps] = useState<number | null>(null);
  const [selectedRouteSector, setSelectedRouteSector] = useState<string | null>(null);
  const [navFrom, setNavFrom] = useState<string | null>(search.from ?? null);
  const [navTo, setNavTo] = useState<string | null>(search.to ?? null);

  // Re-apply deep-link params if they change while the map is already mounted.
  useEffect(() => {
    if (search.ware) { setFillMode("trade"); setWareId(search.ware); }
    else if (search.routes) setFillMode("trade");
    if (search.from) setNavFrom(search.from);
    if (search.to) setNavTo(search.to);
  }, [search.ware, search.routes, search.from, search.to]);

  const layout = useMapLayout(data, activeDlcs);
  const { sectorCoords, hexSize, visibleSectors, clusterMap, resourcesByCluster, factionMap, allDlcs, enabledDlcs } = layout;

  const panZoom = usePanZoom(sectorCoords, visibleSectors, hexSize);

  const economyWaresQuery = useEconomyWares(fillMode === "trade");
  const wareName = useMemo(
    () => economyWaresQuery.data?.find((w) => w.ware_id === wareId)?.ware_name ?? null,
    [economyWaresQuery.data, wareId]
  );

  const overlay = useAnalysisOverlay({
    fillMode, resource, wareId, maxJumps, selectedRouteSector, navFrom, navTo,
    sectorCoords, connections: data.connections,
  });

  const sectorName = useCallback((id: string) => {
    const s = data.sectors.find((x) => x.sector_id.toLowerCase() === id.toLowerCase());
    return s ? sectorDisplayName(s) : id;
  }, [data.sectors]);

  const selectedSector = useMemo(
    () => data.sectors.find((s) => s.sector_id === selectedSectorId) ?? null,
    [data.sectors, selectedSectorId]
  );

  const setToggle = (key: keyof MapToggles) => (v: boolean) =>
    setToggles((t) => ({ ...t, [key]: v }));

  // Left-click: select (highlighted bounds) and set the nav origin, clearing any plotted
  // route so plain browsing never draws one. In trade-routes view it also highlights the
  // clicked sector's best route — the whole hex is the click target, not a tiny dot.
  const handleSelectSector = useCallback((id: string | null) => {
    setSelectedSectorId((cur) => (cur === id ? null : id));
    if (id) { setNavFrom(id); setNavTo(null); }
    setSelectedRouteSector(id && fillMode === "trade" && !wareId ? id : null);
  }, [fillMode, wareId]);

  // Right-click: set the navigation destination (origin stays sticky for repeat probing).
  const handleContextSector = useCallback((id: string) => setNavTo(id), []);

  const clearNav = useCallback(() => { setNavFrom(null); setNavTo(null); }, []);

  // Escape clears the navigation path and any highlighted route.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { clearNav(); setSelectedRouteSector(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearNav]);

  const handleFillMode = useCallback((m: FillMode) => {
    setFillMode(m);
    setSelectedRouteSector(null);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      {/* Header */}
      <div className="px-5 py-3 border-b border-border shrink-0 flex items-center justify-between"
        style={{ background: "hsl(var(--card))" }}>
        <div className="flex items-center gap-3">
          <MapIcon className="w-5 h-5 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-bold leading-none">Universe Map</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {visibleSectors.length} sectors · {data.gates.length} gates · {data.highways.length} highways
            </p>
          </div>
        </div>
        <button
          onClick={panZoom.resetView}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <MapCanvas
          data={data}
          layout={layout}
          toggles={toggles}
          overlay={overlay}
          transform={panZoom.transform}
          isPanning={panZoom.isPanning}
          containerRef={panZoom.containerRef}
          handlers={panZoom.handlers}
          selectedSectorId={selectedSectorId}
          hoveredSectorId={hoveredSectorId}
          onSelectSector={handleSelectSector}
          onHoverSector={setHoveredSectorId}
          onContextSector={handleContextSector}
          navFrom={navFrom}
          navTo={navTo}
          onClearNav={clearNav}
          sectorName={sectorName}
        />

        {/* Right panel: overlay controls (top), detail/map controls, navigation (bottom). */}
        <aside style={{ width: 236, flexShrink: 0, borderLeft: "1px solid hsl(var(--border))", display: "flex", flexDirection: "column", overflowY: "auto" }}
          className="bg-card">
          <AnalysisPanel
            fillMode={fillMode}
            onFillModeChange={handleFillMode}
            resource={resource}
            onResourceChange={setResource}
            onClearResource={() => setResource(null)}
            resourceSource={overlay.resourceSource}
            wareId={wareId}
            wareName={wareName}
            onWareChange={(w) => { setWareId(w); setSelectedRouteSector(null); }}
            onClearWare={() => setWareId(null)}
            economyWares={economyWaresQuery.data ?? []}
            waresLoading={economyWaresQuery.isLoading}
            routesLoading={overlay.isLoading}
            markerCount={overlay.routeMarkers.length}
            maxJumps={maxJumps}
            onMaxJumpsChange={setMaxJumps}
            overlayLoading={overlay.isLoading}
          />

          {selectedSector ? (
            <SectorDetailPanel
              sector={selectedSector}
              cluster={selectedSector.cluster_id ? clusterMap.get(selectedSector.cluster_id) ?? null : null}
              resources={selectedSector.cluster_id ? (resourcesByCluster.get(selectedSector.cluster_id) ?? new Set()) : new Set()}
              factionMap={factionMap}
              onClose={() => setSelectedSectorId(null)}
            />
          ) : (
            <ControlPanel
              allDlcs={allDlcs}
              activeDlcs={enabledDlcs}
              showGates={toggles.showGates}
              showHighways={toggles.showHighways}
              showLocalHighways={toggles.showLocalHighways}
              showGrid={toggles.showGrid}
              onToggleGates={setToggle("showGates")}
              onToggleHighways={setToggle("showHighways")}
              onToggleLocalHighways={setToggle("showLocalHighways")}
              onToggleGrid={setToggle("showGrid")}
              onToggleDlc={(dlc, on) => {
                setActiveDlcs((prev) => {
                  const current = new Set(prev ?? allDlcs);
                  if (on) current.add(dlc); else current.delete(dlc);
                  return current.size === allDlcs.length ? null : current;
                });
              }}
            />
          )}

          <NavPanel navFrom={navFrom} navTo={navTo} onClear={clearNav} sectorName={sectorName} />
        </aside>
      </div>
    </div>
  );
}
