import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, ArrowLeft, Plus, Minus } from "lucide-react";
import { useMapData } from "../../lib/map/useMapData";
import { useMapLayout } from "../../lib/map/useMapLayout";
import { HexGridLayer } from "../../components/map/layers/HexGridLayer";
import { SectorLayer } from "../../components/map/layers/SectorLayer";
import { PlayerLayer } from "../../components/map/layers/PlayerLayer";
import { NavLayer } from "../../components/map/layers/AnalysisLayer";
import {
  buildAdjacency,
  findPath,
  type TravelSegmentKind,
} from "../../lib/map/overlays/pathfinding";
import type { Sector } from "../../lib/map/types";
import { apiGetOrNull } from "../../lib/api";

// ── Types ──────────────────────────────────────────────────────────────────

interface PathSegment {
  p1: [number, number];
  p2: [number, number];
  kind: TravelSegmentKind;
}

type Props = {
  targetSectorId: string | null;
  height?: number;
  fullscreen?: boolean;
  onExpand?: () => void;
  onBack?: () => void;
};

function toStaticId(id: string): string {
  return id
    .split("_")
    .map((s) => (s === "macro" ? s : s.charAt(0).toUpperCase() + s.slice(1)))
    .join("_");
}

// ── Component ──────────────────────────────────────────────────────────────

