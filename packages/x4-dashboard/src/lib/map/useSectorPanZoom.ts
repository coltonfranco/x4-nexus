import { useCallback, useEffect, useRef, useState } from "react";
import type { Transform } from "./types";

// Extent of the points in local sector space.
export type SectorBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export function useSectorPanZoom(bounds: SectorBounds | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);
  const hasAutoFit = useRef(false);

  // We map game (x, z) to screen (x, y) where screen Y = -game Z
  const boundsW = bounds ? bounds.maxX - bounds.minX : 100000;
  const boundsH = bounds ? bounds.maxZ - bounds.minZ : 100000;
  
  // Calculate the scale needed to fit the bounds (plus some padding)
  const calculateFitScale = useCallback(() => {
    if (!containerRef.current || !bounds) return 1;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0) return 1;
    
    // Add 20% padding around the bounding box
    const padW = Math.max(boundsW * 1.2, 50000); 
    const padH = Math.max(boundsH * 1.2, 50000);
    
    return Math.min(rect.width / padW, rect.height / padH);
  }, [bounds, boundsW, boundsH]);

  const fitView = useCallback(() => {
    if (!containerRef.current || !bounds) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0) return;

    const scale = calculateFitScale();
    const cx = (bounds.minX + bounds.maxX) / 2;
    // Remember Screen Y is mapped to game -Z
    const cy = -(bounds.minZ + bounds.maxZ) / 2;

    setTransform({ x: rect.width / 2 - cx * scale, y: rect.height / 2 - cy * scale, scale });
  }, [bounds, calculateFitScale]);

  useEffect(() => {
    if (hasAutoFit.current || !bounds) return;
    fitView();
    hasAutoFit.current = true;
  }, [bounds, fitView]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setViewport({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const resetView = useCallback(() => {
    hasAutoFit.current = false;
    fitView();
    hasAutoFit.current = true;
  }, [fitView]);

  const clampTransform = useCallback((t: Transform) => {
    if (!containerRef.current || !bounds) return t;
    const rect = containerRef.current.getBoundingClientRect();
    
    // Min scale fits the whole sector, max scale zooms in 20x from fit.
    const fitScale = calculateFitScale();
    const minScale = fitScale * 0.5; // Allow zooming out a bit more than fit
    const maxScale = fitScale * 50;  // Lots of zoom in
    const scale = Math.max(minScale, Math.min(maxScale, t.scale));

    // Calculate maximum pan extents to keep the sector bounding box generally on screen
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = -(bounds.minZ + bounds.maxZ) / 2;
    
    // The maximum distance the center can be from the screen center
    const maxDistX = Math.max(rect.width, boundsW * scale) * 0.8;
    const maxDistY = Math.max(rect.height, boundsH * scale) * 0.8;
    
    const targetCenterX = rect.width / 2 - cx * scale;
    const targetCenterY = rect.height / 2 - cy * scale;

    const x = Math.max(targetCenterX - maxDistX, Math.min(targetCenterX + maxDistX, t.x));
    const y = Math.max(targetCenterY - maxDistY, Math.min(targetCenterY + maxDistY, t.y));

    return { x, y, scale };
  }, [bounds, boundsW, boundsH, calculateFitScale]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setTransform((t) => {
      const s = t.scale * factor;
      const f = s / t.scale;
      const proposed = { x: ex - (ex - t.x) * f, y: ey - (ey - t.y) * f, scale: s };
      return clampTransform(proposed);
    });
  }, [clampTransform]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { cx: e.clientX, cy: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning || !panStart.current) return;
    const { cx, cy, tx, ty } = panStart.current;
    setTransform((t) => clampTransform({ ...t, x: tx + e.clientX - cx, y: ty + e.clientY - cy }));
  }, [isPanning, clampTransform]);

  const onMouseUp = useCallback(() => { setIsPanning(false); panStart.current = null; }, []);

  return {
    containerRef,
    transform,
    viewport,
    isPanning,
    fitView,
    resetView,
    handlers: { onWheel, onMouseDown, onMouseMove, onMouseUp },
  };
}
