import { useState, useCallback } from 'react';
import { Node, Edge } from '@xyflow/react';

export function useUndoRedo<NodeData extends Record<string, unknown>>() {
  const [past, setPast] = useState<{ nodes: Node<NodeData>[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node<NodeData>[]; edges: Edge[] }[]>([]);

  const takeSnapshot = useCallback((nodes: Node<NodeData>[], edges: Edge[]) => {
    setPast((p) => {
      const clonedNodes = nodes.map(n => ({
        ...n,
        position: { ...n.position },
        data: {
          ...n.data,
          handlePositions: n.data.handlePositions ? JSON.parse(JSON.stringify(n.data.handlePositions)) : undefined
        }
      }));
      // Simple deduplication using stringify (functions are ignored, which is fine for dedup)
      const stateStr = JSON.stringify({ nodes: clonedNodes, edges });
      if (p.length > 0 && JSON.stringify(p[p.length - 1]) === stateStr) return p;
      return [...p, { nodes: clonedNodes, edges: [...edges] }];
    });
    setFuture([]);
  }, []);

  const undo = useCallback(
    (currentNodes: Node<NodeData>[], currentEdges: Edge[]) => {
      if (past.length === 0) return null;
      const newPast = [...past];
      const previousState = newPast.pop()!;
      setPast(newPast);
      setFuture((f) => [{ nodes: [...currentNodes], edges: [...currentEdges] }, ...f]);
      return previousState;
    },
    [past]
  );

  const redo = useCallback(
    (currentNodes: Node<NodeData>[], currentEdges: Edge[]) => {
      if (future.length === 0) return null;
      const newFuture = [...future];
      const nextState = newFuture.shift()!;
      setFuture(newFuture);
      setPast((p) => [...p, { nodes: [...currentNodes], edges: [...currentEdges] }]);
      return nextState;
    },
    [future]
  );

  return { takeSnapshot, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}

export function useClipboard<NodeData extends Record<string, unknown>>() {
  const [clipboard, setClipboard] = useState<{ nodes: Node<NodeData>[]; edges: Edge[] } | null>(null);

  const copy = useCallback((nodes: Node<NodeData>[], edges: Edge[], forceNodeId?: string) => {
    const isForceNodeSelected = forceNodeId ? nodes.find(n => n.id === forceNodeId)?.selected : false;
    const selectedNodes = forceNodeId && !isForceNodeSelected
      ? nodes.filter(n => n.id === forceNodeId)
      : nodes.filter(n => n.selected);
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
    const selectedEdges = edges.filter(e => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target));
    
    if (selectedNodes.length > 0) {
      setClipboard({ nodes: [...selectedNodes], edges: [...selectedEdges] });
    }
  }, []);

  const paste = useCallback((targetPos?: { x: number, y: number }) => {
    if (!clipboard || clipboard.nodes.length === 0) return null;
    
    let offsetX = 30;
    let offsetY = 30;

    if (targetPos) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      clipboard.nodes.forEach(n => {
        if (n.position.x < minX) minX = n.position.x;
        if (n.position.x > maxX) maxX = n.position.x;
        if (n.position.y < minY) minY = n.position.y;
        if (n.position.y > maxY) maxY = n.position.y;
      });
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      offsetX = targetPos.x - centerX;
      offsetY = targetPos.y - centerY;
    }

    const idMap = new Map<string, string>();
    const newNodes = clipboard.nodes.map(n => {
      const newId = crypto.randomUUID();
      idMap.set(n.id, newId);
      return {
        ...n,
        id: newId,
        position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
        selected: false,
      };
    });

    const newEdges = clipboard.edges.map(e => ({
      ...e,
      id: crypto.randomUUID(),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      selected: false,
    }));

    return { newNodes, newEdges };
  }, [clipboard]);

  return { copy, paste, hasClipboard: clipboard !== null };
}
