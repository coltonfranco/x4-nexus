// Pan + zoom + auto-fit interaction for the map canvas. Owns the SVG transform and
// the container ref the canvas attaches to.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Sector, Transform } from "./types";

export function usePanZoom(
  sectorCoords: Map<string, [number, number]>,
  visibleSectors: Sector[],
  hexSize: number,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);
  const hasAutoFit = useRef(false);

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

  // Re-fit on the next idle frame, used by the header "Reset" button.
  const resetView = useCallback(() => {
    hasAutoFit.current = false;
    fitView();
    hasAutoFit.current = true;
  }, [fitView]);

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

  return {
    containerRef,
    transform,
    isPanning,
    fitView,
    resetView,
    handlers: { onWheel, onMouseDown, onMouseMove, onMouseUp },
  };
}
