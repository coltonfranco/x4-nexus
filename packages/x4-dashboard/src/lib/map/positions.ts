// Secondary geometry derived from the sector layout: the background hex grid,
// per-zone screen positions, and overlap detection for parallel gate/highway links.

import { MAP_H, MAP_W, SQRT3 } from "./constants";
import { axialToPixel } from "./geometry";
import type { Cluster, Gate, Highway, Sector, Zone } from "./types";

// Sectors that share a cluster with other sectors render at half hex size.
export function computeSubSectorSet(clusters: Cluster[], sectors: Sector[]): Set<string> {
  const set = new Set<string>();
  clusters.forEach((c) => {
    const clusterSecs = sectors.filter((s) => s.cluster_id === c.cluster_id);
    if (clusterSecs.length > 1) {
      clusterSecs.forEach((s) => set.add(s.sector_id));
    }
  });
  return set;
}

// Tile flat-top hexes over the canvas, anchored to gridOrigin so they align with
// placed sectors. Capped to avoid generating too many SVG elements.
export function computeBgGrid(hexSize: number, gridOrigin: [number, number]): [number, number][] {
  if (hexSize === 0) return [];
  const [gox, goy] = gridOrigin;
  const qMax = Math.min(55, Math.ceil(MAP_W / (hexSize * 1.5)) + 3);
  const rMax = Math.min(45, Math.ceil(MAP_H / (hexSize * SQRT3)) + 3);
  const cells: [number, number][] = [];
  for (let q = -qMax; q <= qMax; q++) {
    for (let r = -rMax; r <= rMax; r++) {
      const [px, py] = axialToPixel(q, r, hexSize);
      cells.push([gox + px, goy + (-py)]); // Y-flip matches sector coordinate system
    }
  }
  return cells;
}

export function computeZoneScale(hexSize: number): number {
  if (hexSize === 0) return 0;
  // In X4, sector sizes are dynamic. By scaling to 300,000, gates at 200,000
  // sit comfortably inside the hexes without physically touching the borders.
  // This perfectly matches the dynamic visual scale of the game's UI.
  return (hexSize * Math.sqrt(3) / 2) / 300000;
}

export function computeZoneScreenPos(
  zones: Zone[],
  sectorCoords: Map<string, [number, number]>,
  zoneScale: number,
  subSectorSet: Set<string>,
): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  if (zoneScale === 0) return m;
  zones.forEach((z) => {
    if (!z.sector_id) return;
    const sp = sectorCoords.get(z.sector_id);
    if (!sp) return;

    const isSubSector = subSectorSet.has(z.sector_id);
    // For subsectors, the hex radius is exactly halved (0.5), so we half the scale to perfectly map 200k to the sub-hex edge.
    const scale = isSubSector ? zoneScale * 0.5 : zoneScale;

    const dx = (z.x ?? 0) * scale;
    const dz = (z.z ?? 0) * scale;

    m.set(z.zone_id, [sp[0] + dx, sp[1] - dz]);
  });
  return m;
}

export type OverlappingPaths = {
  counts: Map<string, number>;
  getSig: (p1: [number, number], p2: [number, number]) => string;
};

export function computeOverlappingPaths(
  highways: Highway[],
  gates: Gate[],
  zoneMap: Map<string, Zone>,
  zoneScreenPos: Map<string, [number, number]>,
  sectorCoords: Map<string, [number, number]>,
): OverlappingPaths {
  const counts = new Map<string, number>();
  const getSig = (p1: [number, number], p2: [number, number]) => {
    const s1 = `${Math.round(p1[0]/10)},${Math.round(p1[1]/10)}`;
    const s2 = `${Math.round(p2[0]/10)},${Math.round(p2[1]/10)}`;
    return s1 < s2 ? `${s1}-${s2}` : `${s2}-${s1}`;
  };

  const addConnection = (z1Id: string, z2Id: string) => {
    const z1 = zoneMap.get(z1Id), z2 = zoneMap.get(z2Id);
    if (!z1?.sector_id || !z2?.sector_id) return;
    const p1 = zoneScreenPos.get(z1Id) ?? sectorCoords.get(z1.sector_id);
    const p2 = zoneScreenPos.get(z2Id) ?? sectorCoords.get(z2.sector_id);
    if (p1 && p2) {
      const sig = getSig(p1, p2);
      counts.set(sig, (counts.get(sig) ?? 0) + 1);
    }
  };

  highways.forEach(hw => addConnection(hw.from_zone_id, hw.to_zone_id));
  gates.forEach(g => addConnection(g.from_zone_id, g.to_zone_id));

  return { counts, getSig };
}
