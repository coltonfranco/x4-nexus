// Derives every geometry + lookup structure the map renders from, given the raw
// server data and the active DLC filter. Memoized so panning/zooming is cheap.

import { useMemo } from "react";

import { computeSectorLayout } from "./layout";
import {
  computeBgGrid,
  computeOverlappingPaths,
  computeStationScreenPos,
  computeSubSectorSet,
  computeZoneScale,
  computeZoneScreenPos,
} from "./positions";
import type { Cluster, FactionSummary, Zone } from "./types";
import type { MapData } from "./useMapData";

export function useMapLayout(data: MapData, activeDlcs: Set<string> | null) {
  const { clusters, sectors, zones, gates, highways, connections, resources, factions, stations } = data;

  const factionMap = useMemo(() => {
    const m = new Map<string, FactionSummary>();
    factions.forEach((f) => m.set(f.faction_id, f));
    return m;
  }, [factions]);

  const clusterMap = useMemo(() => {
    const m = new Map<string, Cluster>();
    clusters.forEach((c) => m.set(c.cluster_id, c));
    return m;
  }, [clusters]);

  const resourcesByCluster = useMemo(() => {
    const m = new Map<string, Set<string>>();
    resources.forEach((r) => {
      const s = m.get(r.cluster_id) ?? new Set<string>();
      s.add(r.ware);
      m.set(r.cluster_id, s);
    });
    return m;
  }, [resources]);

  const allDlcs = useMemo(
    () => Array.from(new Set(sectors.map((s) => s.dlc).filter(Boolean) as string[])).sort(),
    [sectors]
  );
  const enabledDlcs = useMemo(() => activeDlcs ?? new Set(allDlcs), [activeDlcs, allDlcs]);
  const visibleSectors = useMemo(
    () => sectors.filter((s) => !s.dlc || enabledDlcs.has(s.dlc)),
    [sectors, enabledDlcs]
  );
  const visibleSectorIds = useMemo(
    () => new Set(visibleSectors.map((s) => s.sector_id)),
    [visibleSectors]
  );

  const zoneMap = useMemo(() => {
    const m = new Map<string, Zone>();
    zones.forEach((z) => m.set(z.zone_id, z));
    return m;
  }, [zones]);

  const subSectorSet = useMemo(() => computeSubSectorSet(clusters, sectors), [clusters, sectors]);

  const { sectorCoords, hexSize, gridOrigin } = useMemo(
    () => computeSectorLayout(sectors, clusters, connections),
    [sectors, clusters, connections]
  );

  const bgGrid = useMemo(() => computeBgGrid(hexSize, gridOrigin), [hexSize, gridOrigin]);

  const zoneScale = useMemo(() => computeZoneScale(hexSize), [hexSize]);

  const zoneScreenPos = useMemo(
    () => computeZoneScreenPos(zones, sectorCoords, zoneScale, subSectorSet),
    [zones, sectorCoords, zoneScale, subSectorSet]
  );

  const overlappingPaths = useMemo(
    () => computeOverlappingPaths(highways, gates, zoneMap, zoneScreenPos, sectorCoords),
    [highways, gates, zoneMap, zoneScreenPos, sectorCoords]
  );

  const stationScreenPos = useMemo(
    () => computeStationScreenPos(stations, sectorCoords, zoneScale, subSectorSet),
    [stations, sectorCoords, zoneScale, subSectorSet]
  );

  return {
    factionMap,
    clusterMap,
    resourcesByCluster,
    allDlcs,
    enabledDlcs,
    visibleSectors,
    visibleSectorIds,
    zoneMap,
    subSectorSet,
    sectorCoords,
    hexSize,
    gridOrigin,
    bgGrid,
    zoneScale,
    zoneScreenPos,
    overlappingPaths,
    stationScreenPos,
  };
}

export type MapLayout = ReturnType<typeof useMapLayout>;
