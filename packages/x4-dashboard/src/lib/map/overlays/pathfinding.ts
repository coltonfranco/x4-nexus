// Shortest-path search over the sector connection graph (gates + highways).
//
// Edges are unweighted: we optimise for fewest jumps, which is what a player picking
// a route actually wants. The graph is small (~300 sectors) so BFS is instant.

import type { SectorConnection } from "../types";

export type Adjacency = Map<string, { to: string; kind: string | null }[]>;

export function buildAdjacency(connections: SectorConnection[]): Adjacency {
  const adj: Adjacency = new Map();
  const link = (a: string, b: string, kind: string | null) => {
    const list = adj.get(a) ?? [];
    list.push({ to: b, kind });
    adj.set(a, list);
  };
  connections.forEach((c) => {
    link(c.from_sector_id, c.to_sector_id, c.kind);
    link(c.to_sector_id, c.from_sector_id, c.kind);
  });
  return adj;
}

export type Path = {
  sectors: string[];
  // Edge kinds between consecutive sectors; hops = edges.length.
  edges: (string | null)[];
};

// Breadth-first search for the fewest-jump path. Returns null if unreachable.
export function findPath(adj: Adjacency, from: string, to: string): Path | null {
  if (from === to) return { sectors: [from], edges: [] };
  const prev = new Map<string, { sector: string; kind: string | null }>();
  const queue: string[] = [from];
  const seen = new Set<string>([from]);

  while (queue.length) {
    const cur = queue.shift()!;
    for (const { to: next, kind } of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, { sector: cur, kind });
      if (next === to) {
        const sectors = [to];
        const edges: (string | null)[] = [];
        let step = to;
        while (step !== from) {
          const p = prev.get(step)!;
          sectors.unshift(p.sector);
          edges.unshift(p.kind);
          step = p.sector;
        }
        return { sectors, edges };
      }
      queue.push(next);
    }
  }
  return null;
}
