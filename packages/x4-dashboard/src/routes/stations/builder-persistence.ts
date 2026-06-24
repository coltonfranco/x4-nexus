/**
 * Persistence layer for the station builder: serialization + React Query data hooks
 * over the `/api/v1/builder/stations` endpoints (the standalone appdata.db).
 *
 * Only references + layout are stored (module_id, canvas position, handle positions,
 * edges). Live module fields are rehydrated from the catalog on load — so a saved
 * design stays current as game data changes, and rows stay small. The hydration step
 * itself lives in builder.tsx because it needs the component's callbacks/closures.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dagre from "@dagrejs/dagre";
import { ModuleSummary, isModuleLicenceLocked } from "./modules";

export type NodeAlignment = 'distributed' | 'right' | 'bottom';

// --- DTOs (mirror the API wire models) -------------------------------------------

export type StationNodeDTO = {
  node_id: string;
  module_id: string;
  pos_x: number;
  pos_y: number;
  handle_positions: string | null; // JSON of node.data.handlePositions
};

export type StationEdgeDTO = {
  edge_id: string;
  source: string;
  target: string;
  source_handle: string | null;
  target_handle: string | null;
};

export type BuilderStationSummary = {
  id: string;
  name: string;
  notes: string | null;
  grid_mode: boolean;
  source_kind: string;
  source_ref: string | null;
  node_count: number;
  edge_count: number;
  created_at: string;
  updated_at: string;
};

export type BuilderStationDetail = {
  id: string;
  name: string;
  notes: string | null;
  grid_mode: boolean;
  source_kind: string;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  nodes: StationNodeDTO[];
  edges: StationEdgeDTO[];
};

export type BuilderStationInput = {
  name: string;
  notes?: string | null;
  grid_mode: boolean;
  source_kind?: string;
  source_ref?: string | null;
  nodes: StationNodeDTO[];
  edges: StationEdgeDTO[];
};

// --- Phase II: import an in-game station ------------------------------------------

export type StationLayoutEntry = {
  entry_id: string;
  entry_index: number | null;
  predecessor_index: number | null;
  module_id: string | null; // macro → catalog module_id
  name: string | null;
  kind: string | null;
  pos_x: number | null;
  pos_y: number | null;
  pos_z: number | null;
};

export type LiveStationLite = {
  station_id: string;
  name: string | null;
  code: string | null;
  sector_id: string | null;
  module_count: number | null;
};

// --- Serialization ---------------------------------------------------------------

// Structural minimums we read off a node/edge — avoids coupling to ModuleNodeData.
type SerializableNode = {
  id: string;
  position: { x: number; y: number };
  data: { summary: { module_id: string }; handlePositions?: Record<string, unknown> };
};
type SerializableEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

export function serializeNodes(nodes: SerializableNode[]): StationNodeDTO[] {
  return nodes.map((n) => ({
    node_id: n.id,
    module_id: n.data.summary.module_id,
    pos_x: n.position.x,
    pos_y: n.position.y,
    handle_positions: n.data.handlePositions ? JSON.stringify(n.data.handlePositions) : null,
  }));
}

export function serializeEdges(edges: SerializableEdge[]): StationEdgeDTO[] {
  return edges.map((e) => ({
    edge_id: e.id,
    source: e.source,
    target: e.target,
    source_handle: e.sourceHandle ?? null,
    target_handle: e.targetHandle ?? null,
  }));
}

/**
 * Stable string fingerprint of the current design, used for dirty-tracking. Two
 * designs with identical name + node/edge content (positions, handles, connections)
 * produce the same signature — so undoing back to the saved state reads as clean.
 */
export function designSignature(
  nodes: SerializableNode[],
  edges: SerializableEdge[],
  name: string,
): string {
  return JSON.stringify({ name, nodes: serializeNodes(nodes), edges: serializeEdges(edges) });
}

/**
 * Recompute the lock reason for a module given the player's licences — the single
 * source of truth shared by drop/add/load and the licence-change effect in builder.tsx.
 */
export function computeLockReason(
  m: ModuleSummary,
  licenceSet: Set<string>,
  anyLicenceSet: Set<string>,
): string | undefined {
  const isFreeDefault = !m.blueprint_price_avg && m.is_obtainable;
  const licenceLocked = isModuleLicenceLocked(m.makerrace, m.restriction_licence, licenceSet, anyLicenceSet);
  if (licenceLocked && !m.has_blueprint && !isFreeDefault) {
    return "Missing blueprint and required faction licence.";
  }
  if (licenceLocked) return "Missing required faction licence.";
  if (!m.has_blueprint && !isFreeDefault) return "Missing blueprint.";
  return undefined;
}

