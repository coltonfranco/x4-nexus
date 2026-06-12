// Shortest-path search over the detailed map graph (zones, gates, highways, sectors).
//
// Edges are weighted by approximate travel time (distance / speed). We use a basic
// Dijkstra's algorithm. The graph is small (~1000 nodes, ~5000 edges) so a simple
// array-based priority queue is plenty fast enough for instant UI updates.

import type { Gate, Highway, Zone } from "../types";

export type TravelSegmentKind = "jump_gate" | "accelerator" | "superhighway" | "localhighway" | "manual";

export type AdjacencyEdge = {
  to: string;
  kind: TravelSegmentKind;
  weight: number;
};

export type Adjacency = Map<string, AdjacencyEdge[]>;

const SPEED_MANUAL = 100;
const SPEED_LOCALHIGHWAY = 500;
const SPEED_SUPERHIGHWAY = 1500;
const SPEED_ACCELERATOR = 2000;


function dist(p1: [number, number], p2: [number, number]) {
  const dx = p1[0] - p2[0], dy = p1[1] - p2[1];
  return Math.sqrt(dx * dx + dy * dy);
}

export function buildAdjacency(
  gates: Gate[],
  highways: Highway[],
  sectors: { sector_id: string }[],
  zoneMap: Map<string, Zone>,
  zoneScreenPos: Map<string, [number, number]>,
  sectorCoords: Map<string, [number, number]>
): Adjacency {
  const adj: Adjacency = new Map();

  const link = (a: string, b: string, kind: TravelSegmentKind, weight: number) => {
    const listA = adj.get(a) ?? [];
    listA.push({ to: b, kind, weight });
    adj.set(a, listA);
    const listB = adj.get(b) ?? [];
    listB.push({ to: a, kind, weight });
    adj.set(b, listB);
  };

  // 1. Add Gate connections
  for (const g of gates) {
    const p1 = zoneScreenPos.get(g.from_zone_id);
    const p2 = zoneScreenPos.get(g.to_zone_id);
    if (!p1 || !p2) continue;
    
    const isAccelerator = g.kind === "accelerator";
    const kind = isAccelerator ? "accelerator" : "jump_gate";
    const weight = isAccelerator ? dist(p1, p2) / SPEED_ACCELERATOR : 0.001; // nearly instant
    link(`zone:${g.from_zone_id}`, `zone:${g.to_zone_id}`, kind, weight);
  }

  // 2. Add Highway connections
  for (const h of highways) {
    const p1 = zoneScreenPos.get(h.from_zone_id);
    const p2 = zoneScreenPos.get(h.to_zone_id);
    if (!p1 || !p2) continue;
    
    const isLocal = h.kind === "localhighway";
    const kind = isLocal ? "localhighway" : "superhighway";
    const weight = dist(p1, p2) / (isLocal ? SPEED_LOCALHIGHWAY : SPEED_SUPERHIGHWAY);
    link(`zone:${h.from_zone_id}`, `zone:${h.to_zone_id}`, kind, weight);
  }

  // 3. Add intra-sector manual connections
  const zonesBySector = new Map<string, string[]>();
  zoneMap.forEach((z) => {
    if (z.sector_id) {
      const list = zonesBySector.get(z.sector_id.toLowerCase()) ?? [];
      list.push(z.zone_id);
      zonesBySector.set(z.sector_id.toLowerCase(), list);
    }
  });

  sectors.forEach((s) => {
    const sid = s.sector_id.toLowerCase();
    const cPos = sectorCoords.get(sid);
    if (!cPos) return;

    const zIds = zonesBySector.get(sid) ?? [];
    
    // Zone <-> Zone manual
    for (let i = 0; i < zIds.length; i++) {
      for (let j = i + 1; j < zIds.length; j++) {
        const za = zIds[i];
        const zb = zIds[j];
        const pa = zoneScreenPos.get(za);
        const pb = zoneScreenPos.get(zb);
        if (!pa || !pb) continue;
        link(`zone:${za}`, `zone:${zb}`, "manual", dist(pa, pb) / SPEED_MANUAL);
      }
    }

    // Zone <-> Sector center manual
    for (const zId of zIds) {
      const p = zoneScreenPos.get(zId);
      if (!p) continue;
      link(`sector:${sid}`, `zone:${zId}`, "manual", dist(cPos, p) / SPEED_MANUAL);
    }
  });

  return adj;
}

export type PathResult = {
  nodes: string[];
  edges: TravelSegmentKind[];
};

export function findPath(adj: Adjacency, fromSector: string, toSector: string): PathResult | null {
  const startNode = `sector:${fromSector.toLowerCase()}`;
  const endNode = `sector:${toSector.toLowerCase()}`;

  if (startNode === endNode) return { nodes: [startNode], edges: [] };

  const dists = new Map<string, number>();
  const prev = new Map<string, { node: string; kind: TravelSegmentKind }>();
  const q = new Set<string>();

  dists.set(startNode, 0);
  q.add(startNode);

  while (q.size > 0) {
    let u = "";
    let minD = Infinity;
    for (const node of q) {
      const d = dists.get(node) ?? Infinity;
      if (d < minD) {
        minD = d;
        u = node;
      }
    }
    
    if (u === endNode) {
      break;
    }
    
    q.delete(u);
    const d_u = dists.get(u)!;

    for (const edge of adj.get(u) ?? []) {
      const v = edge.to;
      const alt = d_u + edge.weight;
      const d_v = dists.get(v) ?? Infinity;
      if (alt < d_v) {
        dists.set(v, alt);
        prev.set(v, { node: u, kind: edge.kind });
        q.add(v);
      }
    }
  }

  if (!prev.has(endNode)) return null;

  const nodes: string[] = [endNode];
  const edges: TravelSegmentKind[] = [];
  let step = endNode;
  while (step !== startNode) {
    const p = prev.get(step)!;
    nodes.unshift(p.node);
    edges.unshift(p.kind);
    step = p.node;
  }

  return { nodes, edges };
}
