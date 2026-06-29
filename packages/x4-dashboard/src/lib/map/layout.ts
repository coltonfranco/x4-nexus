// Sector layout solver — the core geometry of the universe map.
//
// Two strategies:
//  1. qx/qy populated → axial formula, exact grid.
//  2. Fallback → compute absolute (x,z) positions, snap to nearest hex grid cell,
//     resolve collisions via BFS rings so no two sectors share a cell.
//
// Returns sectorCoords (SVG canvas positions) + hexSize + gridOrigin (where
// axial (0,0) lands in SVG canvas space, used to anchor the background grid).

import { MAP_H, MAP_W, SQRT3 } from "./constants";
import { axialToPixel, hexRing } from "./geometry";
import type { Cluster, Sector, SectorConnection } from "./types";

export type SectorLayout = {
  sectorCoords: Map<string, [number, number]>;
  hexSize: number;
  gridOrigin: [number, number];
};

export function computeSectorLayout(
  sectors: Sector[],
  clusters: Cluster[],
  connections: SectorConnection[],
): SectorLayout {
  const empty: SectorLayout = { sectorCoords: new Map(), hexSize: 36, gridOrigin: [MAP_W / 2, MAP_H / 2] };
  if (sectors.length === 0 || clusters.length === 0) return empty;

  const hasHexGrid = clusters.some((c) => c.qx != null && c.qy != null);

  if (hasHexGrid) {
    // ── Exact hex-grid layout (qx/qy from DB) ──
    // Each sector occupies its own full hex cell. Single-sector clusters map
    // directly to the cluster cell; multi-sector clusters assign each sector to
    // the cluster cell or an adjacent neighbor based on game-space angle.
    const size = 60;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    clusters.forEach((c) => {
      if (c.qx == null || c.qy == null) return;
      const [px, rawPy] = axialToPixel(c.qx, c.qy, size);
      const py = -rawPy;
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    });
    const PAD = 100;
    const scaleF = Math.min((MAP_W - PAD * 2) / (maxX - minX || 1), (MAP_H - PAD * 2) / (maxY - minY || 1));
    const ox = PAD + (MAP_W - PAD * 2) / 2 - ((minX + maxX) / 2) * scaleF;
    const oy = PAD + (MAP_H - PAD * 2) / 2 - ((minY + maxY) / 2) * scaleF;
    const hs = size * scaleF;

    // Flat-top neighbor (dq, dr) and their game-space angle (atan2(z, x), z+ = north).
    // Derived from wiki formula: q=(2/3)x/s, r=(-x/3+√3/3·z)/s
    // (1,0)→NE≈30°, (0,1)→N=90°, (-1,1)→NW≈150°, (-1,0)→SW≈-150°, (0,-1)→S=-90°, (1,-1)→SE≈-30°
    const NBRS: [number, number, number][] = [
      [1,  0,  Math.PI / 6],
      [0,  1,  Math.PI / 2],
      [-1, 1,  5 * Math.PI / 6],
      [-1, 0, -5 * Math.PI / 6],
      [0, -1, -Math.PI / 2],
      [1, -1, -Math.PI / 6],
    ];

    const occupied = new Map<string, string>(); // "q,r" → sector_id
    const sCoords = new Map<string, [number, number]>();

    const placeAt = (sid: string, q: number, r: number) => {
      const [px, rawPy] = axialToPixel(q, r, size);
      sCoords.set(sid, [ox + px * scaleF, oy + (-rawPy) * scaleF]);
      occupied.set(`${q},${r}`, sid);
    };

    // Process single-sector clusters first so their cells are reserved before
    // multi-sector clusters try to claim adjacent cells.
    const clusterOrder = [...clusters].sort((a, b) => {
      const nA = sectors.filter(s => s.cluster_id === a.cluster_id).length;
      const nB = sectors.filter(s => s.cluster_id === b.cluster_id).length;
      return nA - nB;
    });

    clusterOrder.forEach((c) => {
      if (c.qx == null || c.qy == null) return;
      const cq = c.qx, cr = c.qy;
      const clusterSecs = sectors.filter((s) => s.cluster_id === c.cluster_id);
      if (clusterSecs.length === 0) return;

      if (clusterSecs.length === 1) {
        const key = `${cq},${cr}`;
        if (!occupied.has(key)) {
          placeAt(clusterSecs[0].sector_id, cq, cr);
        } else {
          const nb = NBRS.find(([dq, dr]) => !occupied.has(`${cq + dq},${cr + dr}`));
          if (nb) placeAt(clusterSecs[0].sector_id, cq + nb[0], cr + nb[1]);
          else placeAt(clusterSecs[0].sector_id, cq, cr);
        }
        return;
      }

      // Multi-sector: compute game-space angle of each sector from centroid.
      // Sector relative positions are always in (x, z); cluster.z being null only
      // affects galaxy-level positioning, not intra-cluster offsets.
      const sxArr = clusterSecs.map(s => s.x ?? 0);
      const szArr = clusterSecs.map(s => s.z ?? 0);
      const centX = (Math.min(...sxArr) + Math.max(...sxArr)) / 2;
      const centZ = (Math.min(...szArr) + Math.max(...szArr)) / 2;

      const secData = clusterSecs.map((s) => {
        let sx = (s.x ?? 0) - centX;
        let sz = (s.z ?? 0) - centZ;
        if (c.qw != null) {
          const qx2 = c.qx ?? 0, qy2 = c.qy ?? 0, qz2 = c.qz ?? 0, qw2 = c.qw;
          const xx = qx2*qx2, yy = qy2*qy2, zz = qz2*qz2;
          const xz = qx2*qz2, yw = qy2*qw2;
          const m00 = 1-2*(yy+zz), m02 = 2*(xz+yw);
          const m20 = 2*(xz-yw), m22 = 1-2*(xx+yy);
          const rx = sx*m00 + sz*m02;
          const rz = sx*m20 + sz*m22;
          sx = rx; sz = rz;
        }
        return { s, angle: Math.atan2(sz, sx), dist: Math.sqrt(sx*sx + sz*sz) };
      });

      // Most-central sector gets the cluster's own cell; outer sectors get neighbors.
      secData.sort((a, b) => a.dist - b.dist);
      const [central, ...outer] = secData;

      const cKey = `${cq},${cr}`;
      if (!occupied.has(cKey)) {
        placeAt(central.s.sector_id, cq, cr);
      } else {
        const nb = NBRS.find(([dq, dr]) => !occupied.has(`${cq + dq},${cr + dr}`));
        if (nb) placeAt(central.s.sector_id, cq + nb[0], cr + nb[1]);
        else placeAt(central.s.sector_id, cq, cr);
      }

      outer.forEach(({ s, angle }) => {
        const byAngle = [...NBRS]
          .map((n, i) => {
            let diff = Math.abs(angle - n[2]);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            return { dq: n[0], dr: n[1], diff, i };
          })
          .sort((a, b) => a.diff - b.diff);

        const nb = byAngle.find(({ dq, dr }) => !occupied.has(`${cq + dq},${cr + dr}`));
        if (nb) { placeAt(s.sector_id, cq + nb.dq, cr + nb.dr); return; }

        // All 6 neighbors taken; expand to rings 2-4
        for (let ring = 2; ring <= 4; ring++) {
          const ringCells = hexRing(cq, cr, ring);
          const free = ringCells.find(([q, r]) => !occupied.has(`${q},${r}`));
          if (free) { placeAt(s.sector_id, free[0], free[1]); return; }
        }
        placeAt(s.sector_id, cq, cr);
      });
    });

    return { sectorCoords: sCoords, hexSize: hs, gridOrigin: [ox, oy] };
  }

  // ── Fallback: convert galaxy (x,z) → axial using X4's exact hex grid formula ──
  const hasZ = clusters.some((c) => Math.abs(c.z ?? 0) > 1);

  type GalPt = { id: string; gx: number; gz: number };
  const galPts: GalPt[] = clusters.map((c) => ({
    id: c.cluster_id,
    gx: c.x ?? 0,
    gz: hasZ ? (c.z ?? 0) : (c.y ?? 0),
  }));
  const galMap = new Map(galPts.map((p) => [p.id, p]));

  // Infer hex size in game units from connected-cluster distances.
  const rawDists: number[] = [];
  connections.forEach((c) => {
    const sA = sectors.find((s) => s.sector_id === c.from_sector_id);
    const sB = sectors.find((s) => s.sector_id === c.to_sector_id);
    if (sA && sB && sA.cluster_id && sB.cluster_id && sA.cluster_id !== sB.cluster_id) {
      const cA = galMap.get(sA.cluster_id), cB = galMap.get(sB.cluster_id);
      if (cA && cB) rawDists.push(Math.sqrt((cA.gx - cB.gx) ** 2 + (cA.gz - cB.gz) ** 2));
    }
  });
  rawDists.sort((a, b) => a - b);
  const medianDist = rawDists[Math.floor(rawDists.length * 0.15)] ?? 0;
  if (medianDist < 1) return empty;
  const hexSizeGame = medianDist / SQRT3;

  // Convert each cluster to exact axial coords, resolve rare collisions via BFS.
  const degree = new Map<string, number>();
  connections.forEach((c) => {
    const sA = sectors.find((s) => s.sector_id === c.from_sector_id);
    const sB = sectors.find((s) => s.sector_id === c.to_sector_id);
    if (sA && sB && sA.cluster_id && sB.cluster_id && sA.cluster_id !== sB.cluster_id) {
      degree.set(sA.cluster_id, (degree.get(sA.cluster_id) ?? 0) + 1);
      degree.set(sB.cluster_id, (degree.get(sB.cluster_id) ?? 0) + 1);
    }
  });
  const sortedIds = galPts.map((p) => p.id).sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0));

  const occupied = new Map<string, string>();
  const axialPos = new Map<string, [number, number]>();

  sortedIds.forEach((id) => {
    const { gx, gz } = galMap.get(id)!;
    const q0 = Math.round((2 / 3) * gx / hexSizeGame);
    const r0 = Math.round((-gx / 3 + SQRT3 / 3 * gz) / hexSizeGame);
    for (let ring = 0; ring <= 3; ring++) {
      const cells = hexRing(q0, r0, ring);
      for (const [q, r] of cells) {
        const key = `${q},${r}`;
        if (!occupied.has(key)) {
          occupied.set(key, id);
          axialPos.set(id, [q, r]);
          return;
        }
      }
    }
    axialPos.set(id, [q0, r0]);
  });

  // Scale axial positions to fill the SVG canvas
  const unitPts = Array.from(axialPos.values()).map(([q, r]) => {
    const [px, py] = axialToPixel(q, r, 1);
    return [px, -py] as [number, number];
  });
  const uXs = unitPts.map(([x]) => x), uYs = unitPts.map(([, y]) => y);
  const uMinX = Math.min(...uXs), uMaxX = Math.max(...uXs);
  const uMinY = Math.min(...uYs), uMaxY = Math.max(...uYs);
  const PAD = 140;
  const scaleF = Math.min(
    (MAP_W - PAD * 2) / (uMaxX - uMinX || 1),
    (MAP_H - PAD * 2) / (uMaxY - uMinY || 1)
  );
  const hs = Math.max(2, scaleF);
  const gox = PAD + (MAP_W - PAD * 2) / 2 - ((uMinX + uMaxX) / 2) * hs;
  const goy = PAD + (MAP_H - PAD * 2) / 2 - ((uMinY + uMaxY) / 2) * hs;

  const cCoords = new Map<string, [number, number]>();
  axialPos.forEach(([q, r], id) => {
    const [px, py] = axialToPixel(q, r, hs);
    cCoords.set(id, [gox + px, goy + (-py)]);
  });

  // Sub-sector positioning via 6-neighbor assignment

  const sCoords = new Map<string, [number, number]>();
  clusters.forEach((c) => {
    const cPos = cCoords.get(c.cluster_id);
    if (!cPos) return;

    const clusterSecs = sectors.filter((s) => s.cluster_id === c.cluster_id);
    if (clusterSecs.length === 1) {
      sCoords.set(clusterSecs[0].sector_id, cPos);
      return;
    }

    const secX = clusterSecs.map((s) => s.x ?? 0);
    const secZ = clusterSecs.map((s) => hasZ ? (s.z ?? 0) : (s.y ?? 0));

    const r_hex = hs * 0.5;
    const xS = 1.5 * r_hex;
    const yS = SQRT3 * r_hex;

    let configs: { dx: number, dy: number, gx: number, gz: number }[][] = [];

    if (clusterSecs.length === 1) {
      configs = [ [ { dx: 0, dy: 0, gx: 0, gz: 0 } ] ];
    } else if (clusterSecs.length === 2) {
      configs = [
        [
          { dx: -xS/3, dy: -yS/2, gx: -1, gz: 1 }, // TL
          { dx: xS/3, dy: yS/2, gx: 1, gz: -1 }    // BR
        ],
        [
          { dx: xS/3, dy: -yS/2, gx: 1, gz: 1 },   // TR
          { dx: -xS/3, dy: yS/2, gx: -1, gz: -1 }  // BL
        ]
      ];
    } else if (clusterSecs.length === 3) {
      configs = [
        [ // Pointing Left
          { dx: -xS/3, dy: -yS/2, gx: -1, gz: 1 },
          { dx: 2*xS/3, dy: 0, gx: 1, gz: 0 },
          { dx: -xS/3, dy: yS/2, gx: -1, gz: -1 }
        ],
        [ // Pointing Right
          { dx: xS/3, dy: -yS/2, gx: 1, gz: 1 },
          { dx: -2*xS/3, dy: 0, gx: -1, gz: 0 },
          { dx: xS/3, dy: yS/2, gx: 1, gz: -1 }
        ]
      ];
    } else {
      configs = [
        [
          { dx: -xS/2, dy: yS/4, gx: -1, gz: 0 },
          { dx: -xS/2, dy: -3*yS/4, gx: -1, gz: 2 },
          { dx: xS/2, dy: -yS/4, gx: 1, gz: 1 },
          { dx: xS/2, dy: 3*yS/4, gx: 1, gz: -1 }
        ]
      ];
    }

    const norm = (x: number, z: number) => {
      const mag = Math.sqrt(x*x + z*z);
      return mag === 0 ? [0, 0] : [x/mag, z/mag];
    };

    const secNorms = clusterSecs.map((_, i) => norm(secX[i], secZ[i]));

    // Since Earth/Moon and Savage Spur have identically tied internal coordinates (0, -1),
    // the game engine likely resolves their orientations via a physics/connection layout pass.
    // We use a targeted override to match the vanilla map exactly without replicating the physics engine.
    if (c.cluster_id === 'Cluster_112_macro') {
      configs.reverse();
    }

    let globalBestScore = -Infinity;
    let bestConfig: { dx: number, dy: number, gx: number, gz: number }[] = [];
    let bestAssignment: number[] = [];

    for (const config of configs) {
      const dirsNorm = config.map(d => norm(d.gx, d.gz));

      const permute = (current: number[], available: number[]) => {
        if (current.length === clusterSecs.length) {
          let score = 0;
          for (let i = 0; i < current.length; i++) {
            const sn = secNorms[i];
            const dn = dirsNorm[current[i]];
            score += sn[0] * dn[0] + sn[1] * dn[1];
          }
          if (score > globalBestScore) {
            globalBestScore = score;
            bestConfig = config;
            bestAssignment = [...current];
          }
          return;
        }
        for (let i = 0; i < available.length; i++) {
          const nextAvail = available.slice();
          const chosen = nextAvail.splice(i, 1)[0];
          current.push(chosen);
          permute(current, nextAvail);
          current.pop();
        }
      };

      permute([], Array.from({ length: config.length }, (_, i) => i));
    }

    clusterSecs.forEach((s, i) => {
      const dir = bestConfig[bestAssignment[i]];
      sCoords.set(s.sector_id, [cPos[0] + dir.dx, cPos[1] + dir.dy]);
    });
  });

  return { sectorCoords: sCoords, hexSize: hs, gridOrigin: [gox, goy] };
}