// --- React Query data hooks ------------------------------------------------------

const LIST_KEY = ["builder-stations"] as const;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function useBuilderStationList() {
  return useQuery<BuilderStationSummary[]>({
    queryKey: LIST_KEY,
    queryFn: () => fetch("/api/v1/builder/stations").then((r) => json<BuilderStationSummary[]>(r)),
  });
}

export function fetchBuilderStation(id: string): Promise<BuilderStationDetail> {
  return fetch(`/api/v1/builder/stations/${id}`).then((r) => json<BuilderStationDetail>(r));
}

export function usePlayerStations() {
  return useQuery<LiveStationLite[]>({
    queryKey: ["player-stations"],
    queryFn: () =>
      fetch("/api/v1/stations?player_only=true&limit=2000").then((r) => json<LiveStationLite[]>(r)),
    staleTime: 60_000,
  });
}

export function fetchStationLayout(stationId: string): Promise<StationLayoutEntry[]> {
  return fetch(`/api/v1/stations/${stationId}/layout`).then((r) => json<StationLayoutEntry[]>(r));
}

// Import layout uses the connection graph, not the save's 3D coordinates: the builder is a
// 2D top-down view, so projecting raw positions stacks Y-aligned modules and makes edges cross
// everything. dagre lays the predecessor graph out as compact top-down layers (parent above
// child). We then *move* each connection dot to sit where its neighbour is (children spread
// along the parent's bottom edge in left-to-right order, each child receiving on its top edge)
// so the lines fan out without crossing, never double-book a point, and light up green.
const IMPORT_NODE_PX = 128; // builder module node is 128×128
const GRID_PX = 16; // builder grid; positions are snapped to it
const HANDLE_MARGIN = 12; // keep dots this many % off a node edge's corners

type HandleSide = "top" | "right" | "bottom" | "left";

type HandleSpec = { pos: HandleSide; left?: string; top?: string };

/** One end of an edge as seen from a node: which side it leaves on, ordered by neighbour pos. */
type EdgeEnd = { edgeIndex: number; role: "source" | "target"; side: HandleSide; order: number };

/**
 * Transform an in-game station's construction layout into a builder design (nodes + edges),
 * shaped as a BuilderStationDetail so the builder's existing loader can consume it directly.
 *
 * Modules are laid out by dagre over the predecessor graph; connection dots are repositioned so
 * each edge attaches where its neighbour sits (see `assignHandles`). `snapPointsByModule` caps
 * how many dots a module has. Modules with no catalog macro are skipped; an edge whose parent
 * was skipped drops out.
 *
 * The returned object is unsaved (empty id); source_kind='imported' + source_ref record
 * provenance so saving forks it into an editable design.
 */
