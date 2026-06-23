import React, { useCallback, useState, useMemo, useEffect, memo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  Node,
  Edge,
  Connection,
  ConnectionMode,
  ReactFlowProvider,
  useReactFlow,
  reconnectEdge,
  useNodeId,
  useNodeConnections,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  EdgeProps,
  ConnectionLineType,
  useUpdateNodeInternals,
  useStore,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ModuleSummary, ModuleDetail, ModuleDetailPanel, isModuleLicenceLocked, KIND_COLORS } from "./modules";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { FactionSummary } from "../../lib/map/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EntityIcon } from "../../components/EntityIcon";
import { Currency } from "../../components/Currency";
import { ContextMenu } from "./ContextMenu";
import { useUndoRedo, useClipboard } from "./builder-hooks";
import { SearchInput } from "../../components/ui/search-input";
import { HUDCard } from "../../components/HUDCard";
import { cn } from "../../lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Switch } from "../../components/ui/switch";
import { AlertCircle, Plus, GripHorizontal, X, Settings, Undo, Redo } from "lucide-react";

export const BuilderSettingsContext = React.createContext<{ 
  gridMode: boolean; 
  setGridMode: (v: boolean) => void;
  takeSnapshot?: (nodes: Node<ModuleNodeData>[], edges: Edge[]) => void;
}>({ gridMode: false, setGridMode: () => {} });
export const useBuilderSettings = () => React.useContext(BuilderSettingsContext);

// --- Types ---
type ModuleNodeData = {
  summary: ModuleSummary;
  onClickDetail: () => void;
  onRemove?: () => void;
  lockReason?: string;
  handlePositions?: Record<string, { left?: string, top?: string, pos: Position }>;
};

const selectedCountSelector = (s: any) => s.nodes.filter((n: any) => n.selected).length + s.edges.filter((e: any) => e.selected).length;

