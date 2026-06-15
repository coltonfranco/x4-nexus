// Turns the active fill tab + selections into concrete render artifacts: per-sector
// fill tints, alternate-resource dots, badges, trade-route markers, a highlighted route
// path, and the navigation path. Sector ids are matched case-insensitively because the
// save-derived ids (offers, routes) are lowercased while the static map ids are not.

import { useMemo } from "react";

import { RESOURCE_COLORS, STATUS_COLORS } from "../constants";
import { heatColor } from "./heat";
import { buildAdjacency, findPath, type TravelSegmentKind, type PathResult } from "./pathfinding";
import type { FillMode } from "./types";
import { useResourceData, useTopRoutes, useWareOffers, usePlayerRelations, useConflictData, useTensionData, useSectorForces, type ResourceSource, type SectorResources, type BorderTensionEntry, type ConflictEntry, type SectorForceEntry } from "./useAnalysisData";
import type { Cluster, Gate, Highway, Sector, Zone } from "../types";

export type SectorTint = { 
  fill: string; 
  stroke: string; 
  strokeWidth?: number; 
  strokeDasharray?: string | null; 
  animate?: string; 
  labelColor?: string; 
};
export type RouteInfo = { wareName: string; sellSector: string; profitPerHour: number; hops: number | null };
export type RouteMarker = { id: string; coord: [number, number]; color: string; routes: RouteInfo[] };

export type PathSegment = {
  p1: [number, number];
  p2: [number, number];
  kind: TravelSegmentKind;
};

export type AnalysisOverlay = {
  sectorTint: Map<string, SectorTint> | null; // keyed by lowercase sector id; null → faction base
  sectorBadges: Map<string, string>;
  sectorTooltips: Map<string, string>;
  sectorConflicts: Map<string, ConflictEntry>;
  borderTensions: Map<string, BorderTensionEntry>;
  sectorForces: Map<string, SectorForceEntry>;
  sectorResources: Map<string, SectorResources>;
  alternateDots: Map<string, string[]>;       // lowercase sector → alt resource colors
  dimOthers: boolean;
  routeMarkers: RouteMarker[];
  highlightSegments: PathSegment[];
  navSegments: PathSegment[];
  pathHops: number | null;
  pathDistanceKm: number | null;
  navOrigin: [number, number] | null;
  navDest: [number, number] | null;
  resourceSource: ResourceSource | null;
  isLoading: boolean;
};

function alpha(o: number): string {
  return Math.round(Math.max(0, Math.min(1, o)) * 255).toString(16).padStart(2, "0");
}

