import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapIcon, RotateCcw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Cluster = {
  cluster_id: string;
  macro_id: string | null;
  name: string | null;
  owner_faction: string | null;
  dlc: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  qx: number | null;
  qy: number | null;
  qz: number | null;
  qw: number | null;
};

type Sector = {
  sector_id: string;
  cluster_id: string | null;
  macro_id: string | null;
  name: string | null;
  owner_faction: string | null;
  dlc: string | null;
  sunlight: number | null;
  economy: number | null;
  security: number | null;
  tags: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  qx: number | null;
  qy: number | null;
  qz: number | null;
  qw: number | null;
};

type Zone = {
  zone_id: string;
  sector_id: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
};

type Gate = { from_zone_id: string; to_zone_id: string; kind: string | null };
type Highway = { from_zone_id: string; to_zone_id: string; kind: string };
type SectorConnection = { from_sector_id: string; to_sector_id: string; kind: string | null };
type ClusterResourceEntry = { cluster_id: string; ware: string; yield_level: string };
type FactionSummary = { faction_id: string; name: string; color_hex: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const DLC_LABELS: Record<string, string> = {
  boron:     "Kingdom End",
  terran:    "Cradle of Humanity",
  split:     "Split Vendetta",
  pirate:    "Tides of Avarice",
  timelines: "Timelines",
  "4":       "Hyperion Pack",
  "5":       "Boron Pack",
  odyssey:   "Odyssey of the Ancients",
};

const RESOURCE_COLORS: Record<string, string> = {
  energy: "#fde047",
  ore: "#fca5a5",
  silicon: "#93c5fd",
  ice: "#bfdbfe",
  nividium: "#d8b4fe",
  rawscrap: "#d1d5db",
  methane: "#fdba74",
  helium: "#fcd34d",
  hydrogen: "#f472b6",
};
const RESOURCE_ORDER = ["ore", "silicon", "ice", "nividium", "hydrogen", "helium", "methane", "scrap"];
const MAP_W = 3000;
const MAP_H = 2200;
const SQRT3 = Math.sqrt(3);

function ConnectionIcon({ x, y, iconPath, color, size = 24 }: { x: number; y: number; iconPath: string; color: string; size?: number }) {
  const boxSize = size * 1.2;
  return (
    <foreignObject x={x - boxSize / 2} y={y - boxSize / 2} width={boxSize} height={boxSize} style={{ pointerEvents: "none", overflow: "visible" }}>
      <div style={{
        width: "100%", height: "100%",
        backgroundColor: color,
        WebkitMaskImage: `url(/static/icons/map_objects/${iconPath})`,
        WebkitMaskSize: "85%",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }} />
    </foreignObject>
  );
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

// Flat-top hexagon points string.
function hexPoints(cx: number, cy: number, r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

// Axial → pixel (flat-top). Adjacent hexes touch edges at circumradius `size`.
function axialToPixel(q: number, r: number, size: number): [number, number] {
  return [size * 1.5 * q, size * (SQRT3 / 2 * q + SQRT3 * r)];
}

// All axial coords in ring k around (cq, cr).
function hexRing(cq: number, cr: number, k: number): [number, number][] {
  if (k === 0) return [[cq, cr]];
  const dirs: [number, number][] = [[-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0], [0, 1]];
  const result: [number, number][] = [];
  let q = cq + k, r = cr;
  for (const [dq, dr] of dirs) {
    for (let i = 0; i < k; i++) {
      result.push([q, r]);
      q += dq; r += dr;
    }
  }
  return result;
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

function sectorDisplayName(s: Sector): string {
  if (s.name && !s.name.startsWith("{") && !/^(Cluster|cluster)_/i.test(s.name)) {
    return s.name;
  }
  const base = s.macro_id ?? s.sector_id;
  return base
    .replace(/_macro$/i, "")
    .replace(/^Cluster_0*(\d+)_Sector0*(\d+)$/i, "C$1 S$2")
    .replace(/^Cluster_(\w+)_Sector0*(\d+)$/i, "$1 S$2")
    .replace(/_/g, " ");
}

function dlcLabel(dlc: string | null | undefined): string {
  if (!dlc) return "Base Game";
  return DLC_LABELS[dlc.toLowerCase()] ?? dlc.replace(/_/g, " ");
}

// ─── Map page ─────────────────────────────────────────────────────────────────

type Transform = { x: number; y: number; scale: number };

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);
  const hasAutoFit = useRef(false);

  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [hoveredSectorId, setHoveredSectorId] = useState<string | null>(null);
  const [showResources, setShowResources] = useState(true);
  const [showGates, setShowGates] = useState(true);
  const [showHighways, setShowHighways] = useState(true);
  const [showLocalHighways, setShowLocalHighways] = useState(true);
  const [showFactionColors, setShowFactionColors] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [activeDlcs, setActiveDlcs] = useState<Set<string> | null>(null);

  // ─── Queries ────────────────────────────────────────────────────────────────

  const { data: clusters = [], isLoading: clustersLoading } = useQuery<Cluster[]>({
    queryKey: ["map-clusters"],
    queryFn: () => fetch("/api/v1/map/clusters?limit=2000").then((r) => r.json()),
  });
  const { data: sectors = [], isLoading: sectorsLoading } = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => fetch("/api/v1/map/sectors?limit=2000").then((r) => r.json()),
  });
  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["map-zones"],
    queryFn: () => fetch("/api/v1/map/zones?limit=5000").then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });
  const { data: gates = [] } = useQuery<Gate[]>({
    queryKey: ["map-gates"],
    queryFn: () => fetch("/api/v1/map/gates?limit=5000").then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });
  const { data: highways = [] } = useQuery<Highway[]>({
    queryKey: ["map-superhighways"],
    queryFn: () => fetch("/api/v1/map/superhighways?limit=5000").then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
  });
  const { data: connections = [] } = useQuery<SectorConnection[]>({
    queryKey: ["map-sector-connections"],
    queryFn: () => fetch("/api/v1/map/sector-connections").then((r) => r.json()),
  });
  const { data: resources = [] } = useQuery<ClusterResourceEntry[]>({
    queryKey: ["map-cluster-resources"],
    queryFn: () => fetch("/api/v1/map/cluster-resources").then((r) => r.json()),
  });
  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  // ─── Derived lookups ─────────────────────────────────────────────────────────

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

  const subSectorSet = useMemo(() => {
    const set = new Set<string>();
    clusters.forEach((c) => {
      const clusterSecs = sectors.filter((s) => s.cluster_id === c.cluster_id);
      if (clusterSecs.length > 1) {
        clusterSecs.forEach((s) => set.add(s.sector_id));
      }
    });
    return set;
  }, [clusters, sectors]);



  // ─── Coordinate computation ───────────────────────────────────────────────────
  //
  // Two strategies:
  //  1. qx/qy populated → axial formula, exact grid.
  //  2. Fallback → compute absolute (x,z) positions, snap to nearest hex grid cell,
  //     resolve collisions via BFS rings so no two sectors share a cell.
  //
  // Returns sectorCoords (SVG canvas positions) + hexSize + gridOrigin (where
  // axial (0,0) lands in SVG canvas space, used to anchor the background grid).

  const { sectorCoords, hexSize, gridOrigin } = useMemo<{
    sectorCoords: Map<string, [number, number]>;
    hexSize: number;
    gridOrigin: [number, number];
  }>(() => {
    const empty = { sectorCoords: new Map(), hexSize: 36, gridOrigin: [MAP_W / 2, MAP_H / 2] as [number, number] };
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
  }, [sectors, clusters, clusterMap, connections]);

  // ─── Background grid cells ────────────────────────────────────────────────────
  //
  // Tile flat-top hexes over the canvas, anchored to gridOrigin so they align
  // with placed sectors. Capped to avoid generating too many SVG elements.

  const bgGrid = useMemo(() => {
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
  }, [hexSize, gridOrigin]);

  // ─── Zone screen positions ────────────────────────────────────────────────────

  const zoneScale = useMemo(() => {
    if (hexSize === 0) return 0;
    // In X4, sector sizes are dynamic. By scaling to 300,000, gates at 200,000
    // sit comfortably inside the hexes without physically touching the borders.
    // This perfectly matches the dynamic visual scale of the game's UI.
    return (hexSize * Math.sqrt(3) / 2) / 300000;
  }, [hexSize]);

  const zoneScreenPos = useMemo(() => {
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
  }, [zones, sectorCoords, zoneScale, subSectorSet]);

  const overlappingPaths = useMemo(() => {
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
  }, [highways, gates, zoneMap, zoneScreenPos, sectorCoords]);

  // ─── Auto-fit ─────────────────────────────────────────────────────────────────

  const fitView = useCallback(() => {
    if (!containerRef.current || sectorCoords.size === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const pts = visibleSectors.map((s) => sectorCoords.get(s.sector_id)).filter(Boolean) as [number, number][];
    if (!pts.length) return;
    const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
    const contentW = Math.max(...xs) - Math.min(...xs) + hexSize * 4;
    const contentH = Math.max(...ys) - Math.min(...ys) + hexSize * 4;
    const scale = Math.min(rect.width / contentW, rect.height / contentH, 2) * 0.88;
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    setTransform({ x: rect.width / 2 - cx * scale, y: rect.height / 2 - cy * scale, scale });
  }, [sectorCoords, visibleSectors, hexSize]);

  useEffect(() => {
    if (hasAutoFit.current || sectorCoords.size === 0 || visibleSectors.length === 0) return;
    fitView();
    hasAutoFit.current = true;
  }, [sectorCoords, visibleSectors, fitView]);

  // ─── Pan / zoom ───────────────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setTransform((t) => {
      const s = Math.max(0.04, Math.min(25, t.scale * factor));
      const f = s / t.scale;
      return { x: ex - (ex - t.x) * f, y: ey - (ey - t.y) * f, scale: s };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { cx: e.clientX, cy: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    const { cx, cy, tx, ty } = panStart.current;
    setTransform((t) => ({ ...t, x: tx + e.clientX - cx, y: ty + e.clientY - cy }));
  }, [isPanning]);

  const onMouseUp = useCallback(() => { setIsPanning(false); panStart.current = null; }, []);

  const selectedSector = useMemo(
    () => sectors.find((s) => s.sector_id === selectedSectorId) ?? null,
    [sectors, selectedSectorId]
  );

  const isLoading = clustersLoading || sectorsLoading;

  // ─── Render ───────────────────────────────────────────────────────────────────

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
              {visibleSectors.length} sectors · {gates.length} gates · {highways.length} highways
            </p>
          </div>
        </div>
        <button
          onClick={() => { hasAutoFit.current = false; fitView(); hasAutoFit.current = true; }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded hover:bg-muted/40 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: "hidden", position: "relative", background: "#06060e" }}
          onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          className={isPanning ? "cursor-grabbing" : "cursor-grab"}
          onClick={() => setSelectedSectorId(null)}
        >
          {isLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
              Loading map…
            </div>
          )}

          <svg width="100%" height="100%" style={{ display: "block", position: "absolute", inset: 0 }}>
            <g transform={`translate(${transform.x.toFixed(2)},${transform.y.toFixed(2)}) scale(${transform.scale.toFixed(4)})`}>

              {/* ── Background hex grid ── */}
              {showGrid && bgGrid.map(([cx, cy], i) => (
                <polygon key={`bg-${i}`}
                  points={hexPoints(cx, cy, hexSize)}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth={0.6}
                  style={{ pointerEvents: "none" }}
                />
              ))}

              {/* ── Superhighway lines ── */}
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
                
                const stroke = isLocal ? "#6366f1" : "#4aaeff"; // Indigo for local, cyan for super
                const baseScreenStroke = isLocal ? 1.0 : 2.0;
                const screenStroke = Math.max(0.5, Math.min(6, baseScreenStroke * Math.pow(transform.scale, 0.7)));
                const strokeWidth = screenStroke / transform.scale;
                
                const opacity = isLocal ? 0.6 : 0.8;
                
                const showIcons = transform.scale > 1.5 && !isLocal;
                const showAnimation = transform.scale > 2.0;
                const screenPixelSize = Math.max(8, Math.min(32, 16 * Math.pow(transform.scale, 0.6)));
                const iconSize = screenPixelSize / transform.scale;
                const dotSize = Math.max(1.5, 4 / transform.scale);
                
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
                
                return (
                  <g key={`hw-${hw.from_zone_id}-${hw.to_zone_id}`}>
                    <line
                      x1={l1[0]} y1={l1[1]} x2={l2[0]} y2={l2[1]}
                      stroke={stroke} strokeWidth={strokeWidth} opacity={showAnimation ? opacity * 0.2 : opacity * 0.6} />
                    {showAnimation && (
                      <line
                        x1={l1[0]} y1={l1[1]} x2={l2[0]} y2={l2[1]}
                        stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={isLocal ? `6 ${lineLen}` : "3 6"} opacity={opacity * 1.5}>
                        <animate attributeName="stroke-dashoffset" from="0" to={isLocal ? -lineLen : -9} dur={isLocal ? "2s" : "0.5s"} repeatCount="indefinite" />
                      </line>
                    )}
                    {showIcons ? (
                      <>
                        <ConnectionIcon x={p1[0]} y={p1[1]} iconPath="mapob_superhighway.png" color={stroke} size={iconSize} />
                        <ConnectionIcon x={p2[0]} y={p2[1]} iconPath="mapob_superhighway.png" color={stroke} size={iconSize} />
                      </>
                    ) : (
                      <>
                        <circle cx={p1[0]} cy={p1[1]} r={dotSize} fill={stroke} />
                        <circle cx={p2[0]} cy={p2[1]} r={dotSize} fill={stroke} />
                      </>
                    )}
                  </g>
                );
              })}

              {/* ── Gate lines ── */}
              {showGates && gates.map((g) => {
                const z1 = zoneMap.get(g.from_zone_id), z2 = zoneMap.get(g.to_zone_id);
                if (!z1?.sector_id || !z2?.sector_id || z1.sector_id === z2.sector_id) return null;
                if (!visibleSectorIds.has(z1.sector_id) || !visibleSectorIds.has(z2.sector_id)) return null;
                const p1 = zoneScreenPos.get(g.from_zone_id) ?? sectorCoords.get(z1.sector_id);
                const p2 = zoneScreenPos.get(g.to_zone_id) ?? sectorCoords.get(z2.sector_id);
                if (!p1 || !p2) return null;
                const isAccelerator = g.kind === "accelerator";
                const stroke = isAccelerator ? "#fcd34d" : "#64748b"; // Yellow for accelerator, Slate for warp gate
                
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
                
                return (
                  <g key={`gate-${g.from_zone_id}-${g.to_zone_id}`}>
                    <line
                      x1={l1[0]} y1={l1[1]} x2={l2[0]} y2={l2[1]}
                      stroke={stroke} strokeWidth={strokeWidth} opacity={showAnimation ? baseOpacity : baseOpacity * 0.7}>
                      {showAnimation && (
                        <animate attributeName="opacity" values={animVals} dur={dur} repeatCount="indefinite" />
                      )}
                    </line>
                    {showIcons ? (
                      <>
                        <ConnectionIcon x={p1[0]} y={p1[1]} iconPath={iconPath} color={stroke} size={iconSize} />
                        <ConnectionIcon x={p2[0]} y={p2[1]} iconPath={iconPath} color={stroke} size={iconSize} />
                      </>
                    ) : (
                      <>
                        <circle cx={p1[0]} cy={p1[1]} r={dotSize} fill={stroke} opacity={0.6} />
                        <circle cx={p2[0]} cy={p2[1]} r={dotSize} fill={stroke} opacity={0.6} />
                      </>
                    )}
                  </g>
                );
              })}

              {/* ── Sector hexagons ── */}
              {visibleSectors.map((sector) => {
                const pos = sectorCoords.get(sector.sector_id);
                if (!pos) return null;
                const [cx, cy] = pos;

                const ownerFaction = sector.owner_faction ? factionMap.get(sector.owner_faction) : null;
                const cluster = sector.cluster_id ? clusterMap.get(sector.cluster_id) : null;
                const clusterFaction = cluster?.owner_faction ? factionMap.get(cluster.owner_faction) : null;
                const effectiveFaction = ownerFaction ?? clusterFaction;
                const color = showFactionColors ? (effectiveFaction?.color_hex ?? "#2d3748") : "#2d3748";

                const siblings = sector.cluster_id ? sectors.filter((s) => s.cluster_id === sector.cluster_id) : [sector];
                const isSubSector = siblings.length > 1;
                const renderedHexSize = isSubSector ? hexSize * 0.5 : hexSize;

                const isSelected = sector.sector_id === selectedSectorId;
                const isHovered = sector.sector_id === hoveredSectorId;

                const clusterRes = sector.cluster_id
                  ? (resourcesByCluster.get(sector.cluster_id) ?? new Set<string>())
                  : new Set<string>();
                const activeRes = RESOURCE_ORDER.filter((r) => clusterRes.has(r));

                const fontSize = Math.max(3, Math.min(16, (renderedHexSize * 0.28) / Math.pow(transform.scale, 0.6)));
                const dotR = Math.max(1.5, Math.min(4, (renderedHexSize * 0.085) / Math.pow(transform.scale, 0.5)));
                const dotSpacing = dotR * 2.5;

                return (
                  <g key={sector.sector_id} style={{ cursor: "pointer" }}
                    onClick={(e) => { e.stopPropagation(); setSelectedSectorId(sector.sector_id === selectedSectorId ? null : sector.sector_id); }}
                    onMouseEnter={() => setHoveredSectorId(sector.sector_id)}
                    onMouseLeave={() => setHoveredSectorId(null)}>

                    <polygon points={hexPoints(cx, cy, renderedHexSize)}
                      fill={isSelected ? `${color}40` : `${color}2a`}
                      stroke={isSelected ? "#ffffff" : isHovered ? color : `${color}80`}
                      strokeWidth={isSelected ? 2 : 1.2} />

                    {showResources && activeRes.length > 0 && (
                      <g transform={`translate(${cx - ((activeRes.length - 1) * dotSpacing) / 2},${cy + fontSize * 1.5})`}>
                        {activeRes.map((r, i) => (
                          <circle key={r} cx={i * dotSpacing} cy={0} r={dotR}
                            fill={RESOURCE_COLORS[r] ?? "#888"} opacity={0.9}
                            style={{ pointerEvents: "none" }} />
                        ))}
                      </g>
                    )}

                    <foreignObject
                      x={cx - renderedHexSize * 1.25}
                      y={cy - fontSize * 3}
                      width={renderedHexSize * 2.5}
                      height={fontSize * 6}
                      style={{ pointerEvents: "none", userSelect: "none", overflow: "visible" }}
                    >
                      <div style={{
                        width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <span style={{
                          backgroundColor: 'rgba(15, 23, 42, 0.85)',
                          padding: `${fontSize * 0.15}px ${fontSize * 0.4}px`,
                          borderRadius: `${fontSize * 0.3}px`,
                          color: 'rgba(255,255,255,0.85)',
                          fontSize: `${fontSize * 0.9}px`,
                          fontWeight: 500,
                          textAlign: 'center',
                          lineHeight: 1.1,
                          boxShadow: `0 0 ${fontSize * 0.3}px rgba(0,0,0,0.5)`,
                          border: `${Math.max(1, fontSize * 0.05)}px solid rgba(148, 163, 184, 0.2)`
                        }}>
                          {sectorDisplayName(sector)}
                        </span>
                      </div>
                    </foreignObject>


                  </g>
                );
              })}
            </g>
          </svg>

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

        {/* Right panel */}
        <aside style={{ width: 236, flexShrink: 0, borderLeft: "1px solid hsl(var(--border))", display: "flex", flexDirection: "column", overflowY: "auto" }}
          className="bg-card">
          {selectedSector ? (
            <SectorDetailPanel
              sector={selectedSector}
              cluster={selectedSector.cluster_id ? clusterMap.get(selectedSector.cluster_id) ?? null : null}
              resources={selectedSector.cluster_id ? (resourcesByCluster.get(selectedSector.cluster_id) ?? new Set()) : new Set()}
              factionMap={factionMap}
              showFactionColors={showFactionColors}
              onClose={() => setSelectedSectorId(null)}
            />
          ) : (
            <ControlPanel
              allDlcs={allDlcs}
              activeDlcs={enabledDlcs}
              showResources={showResources}
              showGates={showGates}
              showHighways={showHighways}
              showLocalHighways={showLocalHighways}
              showFactionColors={showFactionColors}
              showGrid={showGrid}
              onToggleResources={setShowResources}
              onToggleGates={setShowGates}
              onToggleHighways={setShowHighways}
              onToggleLocalHighways={setShowLocalHighways}
              onToggleFactionColors={setShowFactionColors}
              onToggleGrid={setShowGrid}
              onToggleDlc={(dlc, on) => {
                setActiveDlcs((prev) => {
                  const current = new Set(prev ?? allDlcs);
                  if (on) current.add(dlc); else current.delete(dlc);
                  return current.size === allDlcs.length ? null : current;
                });
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// ─── SectorDetailPanel ────────────────────────────────────────────────────────

function SectorDetailPanel({ sector, cluster, resources, factionMap, showFactionColors, onClose }: {
  sector: Sector; cluster: Cluster | null; resources: Set<string>;
  factionMap: Map<string, FactionSummary>; showFactionColors: boolean; onClose: () => void;
}) {
  const faction = sector.owner_faction ? factionMap.get(sector.owner_faction) : null;
  const clusterFaction = cluster?.owner_faction ? factionMap.get(cluster.owner_faction) : null;
  const effectiveFaction = faction ?? clusterFaction;
  const color = showFactionColors ? (effectiveFaction?.color_hex ?? null) : null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start">
        ← Back
      </button>
      <div>
        <div className="flex items-center gap-2 mb-1">
          {color && <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />}
          <span className="font-bold text-sm">{sectorDisplayName(sector)}</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {effectiveFaction && <p style={{ color: color ?? undefined }}>{effectiveFaction.name}</p>}
          {cluster && (
            <p>System: <span className="text-foreground">
              {cluster.name && !cluster.name.startsWith("{")
                ? cluster.name
                : (cluster.macro_id ?? cluster.cluster_id).replace(/_macro$/i, "").replace(/_/g, " ")}
            </span></p>
          )}
          {sector.dlc && <p>DLC: <span className="text-foreground">{dlcLabel(sector.dlc)}</span></p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([["Econ", sector.economy], ["Sec", sector.security], ["Sun", sector.sunlight]] as [string, number | null][])
          .filter(([, v]) => v != null).map(([label, v]) => (
            <div key={label} className="text-center p-2 rounded bg-muted/20">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-bold tabular-nums">{(v! * 100).toFixed(0)}%</p>
            </div>
          ))}
      </div>
      {sector.tags?.includes("anarchy") && (
        <div className="text-xs px-2 py-1 rounded bg-orange-900/30 text-orange-400">Anarchy zone</div>
      )}
      {resources.size > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Resources</p>
          <div className="flex flex-wrap gap-1.5">
            {RESOURCE_ORDER.filter((r) => resources.has(r)).map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                style={{ background: `${RESOURCE_COLORS[r]}22`, color: RESOURCE_COLORS[r], border: `1px solid ${RESOURCE_COLORS[r]}55` }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground/30 break-all mt-auto">{sector.sector_id}</p>
    </div>
  );
}

// ─── ControlPanel ─────────────────────────────────────────────────────────────

function ControlPanel({
  allDlcs, activeDlcs, showResources, showGates, showHighways, showLocalHighways, showFactionColors, showGrid,
  onToggleResources, onToggleGates, onToggleHighways, onToggleLocalHighways, onToggleFactionColors, onToggleGrid, onToggleDlc,
}: {
  allDlcs: string[]; activeDlcs: Set<string>;
  showResources: boolean; showGates: boolean; showHighways: boolean; showLocalHighways: boolean; showFactionColors: boolean; showGrid: boolean;
  onToggleResources: (v: boolean) => void; onToggleGates: (v: boolean) => void;
  onToggleHighways: (v: boolean) => void; onToggleLocalHighways: (v: boolean) => void; onToggleFactionColors: (v: boolean) => void;
  onToggleGrid: (v: boolean) => void; onToggleDlc: (dlc: string, on: boolean) => void;
}) {
  return (
    <div className="p-4 flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Resources</p>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
          {RESOURCE_ORDER.map((r) => (
            <div key={r} className="flex items-center gap-1.5 text-xs">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RESOURCE_COLORS[r] }} />
              <span className="text-muted-foreground capitalize">{r}</span>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Overlays</p>
        <div className="space-y-2">
          {([
            ["Faction Colors", showFactionColors, onToggleFactionColors],
            ["Resources", showResources, onToggleResources],
            ["Gates", showGates, onToggleGates],
            ["Superhighways", showHighways, onToggleHighways],
            ["Local Highways", showLocalHighways, onToggleLocalHighways],
            ["Hex Grid", showGrid, onToggleGrid],
          ] as [string, boolean, (v: boolean) => void][]).map(([label, checked, setter]) => (
            <label key={label} className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
              <input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} className="w-3 h-3 accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </div>
      {allDlcs.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">DLC</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
              <input type="checkbox" checked disabled className="w-3 h-3" />
              Base Game
            </label>
            {allDlcs.map((dlc) => (
              <label key={dlc} className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                <input type="checkbox" checked={activeDlcs.has(dlc)}
                  onChange={(e) => onToggleDlc(dlc, e.target.checked)} className="w-3 h-3 accent-primary" />
                {dlcLabel(dlc)}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground/40 space-y-0.5 mt-auto pt-4 border-t border-border">
        <p>Scroll · zoom</p>
        <p>Drag · pan</p>
        <p>Click hex · details</p>
      </div>
    </div>
  );
}