function DraggableHandle({ id, defaultPos, defaultLeft, defaultTop, allDefaultHandles }: { id: string, defaultPos: Position, defaultLeft?: string, defaultTop?: string, allDefaultHandles: Record<string, { pos: Position, left?: string, top?: string }> }) {
  const nodeId = useNodeId();
  const { getNode, getNodes, getEdges, updateNodeData } = useReactFlow();
  const { gridMode, takeSnapshot } = useBuilderSettings();
  const defaultHandlesRef = useRef(allDefaultHandles);
  useEffect(() => { defaultHandlesRef.current = allDefaultHandles; }, [allDefaultHandles]);
  const sourceConnections = useNodeConnections({ handleId: id, handleType: 'source' });
  const targetConnections = useNodeConnections({ handleId: id, handleType: 'target' });
  const isConnected = sourceConnections.length > 0 || targetConnections.length > 0;

  const node = getNode(nodeId!) as Node<ModuleNodeData>;
  const handlePos = node?.data?.handlePositions?.[id];
  const isSelected = node?.selected;
  const selectedCount = useStore(selectedCountSelector);
  const showMoveHandle = isSelected && selectedCount === 1;
  
  const [localPos, setLocalPos] = useState(handlePos || { left: defaultLeft, top: defaultTop, pos: defaultPos });

  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(nodeId!);
  }, [localPos, nodeId, updateNodeInternals]);

  useEffect(() => {
    if (handlePos) setLocalPos(handlePos);
  }, [handlePos]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    if (takeSnapshot) {
      takeSnapshot(getNodes() as Node<ModuleNodeData>[], getEdges());
    }

    const onPointerMove = (moveEv: PointerEvent) => {
      const nodeEl = target.closest('.react-flow__node');
      if (!nodeEl) return;
      const rect = nodeEl.getBoundingClientRect();
      const x = moveEv.clientX - rect.left;
      const y = moveEv.clientY - rect.top;
      const width = rect.width;
      const height = rect.height;
      
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      
      if (dx === 0 && dy === 0) return;
      
      let tLeft = Infinity, tRight = Infinity, tTop = Infinity, tBottom = Infinity;
      if (dx !== 0) {
        const t1 = -cx / dx;
        const t2 = (width - cx) / dx;
        if (t1 > 0) tLeft = t1;
        if (t2 > 0) tRight = t2;
      }
      if (dy !== 0) {
        const t1 = -cy / dy;
        const t2 = (height - cy) / dy;
        if (t1 > 0) tTop = t1;
        if (t2 > 0) tBottom = t2;
      }
      
      const tMin = Math.min(tLeft, tRight, tTop, tBottom);
      let ix = cx + tMin * dx;
      let iy = cy + tMin * dy;
      
      let percentX = (ix / width) * 100;
      let percentY = (iy / height) * 100;
      
      let pos = Position.Top;
      if (tMin === tTop) pos = Position.Top;
      else if (tMin === tBottom) pos = Position.Bottom;
      else if (tMin === tLeft) pos = Position.Left;
      else if (tMin === tRight) pos = Position.Right;
      
      let val = pos === Position.Top || pos === Position.Bottom ? percentX : percentY;
      
      const currentData = getNode(nodeId!)?.data as ModuleNodeData;
      const combinedHandles: Record<string, any> = { ...defaultHandlesRef.current, ...(currentData?.handlePositions || {}) };
      
      const occupied = Object.entries(combinedHandles)
        .filter(([k, v]) => k !== id && v.pos === pos)
        .map(([_, v]) => pos === Position.Top || pos === Position.Bottom ? parseFloat(v.left || '50') : parseFloat(v.top || '50'));

      const step = gridMode ? 12.5 : 8;
      const threshold = gridMode ? 1 : 8;
      let targetVal = val;

      if (gridMode) {
         const nearestSnap = Math.round(val / 12.5) * 12.5;
         targetVal = nearestSnap;
         
         if (occupied.some(o => Math.abs(targetVal - o) < threshold)) {
             let dir = val >= nearestSnap ? 1 : -1;
             
             let searchVal = nearestSnap + dir * step;
             let found = false;
             while(searchVal >= 0 && searchVal <= 100) {
                 if (!occupied.some(o => Math.abs(searchVal - o) < threshold)) {
                     targetVal = searchVal;
                     found = true;
                     break;
                 }
                 searchVal += dir * step;
             }
             
             if (!found) {
                 dir = -dir;
                 searchVal = nearestSnap + dir * step;
                 while(searchVal >= 0 && searchVal <= 100) {
                     if (!occupied.some(o => Math.abs(searchVal - o) < threshold)) {
                         targetVal = searchVal;
                         break;
                     }
                     searchVal += dir * step;
                 }
             }
         }
      } else {
         let searchRadius = 0;
         targetVal = val;
         while (searchRadius <= 100) {
             if (val + searchRadius <= 100 && !occupied.some(o => Math.abs((val + searchRadius) - o) < threshold)) {
                 targetVal = val + searchRadius; break;
             }
             if (val - searchRadius >= 0 && searchRadius > 0 && !occupied.some(o => Math.abs((val - searchRadius) - o) < threshold)) {
                 targetVal = val - searchRadius; break;
             }
             searchRadius += step;
         }
      }
      
      let newPos: any = { pos };
      if (pos === Position.Top || pos === Position.Bottom) {
        newPos.top = pos === Position.Top ? '0%' : '100%';
        newPos.left = `${targetVal}%`;
      } else {
        newPos.left = pos === Position.Left ? '0%' : '100%';
        newPos.top = `${targetVal}%`;
      }

      setLocalPos(newPos);
    };

    const onPointerUp = (upEv: PointerEvent) => {
      target.releasePointerCapture(upEv.pointerId);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      
      setLocalPos((curr) => {
        const currentData = getNode(nodeId!)?.data as ModuleNodeData;
        updateNodeData(nodeId!, { 
          handlePositions: { ...(currentData.handlePositions || {}), [id]: curr } 
        });
        return curr;
      });
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  }, [id, nodeId, getNode, updateNodeData, gridMode]);

  return (
    <div 
      className="absolute z-50 group flex items-center justify-center translate-x-[-50%] translate-y-[-50%]"
      style={{
        left: localPos.left ?? (localPos.pos === Position.Left ? '0%' : localPos.pos === Position.Right ? '100%' : '50%'),
        top: localPos.top ?? (localPos.pos === Position.Top ? '0%' : localPos.pos === Position.Bottom ? '100%' : '50%'),
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {showMoveHandle && (
        <div 
          className="w-5 h-5 bg-background/80 backdrop-blur rounded shadow-sm border border-border flex items-center justify-center cursor-move absolute opacity-0 group-hover:opacity-100 transition-opacity nodrag nopan"
          style={{
            [localPos.pos === Position.Top ? 'bottom' : localPos.pos === Position.Bottom ? 'top' : localPos.pos === Position.Left ? 'right' : 'left']: '14px',
          }}
          onPointerDown={onPointerDown}
        >
          <GripHorizontal className="w-3 h-3 text-muted-foreground" />
        </div>
      )}
      <Handle
        type="source"
        position={localPos.pos}
        id={id}
        style={{ width: '12px', height: '12px', background: isConnected ? '#10b981' : 'hsl(var(--background))', border: '2px solid #10b981' }}
        isConnectable={true}
      />
    </div>
  );
}

const ModuleNodeComponent = memo(({ id: _id, data, selected }: NodeProps<Node<ModuleNodeData>>) => {
  const { summary, lockReason } = data;
  const snapPoints = summary.snap_points || 0;
  const selectedCount = useStore(selectedCountSelector);
  const showDelete = selected && selectedCount === 1;
  const { setNodes, setEdges, getNodes, getEdges } = useReactFlow();
  const { takeSnapshot } = useBuilderSettings();

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (takeSnapshot) {
      takeSnapshot(getNodes() as Node<ModuleNodeData>[], getEdges());
    }
    setNodes((ns) => ns.filter((n) => n.id !== _id));
    setEdges((es) => es.filter((e) => e.source !== _id && e.target !== _id));
  }, [_id, setNodes, setEdges, takeSnapshot, getNodes, getEdges]);

  const allDefaultHandles = useMemo(() => {
    const handlesRecord: Record<string, { pos: Position, left?: string, top?: string }> = {};
    for (let i = 0; i < snapPoints; i++) {
      const side = i % 4;
      const countOnSide = Math.ceil((snapPoints - side) / 4);
      const indexOnSide = Math.floor(i / 4);
      const offset = countOnSide === 1 ? 50 : (100 / (countOnSide + 1)) * (indexOnSide + 1);
      
      let pos = Position.Top;
      if (side === 1) pos = Position.Right;
      if (side === 2) pos = Position.Bottom;
      if (side === 3) pos = Position.Left;

      handlesRecord[`p-${i}`] = { 
        pos, 
        left: (pos === Position.Top || pos === Position.Bottom) ? `${offset}%` : undefined,
        top: (pos === Position.Left || pos === Position.Right) ? `${offset}%` : undefined
      };
    }
    return handlesRecord;
  }, [snapPoints]);

  const handles = Object.entries(allDefaultHandles).map(([id, handleData]) => (
    <DraggableHandle
      key={id}
      id={id}
      defaultPos={handleData.pos}
      defaultLeft={handleData.left}
      defaultTop={handleData.top}
      allDefaultHandles={allDefaultHandles}
    />
  ));

  return (
    <div
      className={cn("relative group w-32 h-32 bg-card border rounded-md shadow flex flex-col items-center justify-center p-2 cursor-pointer transition-colors", selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/50")}
    >
      {showDelete && (
        <button 
          onClick={handleRemove}
          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center transition-opacity z-50 hover:scale-110 nodrag nopan"
          title="Remove module"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}

      {handles}
      {summary.icon_url && <EntityIcon src={summary.icon_url} alt={summary.name} size={48} className="mb-2" />}
      <span className="text-xs font-medium text-center line-clamp-2 max-w-[100px]">{summary.name}</span>
      {summary.kind && (
        <span className={cn("mt-1 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider border", KIND_COLORS[summary.kind.toLowerCase()] || "bg-muted")}>
          {summary.kind}
        </span>
      )}
      {lockReason && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="absolute top-1 left-1 bg-background/80 rounded-full p-0.5 cursor-help z-10">
                <AlertCircle className="w-4 h-4 text-amber-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-[200px]">{lockReason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
});

function ModuleEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  selected,
}: EdgeProps) {
  const { gridMode } = useBuilderSettings();

  const pathParams = {
    sourceX,
    sourceY,
    sourcePosition,
    targetPosition,
    targetX,
    targetY,
    borderRadius: 16,
  };

  const [edgePath, labelX, labelY] = gridMode 
    ? getSmoothStepPath(pathParams)
    : getBezierPath(pathParams);

  const { setEdges } = useReactFlow();
  const selectedCount = useStore(selectedCountSelector);
  const showDelete = selected && selectedCount === 1;

  const onEdgeClick = (evt: React.MouseEvent) => {
    evt.stopPropagation();
    setEdges((edges) => edges.filter((e) => e.id !== id));
  };

  const edgeStyle = {
    ...style,
    stroke: selected ? '#3b82f6' : '#10b981',
    strokeWidth: selected ? 4 : 2,
  };

  return (
    <g>
      <BaseEdge path={edgePath} style={{ ...edgeStyle, strokeWidth: 16, stroke: 'transparent', cursor: 'pointer' }} interactionWidth={0} />
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} interactionWidth={0} />
      {showDelete && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <button
              className="w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-md hover:scale-110"
              onClick={onEdgeClick}
              title="Delete Connection"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

const nodeTypes = {
  moduleNode: ModuleNodeComponent,
};
const edgeTypes = {
  moduleEdge: ModuleEdgeComponent,
};

function StationBuilderContent() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ModuleNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [search, setSearch] = useState("");
  const [filterKind, setFilterKind] = useState("all");
  const [filterReady, setFilterReady] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{title: string, desc: string, type?: 'error'|'success'|'info'} | null>(null);
  const showToast = (title: string, desc: string, type: 'error'|'success'|'info' = 'error') => {
    setToastMsg({ title, desc, type });
    setTimeout(() => setToastMsg(null), 3000);
  };
  const lastMousePos = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const { screenToFlowPosition, getViewport } = useReactFlow();
  const { gridMode, setGridMode } = useBuilderSettings();

  const { takeSnapshot, undo, redo, canUndo, canRedo } = useUndoRedo<ModuleNodeData>();
  const { copy, paste, hasClipboard } = useClipboard<ModuleNodeData>();
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'node' | 'pane' | 'edge', nodeId?: string, edgeId?: string } | null>(null);

  const { data: modules = [], isLoading } = useQuery<ModuleSummary[]>({
    queryKey: ["modules"],
    queryFn: () => fetch("/api/v1/modules?limit=2000").then(r => r.json()),
    staleTime: 10 * 60_000,
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
    staleTime: 10 * 60_000,
  });

  const { data: playerLicences = [] } = useQuery<{ licence_type: string; faction_id: string }[]>({
    queryKey: ["player-licences"],
    queryFn: () => fetch("/api/v1/player/licences").then((r) => r.json()),
    staleTime: 60_000,
  });

  const licenceSet = useMemo(() => new Set(playerLicences.map((l) => `${l.faction_id}:${l.licence_type}`)), [playerLicences]);
  const anyLicenceSet = useMemo(() => new Set(playerLicences.map((l) => l.licence_type)), [playerLicences]);

  const uniqueKinds = useMemo(() => {
    const kinds = new Set(modules.map(m => m.kind).filter(Boolean));
    return Array.from(kinds).sort();
  }, [modules]);

  const filteredModules = useMemo(() => {
    return modules.filter(m => {
      if (!m.is_obtainable) return false;
      if (m.is_obtainable && m.est_cost == null) return false; // Hide sub-components
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterKind !== "all" && m.kind !== filterKind) return false;
      if (filterReady) {
        const licenceLocked = isModuleLicenceLocked(m.makerrace, m.restriction_licence, licenceSet, anyLicenceSet);
        const isFreeDefault = !m.blueprint_price_avg && m.is_obtainable;
        if (licenceLocked || (!m.has_blueprint && !isFreeDefault)) return false;
      }
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [modules, search, filterKind, filterReady, licenceSet, anyLicenceSet]);

  useEffect(() => {
    setNodes(nds => nds.map(n => {
      const m = n.data.summary;
      const licenceLocked = isModuleLicenceLocked(m.makerrace, m.restriction_licence, licenceSet, anyLicenceSet);
      const isFreeDefault = !m.blueprint_price_avg && m.is_obtainable;
      
      let lockReason = undefined;
      if (licenceLocked && !m.has_blueprint && !isFreeDefault) {
        lockReason = "Missing blueprint and required faction licence.";
      } else if (licenceLocked) {
        lockReason = "Missing required faction licence.";
      } else if (!m.has_blueprint && !isFreeDefault) {
        lockReason = "Missing blueprint.";
      }

      if (n.data.lockReason !== lockReason) {
        return { ...n, data: { ...n.data, lockReason } };
      }
      return n;
    }));
  }, [licenceSet, anyLicenceSet, setNodes]);

  const uniqueModuleIds = useMemo(() => Array.from(new Set(nodes.map(n => n.data.summary.module_id))), [nodes]);
  const moduleDetailsQueries = useQueries({
    queries: uniqueModuleIds.map(id => ({
      queryKey: ["module", id],
      queryFn: () => fetch(`/api/v1/modules/${id}`).then(r => r.json()),
      staleTime: 10 * 60_000,
    }))
  });

  const moduleDetailsMap = useMemo(() => {
    const map = new Map<string, ModuleDetail>();
    moduleDetailsQueries.forEach(q => {
      if (q.data) map.set(q.data.module_id, q.data);
    });
    return map;
  }, [moduleDetailsQueries]);

  const onConnect = useCallback((params: Connection) => {
    if (params.source === params.target) return;
    const alreadyConnected = edges.some(e => 
      (e.source === params.source && e.target === params.target) || 
      (e.source === params.target && e.target === params.source)
    );
    if (alreadyConnected) {
      showToast("Connection Failed", "These modules are already connected.");
      return;
    }
    const visited = new Set<string>();
    const q = [params.source];
    visited.add(params.source);
    let hasCycle = false;
    while (q.length > 0) {
      const curr = q.shift()!;
      if (curr === params.target) {
        hasCycle = true;
        break;
      }
      edges.forEach(e => {
        if (e.source === curr && !visited.has(e.target)) {
          visited.add(e.target);
          q.push(e.target);
        }
        if (e.target === curr && !visited.has(e.source)) {
          visited.add(e.source);
          q.push(e.source);
        }
      });
    }
    if (hasCycle) {
      showToast("Connection Failed", "Cyclic connections are not allowed. The station must be a tree structure.");
      return;
    }
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    const sourceEdgesCount = edges.filter(e => e.source === params.source || e.target === params.source).length;
    const targetEdgesCount = edges.filter(e => e.source === params.target || e.target === params.target).length;
    
    if (sourceNode && sourceEdgesCount >= (sourceNode.data.summary.snap_points || 0)) {
      showToast("Connection Failed", `${sourceNode.data.summary.name} has no available snap points.`);
      return;
    }
    if (targetNode && targetEdgesCount >= (targetNode.data.summary.snap_points || 0)) {
      showToast("Connection Failed", `${targetNode.data.summary.name} has no available snap points.`);
      return;
    }
    
    const sourceEdges = edges.filter(e => e.source === params.source && e.sourceHandle === params.sourceHandle);
    const targetEdges = edges.filter(e => e.target === params.target && e.targetHandle === params.targetHandle);
    const targetSourceEdges = edges.filter(e => e.source === params.target && e.sourceHandle === params.sourceHandle);
    const sourceTargetEdges = edges.filter(e => e.target === params.source && e.targetHandle === params.sourceHandle);
    if (sourceEdges.length > 0 || targetEdges.length > 0 || targetSourceEdges.length > 0 || sourceTargetEdges.length > 0) return;
    takeSnapshot(nodes, edges);
    setEdges((eds) => {
       const newEds = addEdge({ ...params, type: 'moduleEdge' }, eds);
       return newEds;
    });
  }, [edges, setEdges, nodes, takeSnapshot]);

  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    takeSnapshot(nodes, edges);
    setEdges((els) => reconnectEdge(oldEdge, newConnection, els));
  }, [nodes, edges, setEdges, takeSnapshot]);

  const onNodeDragStart = useCallback((_event: React.MouseEvent | MouseEvent | TouchEvent, _node: Node, _nodes: Node<ModuleNodeData>[]) => {
    takeSnapshot(nodes, edges);
  }, [nodes, edges, takeSnapshot]);

  const onNodesDelete = useCallback(() => {
    takeSnapshot(nodes, edges);
  }, [nodes, edges, takeSnapshot]);

  const onEdgesDelete = useCallback(() => {
    takeSnapshot(nodes, edges);
  }, [nodes, edges, takeSnapshot]);

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'pane' });
  }, []);

  const onSelectionContextMenu = useCallback((e: React.MouseEvent | MouseEvent, _nodes: Node[]) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'pane' });
  }, []);

  const onNodeContextMenu = useCallback((e: React.MouseEvent | MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'node', nodeId: node.id });
  }, []);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent | MouseEvent, edge: Edge) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, type: 'edge', edgeId: edge.id });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          copy(nodes, edges);
          showToast("Copied", "Copied selected modules", "success");
        } else if (e.key === 'v' || e.key === 'V') {
          const targetPos = screenToFlowPosition({ x: lastMousePos.current.x, y: lastMousePos.current.y });
          const pasted = paste(targetPos);
          if (pasted) {
            takeSnapshot(nodes, edges);
            const newNodes = [...nodes, ...pasted.newNodes];
            const newEdges = [...edges, ...pasted.newEdges];
            setNodes(newNodes);
            setEdges(newEdges);
          }
        } else if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            const state = redo(nodes, edges);
            if (state) { setNodes(state.nodes); setEdges(state.edges); }
          } else {
            const state = undo(nodes, edges);
            if (state) { setNodes(state.nodes); setEdges(state.edges); }
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          const state = redo(nodes, edges);
          if (state) { setNodes(state.nodes); setEdges(state.edges); }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, copy, paste, undo, redo, takeSnapshot]);

  const onDragStart = (event: React.DragEvent, module: ModuleSummary) => {
    event.dataTransfer.setData("application/reactflow", JSON.stringify(module));
    event.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const moduleDataStr = event.dataTransfer.getData("application/reactflow");
    if (!moduleDataStr) return;
    const moduleData = JSON.parse(moduleDataStr) as ModuleSummary;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    position.x -= 64; // center the drop point (128px wide)
    position.y -= 64; // center the drop point (128px tall)
    const isFreeDefault = !moduleData.blueprint_price_avg && moduleData.is_obtainable;
    const licenceLocked = isModuleLicenceLocked(moduleData.makerrace, moduleData.restriction_licence, licenceSet, anyLicenceSet);
    
    let lockReason = undefined;
    if (licenceLocked && !moduleData.has_blueprint && !isFreeDefault) {
      lockReason = "Missing blueprint and required faction licence.";
    } else if (licenceLocked) {
      lockReason = "Missing required faction licence.";
    } else if (!moduleData.has_blueprint && !isFreeDefault) {
      lockReason = "Missing blueprint.";
    }

    let dropX = position.x;
    let dropY = position.y;
    
    if (gridMode) {
      dropX = Math.round(dropX / 16) * 16;
      dropY = Math.round(dropY / 16) * 16;
    }

    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newNode: Node<ModuleNodeData> = {
      id,
      type: 'moduleNode',
      position: { x: dropX, y: dropY },
      data: { 
        summary: moduleData, 
        onClickDetail: () => setSelectedDetailId(moduleData.module_id), 
        lockReason,
        onRemove: () => {
          takeSnapshot(nodes, edges);
          setNodes((nds) => nds.filter((n) => n.id !== id));
          setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
        }
      },
    };
    takeSnapshot(nodes, edges);
    setNodes((nds) => nds.concat(newNode));
  }, [nodes, edges, setNodes, setEdges, gridMode, anyLicenceSet, licenceSet, takeSnapshot]);

  const stats = useMemo(() => {
    let cost = 0, buildTime = 0, workforce_need = 0, workforce_max = 0, hull = 0, total_production = 0, total_consumption = 0;
    let docking_s = 0, docking_m = 0, docking_l = 0, docking_xl = 0;
    const waresProduced = new Map<string, number>();
    const waresConsumed = new Map<string, number>();

    nodes.forEach(n => {
      const s = n.data.summary;
      cost += s.est_cost || 0;
      buildTime += s.build_time_sec || 0;
      workforce_max += s.workforce_capacity || 0;
      hull += s.hull || 0;
      total_production += s.production_rate || 0;
      total_consumption += s.consumption_rate || 0;
      docking_s += s.dock_s || 0; docking_m += s.dock_m || 0; docking_l += s.dock_l || 0; docking_xl += s.dock_xl || 0;
      
      if (s.produces_ware_name && s.production_rate) {
         waresProduced.set(s.produces_ware_name, (waresProduced.get(s.produces_ware_name) || 0) + s.production_rate);
      }
      const detail = moduleDetailsMap.get(s.module_id);
      if (detail?.production_inputs) {
        detail.production_inputs.forEach(input => {
          waresConsumed.set(input.name, (waresConsumed.get(input.name) || 0) + input.rate_per_hour);
        });
      }
    });

    return { 
      cost, buildTime, workforce_need, workforce_max, hull, total_production, total_consumption, docking_s, docking_m, docking_l, docking_xl,
      waresProduced: Array.from(waresProduced.entries()).map(([name, rate]) => ({ name, rate })).sort((a,b) => b.rate - a.rate),
      waresConsumed: Array.from(waresConsumed.entries()).map(([name, rate]) => ({ name, rate })).sort((a,b) => b.rate - a.rate),
    };
  }, [nodes, moduleDetailsMap]);

  const aggregateMaterials = useMemo(() => {
    const mats = new Map<string, { name: string, amount: number, total: number, ware_id: string }>();
    nodes.forEach(n => {
      const detail = moduleDetailsMap.get(n.data.summary.module_id);
      if (detail?.construction_resources) {
        detail.construction_resources.forEach(res => {
          if (!mats.has(res.ware_id)) mats.set(res.ware_id, { name: res.name, amount: 0, total: 0, ware_id: res.ware_id });
          const existing = mats.get(res.ware_id)!;
          existing.amount += res.amount;
          existing.total += res.total;
        });
      }
    });
    return Array.from(mats.values()).sort((a, b) => b.total - a.total);
  }, [nodes, moduleDetailsMap]);

  const selectedModuleSummary = modules.find(m => m.module_id === selectedDetailId);

  const onAddModuleToMap = useCallback((e: React.MouseEvent, moduleData: ModuleSummary) => {
    e.stopPropagation();
    const isFreeDefault = !moduleData.blueprint_price_avg && moduleData.is_obtainable;
    const licenceLocked = isModuleLicenceLocked(moduleData.makerrace, moduleData.restriction_licence, licenceSet, anyLicenceSet);
    
    let lockReason = undefined;
    if (licenceLocked && !moduleData.has_blueprint && !isFreeDefault) {
      lockReason = "Missing blueprint and required faction licence.";
    } else if (licenceLocked) {
      lockReason = "Missing required faction licence.";
    } else if (!moduleData.has_blueprint && !isFreeDefault) {
      lockReason = "Missing blueprint.";
    }

    const { x, y, zoom } = getViewport();
    let dropX = -x / zoom + (window.innerWidth / 3) / zoom - 64;
    let dropY = -y / zoom + (window.innerHeight / 2) / zoom - 64;

    let overlapping = true;
    while (overlapping) {
      overlapping = nodes.some(n => Math.abs(n.position.x - dropX) < 130 && Math.abs(n.position.y - dropY) < 130);
      if (overlapping) {
        dropX += 140;
        if (dropX > -x / zoom + (window.innerWidth / 3) / zoom + 500) {
          dropX = -x / zoom + (window.innerWidth / 3) / zoom - 64;
          dropY += 140;
        }
      }
    }

    if (gridMode) {
      dropX = Math.round(dropX / 16) * 16;
      dropY = Math.round(dropY / 16) * 16;
    }

    const id = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNode: Node<ModuleNodeData> = {
      id,
      type: 'moduleNode',
      position: { x: dropX, y: dropY },
      data: { 
        summary: moduleData, 
        onClickDetail: () => setSelectedDetailId(moduleData.module_id), 
        lockReason,
        onRemove: () => {
          setNodes(nds => nds.filter(n => n.id !== id));
          setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
        }
      },
    };
    setNodes((nds) => nds.concat(newNode));
  }, [setNodes, setEdges, licenceSet, anyLicenceSet, getViewport, nodes]);

  return (
    <div 
      className="flex flex-col h-full bg-background overflow-hidden"
      onPointerMove={(e) => { lastMousePos.current = { x: e.clientX, y: e.clientY }; }}
    >
      <style>{`
        .react-flow__controls-button { background-color: hsl(var(--card)); border-bottom: 1px solid hsl(var(--border)); fill: hsl(var(--foreground)); }
        .react-flow__controls-button:hover { background-color: hsl(var(--muted)); }
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
      `}</style>

      {toastMsg && (
        <div className={cn(
          "absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-md shadow-xl border animate-in slide-in-from-top-4 fade-in duration-200",
          toastMsg.type === 'success' ? "bg-emerald-500 text-white border-emerald-600" :
          toastMsg.type === 'info' ? "bg-blue-500 text-white border-blue-600" :
          "bg-destructive text-destructive-foreground border-destructive-foreground/20"
        )}>
          <div className="font-semibold text-sm">{toastMsg.title}</div>
          <div className="text-xs opacity-90">{toastMsg.desc}</div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-80 border-r border-border bg-card flex flex-col h-full shrink-0">
          <div className="px-6 py-4 flex-none border-b border-border bg-card">
            <h1 className="text-2xl font-bold tracking-tight">Station Builder</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">Design and prototype station layouts</p>
          </div>
          <div className="p-4 border-b border-border space-y-3">
            <SearchInput placeholder="Search modules..." value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={filterKind} onValueChange={setFilterKind}>
              <SelectTrigger className="w-full h-8 text-xs"><SelectValue placeholder="All Kinds" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Kinds</SelectItem>
                {uniqueKinds.map(k => (
                  <SelectItem key={k as string} value={k as string}>
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border", KIND_COLORS[(k as string).toLowerCase()] || "bg-muted")}>{k}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Switch checked={filterReady} onCheckedChange={setFilterReady} />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="text-xs font-medium text-muted-foreground cursor-help underline decoration-dotted underline-offset-2">Ready to Build</TooltipTrigger>
                    <TooltipContent><p className="max-w-[200px] text-xs">Shows only modules where you have the appropriate license and blueprint unlocked and can use the component for station building.</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <button className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2" onClick={() => { setFilterKind("all"); setFilterReady(false); setSearch(""); }}>Clear Filters</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="space-y-4 p-4">{[...Array(6)].map((_, i) => <div key={i} className="h-16 bg-muted/20 animate-pulse rounded" />)}</div>
            ) : filteredModules.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground p-4 mt-8">No modules match your current filters.</div>
            ) : (
              <div className="space-y-2">
                {filteredModules.map(m => (
                  <div key={m.module_id} onClick={() => setSelectedDetailId(m.module_id)} draggable onDragStart={(e) => onDragStart(e, m)} className="flex items-center gap-3 p-2 rounded border border-border bg-muted/30 hover:bg-muted cursor-grab active:cursor-grabbing transition-colors">
                    {m.icon_url ? <EntityIcon src={m.icon_url} alt={m.name} size={32} className="shrink-0" /> : <div className="w-8 h-8 shrink-0 bg-background rounded" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between items-start">
                        <div className="text-sm font-medium truncate pr-2" title={m.name}>{m.name}</div>
                        <button onClick={(e) => onAddModuleToMap(e, m)} className="text-muted-foreground hover:bg-primary hover:text-primary-foreground rounded transition-colors p-1 -mr-1 shrink-0" title="Add to Map"><Plus className="w-4 h-4" /></button>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <div className={cn("px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider border", m.kind ? (KIND_COLORS[m.kind.toLowerCase()] || "bg-muted") : "bg-muted")}>{m.kind || "Unknown"}</div>
                        <Currency value={m.est_cost} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0">
<div className="flex-1 relative bg-[#0a0a0a] flex flex-col z-0">
            <ReactFlow 
               nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} 
               onConnect={onConnect} onReconnect={onReconnect} onDrop={onDrop} onDragOver={onDragOver} 
               onNodeDragStart={onNodeDragStart} onPaneContextMenu={onPaneContextMenu} onNodeContextMenu={onNodeContextMenu} onEdgeContextMenu={onEdgeContextMenu}
               onSelectionContextMenu={onSelectionContextMenu}
               onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete} deleteKeyCode={['Backspace', 'Delete']}
               multiSelectionKeyCode={['Shift', 'Control', 'Meta']} selectionKeyCode={['Shift']}
               onMoveStart={() => setContextMenu(null)}
               connectionLineType={gridMode ? ConnectionLineType.SmoothStep : ConnectionLineType.Bezier}
               nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose} defaultViewport={{ x: 0, y: 0, zoom: 1 }} snapToGrid={gridMode} snapGrid={[16, 16]} proOptions={{ hideAttribution: true }}>
              <Background color="#3f3f46" gap={16} offset={[8, 8]} />
              <Controls />
              <MiniMap 
                nodeColor={() => '#10b981'} 
                maskColor="transparent" 
                className="!bg-[#0a0a0a] border border-border !rounded-lg overflow-hidden shadow-2xl !opacity-100" 
                style={{ backgroundColor: '#0a0a0a' }}
              />
              <Panel position="top-right" className="bg-card border border-border rounded-md shadow-lg p-3 min-w-[200px] z-50">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5" /> Map Settings
                </h3>
                <div className="flex items-center justify-between">
                  <label htmlFor="grid-mode" className="text-xs">Grid Mode</label>
                  <Switch id="grid-mode" checked={gridMode} onCheckedChange={setGridMode} />
                </div>
              </Panel>
            </ReactFlow>
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-background/80 px-6 py-4 rounded-lg border border-border text-center backdrop-blur-sm">
                  <p className="text-muted-foreground font-medium">Drag modules here to start building</p>
                  <p className="text-xs text-muted-foreground mt-1">Connect modules by dragging from empty snap points</p>
                </div>
              </div>
            )}
            {contextMenu && (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                type={contextMenu.type}
                canUndo={canUndo}
                canRedo={canRedo}
                hasClipboard={hasClipboard}
                selectedCount={
                  contextMenu.type === 'pane' 
                    ? nodes.filter(n => n.selected).length
                    : contextMenu.type === 'node' 
                      ? (nodes.find(n => n.id === contextMenu.nodeId)?.selected ? nodes.filter(n => n.selected).length : 1) 
                      : undefined
                }
                onClose={() => setContextMenu(null)}
                onCopy={() => { copy(nodes, edges, contextMenu.type === 'node' ? contextMenu.nodeId : undefined); showToast("Copied", "Copied selected modules", "success"); }}
                onPaste={() => {
                   const targetPos = screenToFlowPosition({ x: contextMenu.x, y: contextMenu.y });
                   const pasted = paste(targetPos);
                   if (pasted) {
                     takeSnapshot(nodes, edges);
                     const newNodes = [...nodes, ...pasted.newNodes];
                     const newEdges = [...edges, ...pasted.newEdges];
                     setNodes(newNodes);
                     setEdges(newEdges);
                   }
                }}
                onUndo={() => { const s = undo(nodes, edges); if(s){ setNodes(s.nodes); setEdges(s.edges); } }}
                onRedo={() => { const s = redo(nodes, edges); if(s){ setNodes(s.nodes); setEdges(s.edges); } }}
                onViewDetails={() => {
                   if (contextMenu.nodeId) {
                     const n = nodes.find(n => n.id === contextMenu.nodeId);
                     if (n) setSelectedDetailId(n.data.summary.module_id);
                   }
                }}
                onDelete={() => {
                   if (contextMenu.type === 'node' && contextMenu.nodeId) {
                     takeSnapshot(nodes, edges);
                     const isSelected = nodes.find(n => n.id === contextMenu.nodeId)?.selected;
                     const idsToDelete = new Set(isSelected ? nodes.filter(n => n.selected).map(n => n.id) : [contextMenu.nodeId]);
                     setNodes(nds => nds.filter(n => !idsToDelete.has(n.id)));
                     setEdges(eds => eds.filter(e => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)));
                   } else if (contextMenu.type === 'pane') {
                     takeSnapshot(nodes, edges);
                     const idsToDelete = new Set(nodes.filter(n => n.selected).map(n => n.id));
                     setNodes(nds => nds.filter(n => !idsToDelete.has(n.id)));
                     setEdges(eds => eds.filter(e => !idsToDelete.has(e.source) && !idsToDelete.has(e.target) && !e.selected));
                   } else if (contextMenu.type === 'edge' && contextMenu.edgeId) {
                     takeSnapshot(nodes, edges);
                     setEdges(eds => eds.filter(e => e.id !== contextMenu.edgeId));
                   }
                }}
              />
            )}
            
            <div className="absolute top-4 left-4 z-10 flex items-center gap-1 bg-card border border-border shadow-md rounded p-1">
               <button 
                  onClick={() => { const s = undo(nodes, edges); if(s){ setNodes(s.nodes); setEdges(s.edges); } }} 
                  disabled={!canUndo}
                  className={cn("p-1.5 rounded transition-colors", canUndo ? "hover:bg-muted cursor-pointer" : "opacity-50 cursor-not-allowed")}
                  title="Undo (Ctrl+Z)"
               >
                  <Undo className="w-4 h-4" />
               </button>
               <button 
                  onClick={() => { const s = redo(nodes, edges); if(s){ setNodes(s.nodes); setEdges(s.edges); } }} 
                  disabled={!canRedo}
                  className={cn("p-1.5 rounded transition-colors", canRedo ? "hover:bg-muted cursor-pointer" : "opacity-50 cursor-not-allowed")}
                  title="Redo (Ctrl+Y)"
               >
                  <Redo className="w-4 h-4" />
               </button>
            </div>
          </div>
          <div className="h-14 bg-card border-t border-border flex flex-wrap items-center px-6 gap-8 shrink-0 relative z-10 text-xs shadow-lg overflow-x-auto">
            <div className="flex flex-col"><span className="text-muted-foreground uppercase font-bold tracking-wider mb-0.5 text-[10px]">Total Hull</span><span className="font-mono text-sm">{stats.hull.toLocaleString()}</span></div>
            <div className="flex flex-col"><span className="text-muted-foreground uppercase font-bold tracking-wider mb-0.5 text-[10px]">Workforce (Max / Need)</span><span className="font-mono text-sm">{stats.workforce_max} / {stats.workforce_need}</span></div>
            <div className="flex flex-col">
              <span className="text-muted-foreground uppercase font-bold tracking-wider mb-0.5 text-[10px]">Prod / Cons (hr)</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-mono text-sm cursor-help underline decoration-dotted underline-offset-2">
                      {stats.total_production.toLocaleString(undefined, {maximumFractionDigits:1})} / {stats.total_consumption.toLocaleString(undefined, {maximumFractionDigits:1})}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs space-y-2 min-w-[200px]">
                      <div>
                        <span className="font-bold text-green-400">Produced:</span>
                        {stats.waresProduced.length === 0 ? <div className="text-muted-foreground italic">None</div> : stats.waresProduced.map(w => <div key={w.name} className="flex justify-between"><span>{w.name}</span><span className="font-mono">{w.rate.toLocaleString(undefined, {maximumFractionDigits:1})}/hr</span></div>)}
                      </div>
                      <div>
                        <span className="font-bold text-red-400">Consumed:</span>
                        {stats.waresConsumed.length === 0 ? <div className="text-muted-foreground italic">None</div> : stats.waresConsumed.map(w => <div key={w.name} className="flex justify-between"><span>{w.name}</span><span className="font-mono">{w.rate.toLocaleString(undefined, {maximumFractionDigits:1})}/hr</span></div>)}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-col"><span className="text-muted-foreground uppercase font-bold tracking-wider mb-0.5 text-[10px]">Docking (S/M)</span><span className="font-mono text-sm">{stats.docking_s} / {stats.docking_m}</span></div>
            <div className="flex flex-col"><span className="text-muted-foreground uppercase font-bold tracking-wider mb-0.5 text-[10px]">Docking (L/XL)</span><span className="font-mono text-sm">{stats.docking_l} / {stats.docking_xl}</span></div>
          </div>
        </div>

        <div className="w-80 border-l border-border bg-card flex flex-col h-full shrink-0 relative z-10">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-bold">Shopping Cart</h2>
            <p className="text-xs text-muted-foreground">Ephemeral V1 Layout</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <HUDCard className="p-4">
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Modules</span><span className="text-sm font-mono font-medium">{nodes.length}</span></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Est. Cost</span><Currency value={stats.cost} className="text-sm font-mono font-medium" /></div>
                <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Build Time</span><span className="text-sm font-mono font-medium">{stats.buildTime >= 3600 ? `${(stats.buildTime / 3600).toLocaleString(undefined, {maximumFractionDigits:1})}h` : stats.buildTime >= 60 ? `${(stats.buildTime / 60).toLocaleString(undefined, {maximumFractionDigits:1})}m` : `${stats.buildTime}s`}</span></div>
              </div>
            </HUDCard>
            <HUDCard className="p-4">
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Module List</h3>
              {nodes.length === 0 ? <p className="text-xs text-muted-foreground italic">No modules placed yet.</p> : (
                <div className="space-y-2">
                  {Array.from(nodes.reduce((acc, node) => {
                    const id = node.data.summary.module_id;
                    if (!acc.has(id)) acc.set(id, { summary: node.data.summary, count: 0 });
                    acc.get(id)!.count++;
                    return acc;
                  }, new Map<string, { summary: ModuleSummary, count: number }>()).values()).map(({ summary, count }) => {
                    const detail = moduleDetailsMap.get(summary.module_id);
                    return (
                      <details key={summary.module_id} className="group">
                        <summary className="flex justify-between items-center text-xs border-b border-border/50 pb-2 cursor-pointer list-none"><span className="truncate pr-2 select-none group-open:text-primary">{summary.name}</span><span className="font-mono text-muted-foreground shrink-0 whitespace-nowrap">x {count}</span></summary>
                        <div className="py-2 pl-4 space-y-1 bg-muted/20 border-b border-border/50">
                          {detail?.construction_resources ? detail.construction_resources.map(res => <div key={res.ware_id} className="flex justify-between items-center text-xs text-muted-foreground"><span>{res.name}</span><span>{(res.amount * count).toLocaleString()}</span></div>) : <span className="text-xs text-muted-foreground">No resources listed</span>}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </HUDCard>

            <HUDCard className="p-4">
              <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Total Materials</h3>
              {aggregateMaterials.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No materials.</p>
              ) : (
                <div className="space-y-1">
                  {aggregateMaterials.map(res => (
                    <div key={res.ware_id} className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">{res.name}</span>
                      <div className="flex gap-3">
                        <span className="font-mono">{res.amount.toLocaleString()}</span>
                        <span className="font-mono text-muted-foreground w-16 text-right"><Currency value={res.total} /></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </HUDCard>
          </div>
        </div>
      </div>

      <Dialog open={selectedDetailId !== null} onOpenChange={(open) => { if (!open) setSelectedDetailId(null); }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl min-h-[50vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedModuleSummary?.name ?? "Module details"}</DialogTitle>
          </DialogHeader>
          {selectedModuleSummary && (
            <ModuleDetailPanel 
              moduleId={selectedModuleSummary.module_id} 
              summary={selectedModuleSummary} 
              factions={factions} 
              licenceSet={licenceSet} 
              anyLicenceSet={anyLicenceSet} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StationBuilderPage() {
  const [gridMode, setGridMode] = useState(true);
  return (
    <BuilderSettingsContext.Provider value={{ gridMode, setGridMode }}>
      <ReactFlowProvider>
        <StationBuilderContent />
      </ReactFlowProvider>
    </BuilderSettingsContext.Provider>
  );
}