function compact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${s}${(a / 1_000).toFixed(1)}k`;
  return `${s}${a}`;
}

function relationToUI(rel: number): number {
  const abs = Math.abs(rel);
  if (abs <= 0.0032) return rel / 0.00064;
  return Math.sign(rel) * 10 * Math.log10(abs * 1000);
}

export type ConflictToggles = {
  showConflicts: boolean;
  showTensions: boolean;
  showDanger: boolean;
  showPlayer: boolean;
};

export function useAnalysisOverlay({
  fillMode, resource, wareId, maxJumps, selectedRouteSector, navFrom, navTo, navFromPos, navToPos, sectorCoords, gates, highways, zoneMap, zoneScreenPos, sectors, clusterMap, zoneScaleMap, conflictToggles,
}: {
  fillMode: FillMode;
  resource: string | null;
  wareId: string | null;
  maxJumps: number | null;
  selectedRouteSector: string | null;
  navFrom: string | null;
  navTo: string | null;
  navFromPos?: [number, number] | null;
  navToPos?: [number, number] | null;
  sectorCoords: Map<string, [number, number]>;
  gates: Gate[];
  highways: Highway[];
  zoneMap: Map<string, Zone>;
  zoneScreenPos: Map<string, [number, number]>;
  sectors: Sector[];
  clusterMap: Map<string, Cluster>;
  zoneScaleMap: Map<string, number>;
  conflictToggles?: ConflictToggles;
}): AnalysisOverlay {
  const resourcesOn = fillMode === "resources";
  const relationsOn = fillMode === "relations";
  const tradeRoutesOn = fillMode === "trade" && !wareId;
  const wareOn = fillMode === "trade" && !!wareId;

  const resourceData = useResourceData(resourcesOn);
  const relations = usePlayerRelations(relationsOn || fillMode === "conflict");
  const conflicts = useConflictData(true); // always pre-warm
  const tensions = useTensionData(fillMode === "conflict");
  const forces = useSectorForces(fillMode === "conflict");
  const offers = useWareOffers(wareOn ? wareId : null);
  const routes = useTopRoutes(tradeRoutesOn || !!selectedRouteSector);

  // Case-insensitive sector coordinate lookup, shared by routes + navigation.
  const coordsCI = useMemo(() => {
    const m = new Map<string, [number, number]>();
    sectorCoords.forEach((v, k) => m.set(k.toLowerCase(), v));
    return m;
  }, [sectorCoords]);

  const adjacency = useMemo(
    () => buildAdjacency(gates, highways, sectors, zoneMap, zoneScreenPos, coordsCI),
    [gates, highways, sectors, zoneMap, zoneScreenPos, coordsCI]
  );
  const navPathResult: PathResult | null = useMemo(
    () => (navFrom && navTo ? findPath(adjacency, navFrom, navTo) : null),
    [navFrom, navTo, adjacency]
  );

  const resolveNodeCoord = useMemo(() => (node: string): [number, number] | null => {
    if (node.startsWith("sector:")) {
      const sid = node.substring(7);
      if (sid === navFrom?.toLowerCase() && navFromPos) return navFromPos;
      if (sid === navTo?.toLowerCase() && navToPos) return navToPos;
      return coordsCI.get(sid) ?? null;
    }
    if (node.startsWith("zone:")) return zoneScreenPos.get(node.substring(5)) ?? null;
    return null;
  }, [coordsCI, zoneScreenPos, navFrom, navTo, navFromPos, navToPos]);

  const pathToSegments = useMemo(() => (res: PathResult | null): PathSegment[] => {
    if (!res) return [];
    const segs: PathSegment[] = [];
    for (let i = 0; i < res.edges.length; i++) {
      const p1 = resolveNodeCoord(res.nodes[i]);
      const p2 = resolveNodeCoord(res.nodes[i+1]);
      if (p1 && p2) segs.push({ p1, p2, kind: res.edges[i] });
    }
    return segs;
  }, [resolveNodeCoord]);

  // ── Fill overlay ──
  const fill = useMemo(() => {
    const empty = {
      tint: null as Map<string, SectorTint> | null,
      badges: new Map<string, string>(),
      dots: new Map<string, string[]>(),
      dim: false,
      source: null as ResourceSource | null,
      loading: false,
      tooltips: new Map<string, string>(),
      sectorTooltips: new Map(),
      sectorConflicts: new Map(),
      borderTensions: new Map(),
      sectorForces: new Map(),
      sectorResources: new Map(),
      alternateDots: new Map(),
    };

    if (fillMode === "relations") {
      const repMap = new Map<string, number>();
      (relations.data ?? []).forEach((r) => repMap.set(r.faction_id.toLowerCase(), r.relation));
      const tint = new Map<string, SectorTint>();
      const badges = new Map<string, string>();
      sectors.forEach((sec) => {
        let owner = sec.owner_faction;
        if (!owner && sec.cluster_id) {
          const clus = clusterMap.get(sec.cluster_id);
          if (clus) owner = clus.owner_faction;
        }
        if (owner) {
          const rel = repMap.get(owner.toLowerCase()) ?? 0;
          const relUI = relationToUI(rel);
          const mag = Math.min(30, Math.abs(relUI)) / 30.0;
          
          badges.set(sec.sector_id.toLowerCase(), `${relUI >= 0 ? "+" : ""}${Math.round(relUI)}`);

          if (Math.abs(relUI) >= 0.5) {
            const fill = relUI > 0 ? STATUS_COLORS.success : STATUS_COLORS.danger;
            const opacity = 0.15 + 0.65 * mag;
            tint.set(sec.sector_id.toLowerCase(), { fill: `${fill}${alpha(opacity)}`, stroke: `${fill}${alpha(0.85)}` });
          }
        }
      });
      return { ...empty, tint, badges, dim: true, loading: relations.isLoading };
    }

    if (fillMode === "conflict") {
      const tint = new Map<string, SectorTint>();
      const sectorConflicts = new Map<string, ConflictEntry>();
      const borderTensions = new Map<string, BorderTensionEntry>();
      const sectorForces = new Map<string, SectorForceEntry>();
      const dots = new Map<string, string[]>();
      
      const toggles = conflictToggles ?? { showConflicts: true, showTensions: true, showDanger: true, showPlayer: true };

      const forceData = forces.data ?? [];
      forceData.forEach((f) => {
        const sid = f.sector_id.toLowerCase();
        sectorForces.set(sid, f);
        
        if (toggles.showPlayer) {
          const playerForce = f.factions.find((fac) => fac.faction_id === "player");
          if (playerForce && playerForce.fighter_count > 0) {
            dots.set(sid, ["#22c55e"]);
          }
        }
      });
      
      const hostileFactions = new Set<string>();
      if (relations.data) {
        for (const rel of relations.data) {
          const uiRel = relationToUI(rel.relation);
          if (uiRel <= -20) {
            hostileFactions.add(rel.faction_id.toLowerCase());
          }
        }
      }

      (conflicts.data ?? []).forEach((c) => {
        sectorConflicts.set(c.sector_id.toLowerCase(), c);
      });
      
      sectors.forEach((s) => {
        const sid = s.sector_id.toLowerCase();
        let isDangerous = false;

        let owner = s.owner_faction;
        if (!owner && s.cluster_id) {
          owner = clusterMap.get(s.cluster_id)?.owner_faction ?? null;
        }
        if (owner && hostileFactions.has(owner.toLowerCase())) {
          isDangerous = true;
        }

        let hostileCount = 0;

        const f = sectorForces.get(sid);
        if (f) {
          for (const fac of f.factions) {
            if (hostileFactions.has(fac.faction_id.toLowerCase())) {
              hostileCount += fac.fighter_count;
            }
          }
          if (hostileCount > 0) {
            isDangerous = true; // Any hostiles makes it dangerous, but we'll tier it
          }
        }

        let baseFill = "rgba(255,255,255,0.035)";
        let baseStroke = "rgba(255,255,255,0.12)";
        let sw = 0.6;
        let dash: string | null = null;
        let labelColor = "#cfd8e6";
        let animate: string | undefined;

        const cfCol: Record<string, string> = { battle: "#e0483f", invasion: "#e07a2f", skirmish: "#d8b42f" };
        const c = sectorConflicts.get(sid);

        // Styling hierarchy: Battle > Danger
        if (c && toggles.showConflicts) {
          const hex = cfCol[c.type] || "#ffffff";
          const op = c.type === "battle" ? 0.34 : c.type === "invasion" ? 0.30 : 0.26;
          baseFill = `${hex}${alpha(op)}`;
          baseStroke = `${hex}${alpha(0.92)}`;
          if (c.type === "battle") animate = "conflict-blink-intense 0.3s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate";
          else if (c.type === "invasion") animate = "conflict-pulse-fast 0.6s ease-in-out infinite alternate";
          else if (c.type === "skirmish") animate = "conflict-pulse-slow 2s ease-in-out infinite alternate";
        } else if (isDangerous && toggles.showDanger) {
          if (hostileCount >= 10) baseStroke = "#e0483f";
          else if (hostileCount >= 5) baseStroke = "#e07a2f";
          else baseStroke = "#d8b42f";
          dash = "5 4";
        }

        if (toggles.showPlayer) {
          const playerForce = f?.factions.find((fac) => fac.faction_id === "player");
          if (playerForce && playerForce.fighter_count > 0) {
            dots.set(sid, ["#22c55e"]);
          }
        }

        const hasConflictStyle = c && toggles.showConflicts;
        const hasDangerStyle = isDangerous && toggles.showDanger;
        if (!hasConflictStyle && !hasDangerStyle) {
           // dim
           baseStroke = "transparent";
        }

        tint.set(sid, {
          fill: baseFill,
          stroke: baseStroke,
          strokeWidth: sw,
          strokeDasharray: dash,
          labelColor,
          animate
        });
      });

      const tensionData = tensions.data ?? [];
      if (toggles.showTensions) {
        tensionData.forEach((t) => {
          const a = t.from_sector_id.toLowerCase();
          const b = t.to_sector_id.toLowerCase();
          const key = a < b ? `${a}_${b}` : `${b}_${a}`;
          borderTensions.set(key, t);
        });
      }
      
      return { ...empty, tint, sectorConflicts, borderTensions, sectorForces, dots, dim: true, loading: false };
    }


    if (fillMode === "resources") {
      const source = resourceData.data?.source ?? null;
      const loading = resourceData.isLoading;
      if (resource) {
        // Single-resource heatmap: low → high, sectors without it grayed by dimOthers.
        const wareYields = resourceData.data?.byWare.get(resource);
        if (!wareYields) return { ...empty, source, loading, dim: true };
        const tint = new Map<string, SectorTint>();
        const badges = new Map<string, string>();
        const sectorResources = new Map<string, SectorResources>();
        wareYields.forEach((y, sid) => {
          const hc = heatColor(y.intensity);
          tint.set(sid, { fill: `${hc}${alpha(0.2 + 0.65 * y.intensity)}`, stroke: `${hc}${alpha(0.9)}` });
          badges.set(sid, y.label);
          const sr = resourceData.data?.bySector.get(sid);
          if (sr) sectorResources.set(sid, sr);
        });
        return { ...empty, tint, badges, sectorResources, dim: true, source, loading };
      }
      // Overview: dominant resource fill + alternate dots.
      const bySector = resourceData.data?.bySector;
      if (!bySector) return { ...empty, source, loading, dim: true };
      const tint = new Map<string, SectorTint>();
      const dots = new Map<string, string[]>();
      bySector.forEach((sr, sid) => {
        const color = RESOURCE_COLORS[sr.dominant.ware] ?? "var(--muted-foreground)";
        tint.set(sid, { fill: `${color}${alpha(0.15 + 0.65 * sr.dominant.intensity)}`, stroke: `${color}${alpha(0.85)}` });
        const alt = sr.all.slice(1).map((e) => RESOURCE_COLORS[e.ware] ?? "var(--muted-foreground)");
        if (alt.length) dots.set(sid, alt);
      });
      return { ...empty, tint, dots, sectorResources: bySector, dim: true, source, loading };
    }

    if (wareOn) {
      // Signed net volume: green = surplus (supply − demand), red = deficit, gray ≈ 0.
      const bySector = new Map<string, { supply: number; demand: number }>();
      (offers.data ?? []).forEach((o) => {
        if (!o.sector_id) return;
        const sid = o.sector_id.toLowerCase();
        const a = bySector.get(sid) ?? { supply: 0, demand: 0 };
        if (o.side === "sell") a.supply += o.quantity;
        else a.demand += o.quantity;
        bySector.set(sid, a);
      });
      let maxAbs = 1;
      bySector.forEach((a) => { maxAbs = Math.max(maxAbs, Math.abs(a.supply - a.demand)); });
      const tint = new Map<string, SectorTint>();
      const badges = new Map<string, string>();
      bySector.forEach((a, sid) => {
        const net = a.supply - a.demand;
        const mag = Math.abs(net) / maxAbs;
        const hex = net >= 0 ? STATUS_COLORS.success : STATUS_COLORS.danger;
        tint.set(sid, { fill: `${hex}${alpha(0.15 + 0.75 * mag)}`, stroke: `${hex}${alpha(0.85)}` });
        badges.set(sid, `${net >= 0 ? "+" : ""}${compact(net)}`);
      });
      return { ...empty, tint, badges, dim: true, loading: offers.isLoading };
    }

    return empty; // faction, or trade-routes view (no fill tint)
  }, [fillMode, wareOn, resource, resourceData.data, resourceData.isLoading, offers.data, offers.isLoading, relations.data, relations.isLoading, conflicts.data, tensions.data, forces.data, sectors, clusterMap, conflictToggles]);

  // ── Trade routes: one marker per buy sector, plus a profit tint so the whole hex
  // reads as "better/worse run" and is a big click target. Filtered by max jumps. ──
  const routeData = useMemo(() => {
    const markers: RouteMarker[] = [];
    const tint = new Map<string, SectorTint>();
    const badges = new Map<string, string>();
    if (!tradeRoutesOn) return { markers, tint, badges };
    const rows = (routes.data ?? []).filter(
      (r) => maxJumps == null || (r.hops != null && r.hops <= maxJumps)
    );
    const maxP = Math.max(1, ...rows.map((r) => r.est_profit_per_hour));
    const bySector = new Map<string, RouteInfo[]>();
    rows.forEach((r) => {
      if (!r.buy_sector || !r.sell_sector) return;
      const sid = r.buy_sector.toLowerCase();
      const list = bySector.get(sid) ?? [];
      list.push({
        wareName: r.ware_name ?? r.ware_id,
        sellSector: r.sell_sector,
        profitPerHour: r.est_profit_per_hour,
        hops: r.hops,
      });
      bySector.set(sid, list);
    });
    bySector.forEach((list, sid) => {
      const coord = coordsCI.get(sid);
      if (!coord) return;
      list.sort((a, b) => b.profitPerHour - a.profitPerHour);
      const t = list[0].profitPerHour / maxP;
      markers.push({
        id: sid,
        coord,
        color: `hsl(${140 - 35 * (1 - t)}, 80%, ${45 + 15 * t}%)`,
        routes: list.slice(0, 4),
      });
      tint.set(sid, { fill: `${STATUS_COLORS.success}${alpha(0.2 + 0.65 * t)}`, stroke: `${STATUS_COLORS.success}${alpha(0.85)}` });
      badges.set(sid, `${compact(list[0].profitPerHour)}/h`);
    });
    return { markers, tint, badges };
  }, [tradeRoutesOn, routes.data, maxJumps, coordsCI]);
  const routeMarkers = routeData.markers;

  // ── Highlighted route path (clicked marker → buy → sell jump path) ──
  const highlightSegments = useMemo<PathSegment[]>(() => {
    if (!selectedRouteSector) return [];
    const marker = routeMarkers.find((m) => m.id === selectedRouteSector.toLowerCase());
    const sell = marker?.routes[0]?.sellSector;
    if (!marker || !sell) return [];
    const p = findPath(adjacency, selectedRouteSector, sell);
    return pathToSegments(p);
  }, [selectedRouteSector, routeMarkers, adjacency, pathToSegments]);

  // ── Navigation (fewest-jump path) ──
  const nav = useMemo(() => {
    const navSegments = pathToSegments(navPathResult);
    const navOrigin = navFrom ? (navFromPos ?? coordsCI.get(navFrom.toLowerCase()) ?? null) : null;
    const navDest = navTo ? (navToPos ?? coordsCI.get(navTo.toLowerCase()) ?? null) : null;
    
    // If navigation is within the exact same sector, inject a single manual segment
    if (navSegments.length === 0 && navFrom && navFrom === navTo && navOrigin && navDest) {
      navSegments.push({ p1: navOrigin, p2: navDest, kind: "manual" });
    }
    
    // Count only major inter-sector hops for the UI display, and sum travel distances.
    let hops = 0;
    let distSvg = 0;
    
    for (const seg of navSegments) {
      if (seg.kind === "jump_gate" || seg.kind === "accelerator" || seg.kind === "superhighway") {
        hops++;
      } else {
        const dx = seg.p1[0] - seg.p2[0];
        const dy = seg.p1[1] - seg.p2[1];
        distSvg += Math.sqrt(dx * dx + dy * dy);
      }
    }
    
    const pathHops = navFrom && navTo && navFrom !== navTo && navPathResult ? hops : null;
    const defaultScale = zoneScaleMap.get("__default") ?? 1;
    const pathDistanceKm = (navFrom && navTo && defaultScale > 0) ? (distSvg / defaultScale) / 1000 : null;

    return { navSegments, navOrigin, navDest, pathHops, pathDistanceKm };
  }, [navPathResult, navFrom, navTo, navFromPos, navToPos, coordsCI, pathToSegments, zoneScaleMap]);

  return useMemo(() => ({
    sectorTint: tradeRoutesOn ? routeData.tint : fill.tint,
    sectorBadges: tradeRoutesOn ? routeData.badges : fill.badges,
    sectorTooltips: fill.tooltips,
    sectorConflicts: fill.sectorConflicts,
    borderTensions: fill.borderTensions,
    sectorForces: fill.sectorForces,
    sectorResources: fill.sectorResources,
    alternateDots: fill.dots,
    dimOthers: fill.dim || tradeRoutesOn,
    routeMarkers,
    highlightSegments,
    navSegments: nav.navSegments,
    pathHops: nav.pathHops,
    pathDistanceKm: nav.pathDistanceKm,
    navOrigin: nav.navOrigin,
    navDest: nav.navDest,
    resourceSource: fill.source,
    isLoading: fill.loading || ((tradeRoutesOn || !!selectedRouteSector) && routes.isLoading),
  }), [fill, routeData, routeMarkers, highlightSegments, nav, tradeRoutesOn, selectedRouteSector, routes.isLoading]);
}
