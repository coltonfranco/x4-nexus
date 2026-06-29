// Pan + zoom + auto-fit interaction for the map canvas. Owns the SVG transform and
// the container ref the canvas attaches to.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Sector, Transform } from "./types";

interface ContentBounds {
  minX: number; maxX: number;
  minY: number; maxY: number;
  contentW: number;
  contentH: number;
}

const PAN_MARGIN = 0.5;   // allow panning up to 50% of a viewport beyond content edges
const MIN_SCALE_FRAC = 0.50; // minimum zoom is 50% of the auto-fit scale

export function usePanZoom(
  sectorCoords: Map<string, [number, number]>,
  visibleSectors: Sector[],
  hexSize: number,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ cx: number; cy: number; tx: number; ty: number } | null>(null);
  const hasAutoFit = useRef(false);

  // Compute world-space content bounds from visible sectors.
  const contentBounds = useMemo<ContentBounds | null>(() => {
    const pts = visibleSectors.map((s) => sectorCoords.get(s.sector_id)).filter(Boolean) as [number, number][];
    if (!pts.length) return null;
    const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
    const pad = hexSize * 2;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;
    return { minX, maxX, minY, maxY, contentW: maxX - minX, contentH: maxY - minY };
  }, [sectorCoords, visibleSectors, hexSize]);

  // Clamp a transform so the viewport stays within reasonable bounds of the content.
  const clampTransform = useCallback((t: Transform): Transform => {
    const bounds = contentBounds;
    if (!bounds || viewport.w === 0) return t;
    // Compute fitScale live from viewport so it stays accurate on resize.
    const fitScale = Math.min(viewport.w / bounds.contentW, viewport.h / bounds.contentH, 2) * 0.88;
    const minS = Math.max(0.04, fitScale * MIN_SCALE_FRAC);
    const scale = Math.max(minS, Math.min(25, t.scale));

    // World-space viewport dimensions at this scale.
    const vw = viewport.w / scale;
    const vh = viewport.h / scale;
    // World-space viewport origin (top-left).
    const vx = -t.x / scale;
    const vy = -t.y / scale;

    // Allowed range: content bounds ± margin * viewport size.
    const marginW = vw * PAN_MARGIN;
    const marginH = vh * PAN_MARGIN;

    const clampedVX = Math.max(bounds.minX - marginW, Math.min(bounds.maxX - vw + marginW, vx));
    const clampedVY = Math.max(bounds.minY - marginH, Math.min(bounds.maxY - vh + marginH, vy));

    return {
      x: -clampedVX * scale,
      y: -clampedVY * scale,
      scale,
    };
  }, [contentBounds, viewport.w, viewport.h]);

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
    setTransform(clampTransform({ x: rect.width / 2 - cx * scale, y: rect.height / 2 - cy * scale, scale }));
  }, [sectorCoords, visibleSectors, hexSize, clampTransform]);

  useEffect(() => {
    if (hasAutoFit.current || sectorCoords.size === 0 || visibleSectors.length === 0) return;
    fitView();
    hasAutoFit.current = true;
  }, [sectorCoords, visibleSectors, fitView]);

  // Track the canvas size so layers can cull to the visible world-space rect.
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

  // Re-fit on the next idle frame, used by the header "Reset" button.
  const resetView = useCallback(() => {
    hasAutoFit.current = false;
    fitView();
    hasAutoFit.current = true;
  }, [fitView]);

  const zoomToSector = useCallback((sectorId: string) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = sectorCoords.get(sectorId);
    if (!pos) return;
    const [cx, cy] = pos;
    // zoom in to scale 3.0 centered on sector; clamp only scale, not position
    const scale = Math.min(25, Math.max(0.04, 3.0));
    setTransform({ x: rect.width / 2 - cx * scale, y: rect.height / 2 - cy * scale, scale });
  }, [sectorCoords]);

  const handleZoom = useCallback((factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setTransform((t) => {
      const bounds = contentBounds;
      const fitScale = (bounds && viewport.w > 0)
        ? Math.min(viewport.w / bounds.contentW, viewport.h / bounds.contentH, 2) * 0.88
        : 0.5;
      const minS = Math.max(0.04, fitScale * MIN_SCALE_FRAC);
      const s = Math.max(minS, Math.min(25, t.scale * factor));
      const f = s / t.scale;
      return { x: cx - (cx - t.x) * f, y: cy - (cy - t.y) * f, scale: s };
    });
  }, [contentBounds, viewport.w, viewport.h]);

  const zoomIn = useCallback(() => handleZoom(1.3), [handleZoom]);
  const zoomOut = useCallback(() => handleZoom(1 / 1.3), [handleZoom]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    setTransform((t) => {
      const bounds = contentBounds;
      const fitScale = (bounds && viewport.w > 0)
        ? Math.min(viewport.w / bounds.contentW, viewport.h / bounds.contentH, 2) * 0.88
        : 0.5;
      const minS = Math.max(0.04, fitScale * MIN_SCALE_FRAC);
      const s = Math.max(minS, Math.min(25, t.scale * factor));
      const f = s / t.scale;
      return { x: ex - (ex - t.x) * f, y: ey - (ey - t.y) * f, scale: s };
    });
  }, [contentBounds, viewport.w, viewport.h]);

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
    zoomToSector,
    zoomIn,
    zoomOut,
    handlers: { onWheel, onMouseDown, onMouseMove, onMouseUp },
  };
}