export function EmbeddedMap({
  targetSectorId,
  height = 220,
  fullscreen = false,
  onExpand,
  onBack,
}: Props) {
  const data = useMapData();
  const layout = useMapLayout(data, null, false);

  const { data: player } = useQuery<{ sector_id: string | null } | null>({
    queryKey: ["player"],
    queryFn: () => apiGetOrNull<{ sector_id: string | null }>("/api/v1/player"),
    staleTime: 30_000,
  });

  const playerSectorId = player?.sector_id ?? null;
  const playerStaticId = playerSectorId ? toStaticId(playerSectorId) : null;

  const targetSector = useMemo(() => {
    if (!targetSectorId || !data.sectors) return null;
    return (
      data.sectors.find(
        (s: Sector) =>
          s.sector_id.toLowerCase() === targetSectorId.toLowerCase(),
      ) ?? null
    );
  }, [targetSectorId, data.sectors]);

  // ── Pathfinding ────────────────────────────────────────────────────────

  const navPath = useMemo(() => {
    if (!playerStaticId || !targetSector) return null;
    const fromId = playerStaticId;
    const toId = targetSector.sector_id;
    if (fromId.toLowerCase() === toId.toLowerCase()) return null;

    const coordsCI = new Map<string, [number, number]>();
    layout.sectorCoords.forEach((v, k) => coordsCI.set(k.toLowerCase(), v));

    const adj = buildAdjacency(
      data.gates,
      data.highways,
      data.sectors,
      layout.zoneMap,
      layout.zoneScreenPos,
      coordsCI,
    );
    const result = findPath(adj, fromId, toId);
    if (!result) return null;

    const resolve = (node: string): [number, number] | null => {
      if (node.startsWith("sector:"))
        return coordsCI.get(node.substring(7)) ?? null;
      if (node.startsWith("zone:"))
        return layout.zoneScreenPos.get(node.substring(5)) ?? null;
      return null;
    };
    const segs: PathSegment[] = [];
    for (let i = 0; i < result.edges.length; i++) {
      const p1 = resolve(result.nodes[i]);
      const p2 = resolve(result.nodes[i + 1]);
      if (p1 && p2) segs.push({ p1, p2, kind: result.edges[i] });
    }
    return segs;
  }, [
    playerStaticId,
    targetSector,
    layout,
    data.gates,
    data.highways,
    data.sectors,
  ]);

  // ── Pan/zoom ────────────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);
  const isSmall = !fullscreen;
  const W = isSmall ? 438 : 800;
  const H = isSmall ? height : 500;

  const initialTransform = useMemo(() => {
    const homeCoord = targetSector
      ? layout.sectorCoords.get(targetSector.sector_id)
      : playerStaticId
        ? layout.sectorCoords.get(playerStaticId)
        : null;
    if (homeCoord) {
      const s = isSmall ? 1.6 : 1.2;
      return {
        x: W / 2 - homeCoord[0] * s,
        y: H / 2 - homeCoord[1] * s,
        scale: s,
      };
    }
    return { x: W / 2, y: H / 2, scale: 0.6 };
  }, [targetSector, playerStaticId, layout.sectorCoords, W, H, isSmall]);

  const [transform, setTransform] = useState(initialTransform);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    sx: number;
    sy: number;
    tx: number;
    ty: number;
  } | null>(null);

  useEffect(() => {
    setTransform((prev) => {
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

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      setTransform((t) => {
        const ns = clampScale(t.scale * (e.deltaY > 0 ? 0.85 : 1.15));
        return {
          x: mx - (mx - t.x) * (ns / t.scale),
          y: my - (my - t.y) * (ns / t.scale),
          scale: ns,
        };
      });
    },
    [],
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true);
      dragRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        tx: transform.x,
        ty: transform.y,
      };
    },
    [transform],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging || !dragRef.current) return;
      setTransform((t) => ({
        ...t,
        x: dragRef.current!.tx + (e.clientX - dragRef.current!.sx),
        y: dragRef.current!.ty + (e.clientY - dragRef.current!.sy),
      }));
    },
    [dragging],
  );

  const onMouseUp = useCallback(() => {
    setDragging(false);
    dragRef.current = null;
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────

  const jumps = navPath ? navPath.length : null;

  const mapBody = (
    <div
      ref={containerRef}
      className={`relative rounded-xl border border-border overflow-hidden group ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      style={{
        height: fullscreen ? "100%" : height,
        background:
          "radial-gradient(120% 120% at 50% 0%, #0c1322 0%, #070b14 55%, #05070e 100%)",
      }}
      onClick={fullscreen ? undefined : onExpand}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <svg width="100%" height="100%" style={{ display: "block" }}>
        <g
          transform={`translate(${transform.x.toFixed(1)},${transform.y.toFixed(1)}) scale(${transform.scale.toFixed(4)})`}
        >
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
            zoneId={null}
            sectorCoords={layout.sectorCoords}
            zoneScreenPos={layout.zoneScreenPos}
            hexSize={layout.hexSize}
            transform={{ x: 0, y: 0, scale: 1 }}
          />
          {navPath && (
            <NavLayer
              segments={navPath}
              origin={null}
              dest={null}
              transform={{ x: 0, y: 0, scale: 1 }}
            />
          )}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-2 right-2 flex gap-1 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTransform((t) => ({ ...t, scale: clampScale(t.scale * 1.2) }));
          }}
          className="w-6 h-6 rounded flex items-center justify-center bg-[#0c1322]/80 border border-border/40 text-muted-foreground hover:text-foreground"
        >
          <Plus className="w-3 h-3" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTransform((t) => ({ ...t, scale: clampScale(t.scale / 1.2) }));
          }}
          className="w-6 h-6 rounded flex items-center justify-center bg-[#0c1322]/80 border border-border/40 text-muted-foreground hover:text-foreground"
        >
          <Minus className="w-3 h-3" />
        </button>
      </div>

      {/* Jumps badge */}
      {jumps != null && (
        <div className="absolute bottom-2 left-2 z-10 text-[10px] font-mono text-[#5cc8ec] bg-[#0c1322]/80 px-2 py-0.5 rounded border border-[rgba(92,200,236,0.2)]">
          {jumps} jump{jumps !== 1 ? "s" : ""}
        </div>
      )}

      {/* Expand button (small mode only) */}
      {!fullscreen && onExpand && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <div className="flex items-center gap-1.5 text-[11px] text-[#7fb9d6] bg-[#0c1322]/80 px-2.5 py-1 rounded-md border border-[rgba(92,200,236,0.22)]">
            <Maximize2 className="w-3 h-3" />
            Expand
          </div>
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to mission
          </button>
          <div className="ml-auto text-[11px] font-mono text-muted-foreground">
            {jumps != null ? `${jumps} jump${jumps !== 1 ? "s" : ""}` : ""}
          </div>
        </div>
        <div className="flex-1 min-h-0 p-2">{mapBody}</div>
      </div>
    );
  }

  return mapBody;
}
