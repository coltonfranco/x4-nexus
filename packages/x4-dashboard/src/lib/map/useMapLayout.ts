// Derives every geometry + lookup structure the map renders from, given the raw
// server data and the active DLC filter. Memoized so panning/zooming is cheap.

import { useMemo } from "react";

import { computeSectorLayout } from "./layout";
import {
  computeBgGrid,
  computeOverlappingPaths,
  computeStationScreenPos,
  computeSubSectorSet,
  computeZoneScaleMap,
  computeZoneScreenPos,
} from "./positions";
import type { Cluster, FactionSummary, Zone } from "./types";
import type { MapData } from "./useMapData";

export function useMapLayout(data: MapData, activeDlcs: Set<string> | null, fogOfWar: boolean = true) {
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
    () => sectors.filter((s) => {
      if (s.dlc && !enabledDlcs.has(s.dlc)) return false;
      if (fogOfWar && s.known_to_player === false) return false;
      return true;
    }),
    [sectors, enabledDlcs, fogOfWar]
  );
  const visibleSectorIds = useMemo(
    () => new Set(visibleSectors.map((s) => s.sector_id)),
    [visibleSectors]
  );

  const visibleZoneIds = useMemo(() => {
    const s = new Set<string>();
    zones.forEach((z) => {
      if (z.sector_id && visibleSectorIds.has(z.sector_id)) s.add(z.zone_id);
    });
    return s;
  }, [zones, visibleSectorIds]);

  const visibleGates = useMemo(
    () => gates.filter(g => visibleZoneIds.has(g.from_zone_id) || visibleZoneIds.has(g.to_zone_id)),
    [gates, visibleZoneIds]
  );

  const visibleHighways = useMemo(
    () => highways.filter(h => visibleZoneIds.has(h.from_zone_id) || visibleZoneIds.has(h.to_zone_id)),
    [highways, visibleZoneIds]
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

  const zoneScaleMap = useMemo(() => computeZoneScaleMap(hexSize, stations), [hexSize, stations]);

  const zoneScreenPos = useMemo(
    () => computeZoneScreenPos(zones, sectorCoords, zoneScaleMap, subSectorSet),
    [zones, sectorCoords, zoneScaleMap, subSectorSet]
  );

  const overlappingPaths = useMemo(
    () => computeOverlappingPaths(visibleHighways, visibleGates, zoneMap, zoneScreenPos, sectorCoords),
    [visibleHighways, visibleGates, zoneMap, zoneScreenPos, sectorCoords]
  );

  const stationScreenPos = useMemo(
    () => computeStationScreenPos(stations, sectorCoords, zoneScaleMap, subSectorSet),
    [stations, sectorCoords, zoneScaleMap, subSectorSet]
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
    zoneScaleMap,
    zoneScreenPos,
    overlappingPaths,
    stationScreenPos,
    visibleGates,
    visibleHighways,
  };
}

export type MapLayout = ReturnType<typeof useMapLayout>;
