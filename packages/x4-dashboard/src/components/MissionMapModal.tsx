import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Target, Plus, Minus } from "lucide-react";
import { useMapData } from "../lib/map/useMapData";
import { useMapLayout } from "../lib/map/useMapLayout";
import { HexGridLayer } from "./map/layers/HexGridLayer";
import { SectorLayer } from "./map/layers/SectorLayer";
import { PlayerLayer } from "./map/layers/PlayerLayer";
import { NavLayer } from "./map/layers/AnalysisLayer";
import { buildAdjacency, findPath, type TravelSegmentKind } from "../lib/map/overlays/pathfinding";
import type { Sector } from "../lib/map/types";
import { sectorDisplayName } from "../lib/map/names";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MapObjective {
  label: string;
  x: number | null;
  z: number | null;
  zoneId: string | null;
}

interface MissionMapModalProps {
  open: boolean;
  onClose: () => void;
  sectorId: string | null;
  objectives: MapObjective[];
}

interface PathSegment {
  p1: [number, number];
  p2: [number, number];
  kind: TravelSegmentKind;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toStaticId(id: string): string {
  return id.split("_").map((s) => (s === "macro" ? s : s.charAt(0).toUpperCase() + s.slice(1))).join("_");
}

// ── Component ──────────────────────────────────────────────────────────────

export function MissionMapModal({ open, onClose, sectorId, objectives }: MissionMapModalProps) {
  const data = useMapData();
  const layout = useMapLayout(data, null, false);

  const { data: player } = useQuery<{ sector_id: string | null; zone_id: string | null }>({
    queryKey: ["player"],
    queryFn: async () => { const r = await fetch("/api/v1/player"); return r.ok ? r.json() : null; },
    enabled: open,
    staleTime: 30_000,
  });

  const SVG_W = 640; const SVG_H = 420;

  const playerStaticId = player?.sector_id ? toStaticId(player.sector_id) : null;

  const targetSector = useMemo(() => {
    if (!sectorId || !data.sectors) return null;
    return data.sectors.find((s: Sector) =>
      s.sector_id.toLowerCase() === sectorId.toLowerCase(),
    ) ?? null;
  }, [sectorId, data.sectors]);

  // ── Navigation pathfinding ────────────────────────────────────────────

  const navPath = useMemo(() => {
    if (!playerStaticId || !targetSector) return null;
    const fromId = playerStaticId;
    const toId = targetSector.sector_id;
    if (fromId.toLowerCase() === toId.toLowerCase()) return null;

    // Build case-insensitive coord map
    const coordsCI = new Map<string, [number, number]>();
    layout.sectorCoords.forEach((v, k) => coordsCI.set(k.toLowerCase(), v));

    const adj = buildAdjacency(
      data.gates, data.highways, data.sectors,
      layout.zoneMap, layout.zoneScreenPos, coordsCI,
    );
    const result = findPath(adj, fromId, toId);
    if (!result) return null;

    // Convert path nodes to screen segments
    const resolve = (node: string): [number, number] | null => {
      if (node.startsWith("sector:")) return coordsCI.get(node.substring(7)) ?? null;
      if (node.startsWith("zone:")) return layout.zoneScreenPos.get(node.substring(5)) ?? null;
      return null;
    };
    const segs: PathSegment[] = [];
    for (let i = 0; i < result.edges.length; i++) {
      const p1 = resolve(result.nodes[i]);
      const p2 = resolve(result.nodes[i + 1]);
      if (p1 && p2) segs.push({ p1, p2, kind: result.edges[i] });
    }
    return segs;
  }, [playerStaticId, targetSector, layout, data.gates, data.highways, data.sectors]);

  // ── Pan/zoom state ────────────────────────────────────────────────────

  const initialTransform = useMemo(() => {
    const homeCoord = targetSector
      ? layout.sectorCoords.get(targetSector.sector_id)
      : playerStaticId
        ? layout.sectorCoords.get(playerStaticId)
        : null;
    if (homeCoord) {
      return { x: SVG_W / 2 - homeCoord[0] * 1.6, y: SVG_H / 2 - homeCoord[1] * 1.6, scale: 1.6 };
    }
    return { x: SVG_W / 2, y: SVG_H / 2, scale: 0.6 };
  }, [targetSector, playerStaticId, layout.sectorCoords, SVG_W, SVG_H]);

  const [transform, setTransform] = useState(initialTransform);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTransform((prev) => {
      // Only update if values actually changed — avoids infinite loops when
      // sectorCoords Map gets a new reference but same values.
      if (
        Math.abs(prev.x - initialTransform.x) < 0.01 &&
        Math.abs(prev.y - initialTransform.y) < 0.01 &&
        Math.abs(prev.scale - initialTransform.scale) < 0.01
      ) {
        return prev;
      }
      return initialTransform;
    });
  }, [initialTransform]);

  const clampScale = (s: number) => Math.min(4, Math.max(0.3, s));

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setTransform((t) => {
      const ns = clampScale(t.scale * (e.deltaY > 0 ? 0.85 : 1.15));
      return { x: mx - (mx - t.x) * (ns / t.scale), y: my - (my - t.y) * (ns / t.scale), scale: ns };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, tx: transform.x, ty: transform.y };
  }, [transform]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !dragRef.current) return;
    setTransform((t) => ({
      ...t,
      x: dragRef.current!.tx + (e.clientX - dragRef.current!.sx),
      y: dragRef.current!.ty + (e.clientY - dragRef.current!.sy),
    }));
  }, [dragging]);

  const onMouseUp = useCallback(() => { setDragging(false); dragRef.current = null; }, []);

  if (!open) return null;

  const targetName = targetSector ? sectorDisplayName(targetSector) : sectorId ?? "Unknown";

  const toScreen = (cx: number, cy: number): [number, number] => [
    cx * transform.scale + transform.x,
    cy * transform.scale + transform.y,
  ];

  const targetCoord = targetSector ? layout.sectorCoords.get(targetSector.sector_id) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
           style={{ width: SVG_W + 40, maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-semibold">Mission Map</h3>
            <p className="text-[10px] text-muted-foreground">
              Target: {targetName}
              {navPath ? ` · ${navPath.length} jumps` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setTransform(t => ({ ...t, scale: clampScale(t.scale * 1.2) }))}
                    className="text-muted-foreground hover:text-foreground p-1"><Plus className="w-3.5 h-3.5" /></button>
            <button onClick={() => setTransform(t => ({ ...t, scale: clampScale(t.scale / 1.2) }))}
                    className="text-muted-foreground hover:text-foreground p-1"><Minus className="w-3.5 h-3.5" /></button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 ml-1"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div
          ref={containerRef}
          className={`relative ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ width: SVG_W, height: SVG_H, background: "radial-gradient(120% 120% at 50% 0%, #0c1322 0%, #070b14 55%, #05070e 100%)" }}
          onWheel={onWheel}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <svg width="100%" height="100%" style={{ display: "block" }}>
            <g transform={`translate(${transform.x.toFixed(1)},${transform.y.toFixed(1)}) scale(${transform.scale.toFixed(4)})`}>
              <HexGridLayer cells={layout.bgGrid} hexSize={layout.hexSize} />
              <SectorLayer
                visibleSectors={layout.visibleSectors}
                sectorCoords={layout.sectorCoords}
                subSectorSet={layout.subSectorSet}
                factionMap={layout.factionMap}
                clusterMap={layout.clusterMap}
                hexSize={layout.hexSize}
                transform={{ x: 0, y: 0, scale: 1 }}
                selectedSectorId={targetSector?.sector_id ?? null}
                hoveredSectorId={null}
                onSelect={() => {}}
                onHover={() => {}}
                onContext={() => {}}
                showSectorNames={true}
              />
              <PlayerLayer
                sectorId={playerStaticId}
                zoneId={player?.zone_id ?? null}
                sectorCoords={layout.sectorCoords}
                zoneScreenPos={layout.zoneScreenPos}
                hexSize={layout.hexSize}
                transform={{ x: 0, y: 0, scale: 1 }}
              />
              {navPath && <NavLayer segments={navPath} origin={null} dest={null} transform={{ x: 0, y: 0, scale: 1 }} />}
            </g>

            {/* Target pin overlay (screen-space) */}
            {targetCoord && (() => {
              const [cx, cy] = toScreen(targetCoord[0], targetCoord[1]);
              const label = objectives.length > 0 && objectives[0].label
                ? (objectives[0].label.length > 16 ? objectives[0].label.slice(0, 16) + "\u2026" : objectives[0].label) : null;
              return (
                <g transform={`translate(${cx}, ${cy - 26})`}>
                  <Target size={16} style={{ transform: "translate(-8px, -8px)" }} color="#f97316" />
                  {label && <text x={0} y={14} textAnchor="middle" fill="#f97316" fontSize={10} fontWeight={700}>{label}</text>}
                </g>
              );
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
}