export function layoutToDesign(
  entries: StationLayoutEntry[],
  name: string,
  sourceStationId: string,
  snapPointsByModule: Map<string, number>,
  nodeAlignment: NodeAlignment = 'distributed'
): BuilderStationDetail {
  const placed = entries.filter((e) => e.module_id);
  const byIndex = new Map<number, string>();
  for (const e of placed) if (e.entry_index != null) byIndex.set(e.entry_index, e.entry_id);

  // Resolve predecessor links into parent→child edges (skip self/unresolved parents).
  const rawEdges = placed
    .filter((e) => e.predecessor_index != null)
    .map((e) => ({ target: e.entry_id, source: byIndex.get(e.predecessor_index!) }))
    .filter((e): e is { target: string; source: string } => !!e.source && e.source !== e.target)
    // Stable order keeps handle assignment deterministic across re-imports.
    .sort((a, b) => a.target.localeCompare(b.target));

  // --- Layout: dagre layered graph, snapped to the builder grid. ---
  const g = new dagre.graphlib.Graph();
  const rankdir = nodeAlignment === 'right' ? 'LR' : 'TB';
  g.setGraph({ rankdir, nodesep: 40, ranksep: 64, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const e of placed) g.setNode(e.entry_id, { width: IMPORT_NODE_PX, height: IMPORT_NODE_PX });
  for (const e of rawEdges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const centre = (id: string) => {
    const n = g.node(id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const { edgeHandles, handlesByNode } = assignHandles(rawEdges, centre, snapPointsByModule, placed, nodeAlignment);

  const snap = (v: number) => Math.round(v / GRID_PX) * GRID_PX;
  const nodes: StationNodeDTO[] = placed.map((e) => {
    const c = centre(e.entry_id);
    const hp = handlesByNode.get(e.entry_id);
    return {
      node_id: e.entry_id,
      module_id: e.module_id!,
      // dagre gives centres; the builder positions by top-left corner.
      pos_x: snap(c.x - IMPORT_NODE_PX / 2),
      pos_y: snap(c.y - IMPORT_NODE_PX / 2),
      handle_positions: hp ? JSON.stringify(hp) : null,
    };
  });

  const edges: StationEdgeDTO[] = rawEdges.map((e, i) => ({
    edge_id: `imp-${e.target}`,
    source: e.source,
    target: e.target,
    source_handle: edgeHandles[i].source,
    target_handle: edgeHandles[i].target,
  }));

  const now = new Date().toISOString();
  return {
    id: "",
    name,
    notes: null,
    grid_mode: true, // imported layouts snap to the grid by default
    source_kind: "imported",
    source_ref: sourceStationId,
    created_at: now,
    updated_at: now,
    nodes,
    edges,
  };
}

/**
 * Pick a distinct connection dot for every edge end and place it on the node edge facing its
 * neighbour: children leave the parent's bottom edge, parents are met on the child's top edge,
 * and dots on the same side are spread out in neighbour order so the lines never cross. Returns
 * per-edge handle ids and per-node custom handle positions (capped at each module's snap points).
 */
function assignHandles(
  rawEdges: { source: string; target: string }[],
  centre: (id: string) => { x: number; y: number },
  snapPointsByModule: Map<string, number>,
  placed: StationLayoutEntry[],
  nodeAlignment: NodeAlignment
): {
  edgeHandles: { source: string | null; target: string | null }[];
  handlesByNode: Map<string, Record<string, HandleSpec>>;
} {
  const moduleOf = new Map(placed.map((e) => [e.entry_id, e.module_id!]));

  // Collect each node's edge ends, choosing the side from the neighbour's vertical position.
  const endsByNode = new Map<string, EdgeEnd[]>();
  const add = (nodeId: string, end: EdgeEnd) => {
    const arr = endsByNode.get(nodeId);
    if (arr) arr.push(end);
    else endsByNode.set(nodeId, [end]);
  };
  rawEdges.forEach((e, edgeIndex) => {
    const s = centre(e.source);
    const t = centre(e.target);
    
    let sourceSide: HandleSide;
    let targetSide: HandleSide;
    let sourceOrder: number;
    let targetOrder: number;

    if (nodeAlignment === 'right') {
      const childRight = t.x >= s.x;
      sourceSide = childRight ? 'right' : 'left';
      targetSide = childRight ? 'left' : 'right';
      sourceOrder = t.y; // spread vertically based on neighbour
      targetOrder = s.y;
    } else {
      // For both 'bottom' and 'distributed', layout is top-to-bottom.
      // Child is the lower node. Parent emits from its bottom, child receives on its top.
      const childBelow = t.y >= s.y;
      sourceSide = childBelow ? 'bottom' : 'top';
      targetSide = childBelow ? 'top' : 'bottom';
      sourceOrder = t.x; // spread horizontally
      targetOrder = s.x;
    }

    add(e.source, { edgeIndex, role: "source", side: sourceSide, order: sourceOrder });
    add(e.target, { edgeIndex, role: "target", side: targetSide, order: targetOrder });
  });

  const edgeHandles = rawEdges.map(() => ({ source: null as string | null, target: null as string | null }));
  const handlesByNode = new Map<string, Record<string, HandleSpec>>();

  const preferredSide = nodeAlignment === 'right' ? 'right' : nodeAlignment === 'bottom' ? 'bottom' : null;

  for (const [nodeId, ends] of endsByNode) {
    const cap = snapPointsByModule.get(moduleOf.get(nodeId) ?? "") ?? 0;
    const hp: Record<string, HandleSpec> = {};
    let nextId = 0;

    if (preferredSide) {
      const oppSide = preferredSide === 'right' ? 'left' : 'top';
      const oppGroup = ends.filter((en) => en.side === oppSide).sort((a, b) => a.order - b.order);
      const prefGroup = ends.filter((en) => en.side === preferredSide).sort((a, b) => a.order - b.order);
      
      const N_opp = oppGroup.length;
      const N_pref = Math.max(prefGroup.length, cap - N_opp);
      
      // 1. Assign and space connected handles on the opposite side
      oppGroup.forEach((en, j) => {
        if (nextId >= cap) return;
        const id = `p-${nextId++}`;
        const pct = N_opp === 1 ? 50 : (100 / (N_opp + 1)) * (j + 1);
        hp[id] =
          oppSide === "top" || oppSide === "bottom"
            ? { pos: oppSide, left: `${Math.round(pct)}%` }
            : { pos: oppSide, top: `${Math.round(pct)}%` };
        if (en.role === "source") edgeHandles[en.edgeIndex].source = id;
        else edgeHandles[en.edgeIndex].target = id;
      });

      // 2. Assign and space ALL remaining handles on the preferred side (connected + unconnected)
      const E = prefGroup.length;
      const c = centre(nodeId);
      const handlePcts = Array.from({ length: N_pref }, (_, j) => N_pref === 1 ? 50 : (100 / (N_pref + 1)) * (j + 1));
      
      const ideals = prefGroup.map(en => {
        const diff = en.order - (preferredSide === 'top' || preferredSide === 'bottom' ? c.x : c.y);
        if (Math.abs(diff) < 5) return 50;
        return diff < 0 ? 0 : 100;
      });

      const dp = Array.from({ length: E + 1 }, () => Array(N_pref + 1).fill(Infinity));
      const choice = Array.from({ length: E + 1 }, () => Array(N_pref + 1).fill(-1));
      for (let j = 0; j <= N_pref; j++) dp[0][j] = 0;
      
      for (let i = 1; i <= E; i++) {
        for (let j = i; j <= N_pref; j++) {
          const costTake = dp[i - 1][j - 1] + Math.abs(handlePcts[j - 1] - ideals[i - 1]);
          const costSkip = dp[i][j - 1];
          if (costTake < costSkip) {
            dp[i][j] = costTake;
            choice[i][j] = j - 1;
          } else {
            dp[i][j] = costSkip;
            choice[i][j] = choice[i][j - 1];
          }
        }
      }
      
      const chosenHandles = new Set<number>();
      let currI = E;
      let currJ = N_pref;
      while (currI > 0 && currJ > 0) {
        const handleIdx = choice[currI][currJ];
        chosenHandles.add(handleIdx);
        currI--;
        currJ = handleIdx;
      }
      
      let assignedCount = 0;
      for (let j = 0; j < N_pref; j++) {
        if (nextId >= cap) break;
        const id = `p-${nextId++}`;
        const pct = handlePcts[j];
        hp[id] =
          preferredSide === "top" || preferredSide === "bottom"
            ? { pos: preferredSide, left: `${Math.round(pct)}%` }
            : { pos: preferredSide, top: `${Math.round(pct)}%` };
        
        if (chosenHandles.has(j)) {
          const en = prefGroup[assignedCount++];
          if (en.role === "source") edgeHandles[en.edgeIndex].source = id;
          else edgeHandles[en.edgeIndex].target = id;
        }
      }
    } else {
      // Distributed mode: calculate spacing dynamically to avoid weird transpositions
      const sides: HandleSide[] = ["top", "bottom", "left", "right"];
      for (const side of sides) {
        const group = ends.filter((en) => en.side === side).sort((a, b) => a.order - b.order);
        group.forEach((en, j) => {
          if (nextId >= cap) return; // safety: degree ≤ snap points, so this shouldn't trigger
          const id = `p-${nextId++}`;
          const pct = HANDLE_MARGIN + ((100 - 2 * HANDLE_MARGIN) * (j + 1)) / (group.length + 1);
          hp[id] =
            side === "top" || side === "bottom"
              ? { pos: side, left: `${Math.round(pct)}%` }
              : { pos: side, top: `${Math.round(pct)}%` };
          
          if (en.role === "source") edgeHandles[en.edgeIndex].source = id;
          else edgeHandles[en.edgeIndex].target = id;
        });
      }
    }
    if (Object.keys(hp).length) handlesByNode.set(nodeId, hp);
  }

  return { edgeHandles, handlesByNode };
}

export function useBuilderStationMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: LIST_KEY });

  const create = useMutation({
    mutationFn: (body: BuilderStationInput) =>
      fetch("/api/v1/builder/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => json<BuilderStationDetail>(r)),
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: BuilderStationInput }) =>
      fetch(`/api/v1/builder/stations/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => json<BuilderStationDetail>(r)),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/builder/stations/${id}`, { method: "DELETE" }).then((r) => {
        if (!r.ok && r.status !== 204) throw new Error(`Delete failed (${r.status})`);
      }),
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

import type { Node, Edge } from "reactflow";

/**
 * Re-run the Dagre layout on the current graph and update positions & handles.
 * Leaves the graph visually neat and fully routed based on the chosen alignment.
 */
export function autoLayoutGraph(
  nodes: Node<any>[],
  edges: Edge<any>[],
  nodeAlignment: NodeAlignment
): { nodes: Node<any>[]; edges: Edge<any>[] } {
  const byIndex = new Map<number, string>();
  const placed = nodes.map((n, i) => {
    byIndex.set(i, n.id);
    return { entry_id: n.id, module_id: n.data?.summary?.module_id || null };
  });

  const rawEdges = edges.map((e) => ({ source: e.source, target: e.target }));

  const g = new dagre.graphlib.Graph();
  const rankdir = nodeAlignment === 'right' ? 'LR' : 'TB';
  g.setGraph({ rankdir, nodesep: 40, ranksep: 64, marginx: 32, marginy: 32 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const e of placed) g.setNode(e.entry_id, { width: IMPORT_NODE_PX, height: IMPORT_NODE_PX });
  for (const e of rawEdges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  const centre = (id: string) => {
    const n = g.node(id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  };

  const snapPointsByModule = new Map<string, number>();
  for (const n of nodes) {
    if (n.data?.summary?.module_id) {
      snapPointsByModule.set(n.data.summary.module_id, Number(n.data.summary.snap_points || 1));
    }
  }

  const { edgeHandles, handlesByNode } = assignHandles(rawEdges, centre, snapPointsByModule, placed, nodeAlignment);

  const snap = (v: number) => Math.round(v / GRID_PX) * GRID_PX;
  const nextNodes = nodes.map((n) => {
    const c = centre(n.id);
    const hp = handlesByNode.get(n.id);
    return {
      ...n,
      position: { x: snap(c.x - IMPORT_NODE_PX / 2), y: snap(c.y - IMPORT_NODE_PX / 2) },
      data: { ...n.data, handlePositions: hp || {} },
    };
  });

  const nextEdges = edges.map((e, i) => {
    const eh = edgeHandles[i];
    return { ...e, sourceHandle: eh.source, targetHandle: eh.target };
  });

  return { nodes: nextNodes, edges: nextEdges };
}

/**
 * Re-calculate only the edge handles (green lines) based on current node visual positions.
 * This does not move any modules. It just straightens out the tangled lines.
 */
export function autoRouteHandles(
  nodes: Node<any>[],
  edges: Edge<any>[],
  nodeAlignment: NodeAlignment
): { nodes: Node<any>[]; edges: Edge<any>[] } {
  const placed = nodes.map((n) => ({ entry_id: n.id, module_id: n.data?.summary?.module_id || null }));
  const rawEdges = edges.map((e) => ({ source: e.source, target: e.target }));

  const centre = (id: string) => {
    const n = nodes.find((n) => n.id === id);
    // Add half the node width/height to get the visual center
    return n ? { x: n.position.x + IMPORT_NODE_PX / 2, y: n.position.y + IMPORT_NODE_PX / 2 } : { x: 0, y: 0 };
  };

  const snapPointsByModule = new Map<string, number>();
  for (const n of nodes) {
    if (n.data?.summary?.module_id) {
      snapPointsByModule.set(n.data.summary.module_id, Number(n.data.summary.snap_points || 1));
    }
  }

  const { edgeHandles, handlesByNode } = assignHandles(rawEdges, centre, snapPointsByModule, placed, nodeAlignment);

  const nextNodes = nodes.map((n) => {
    const hp = handlesByNode.get(n.id);
    return {
      ...n,
      data: { ...n.data, handlePositions: hp || {} },
    };
  });

  const nextEdges = edges.map((e, i) => {
    const eh = edgeHandles[i];
    return { ...e, sourceHandle: eh.source, targetHandle: eh.target };
  });

  return { nodes: nextNodes, edges: nextEdges };
}

