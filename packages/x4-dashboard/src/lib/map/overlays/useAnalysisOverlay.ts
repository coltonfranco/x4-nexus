// Turns the active fill tab + selections into concrete render artifacts: per-sector
// fill tints, alternate-resource dots, badges, trade-route markers, a highlighted route
// path, and the navigation path. Sector ids are matched case-insensitively because the
// save-derived ids (offers, routes) are lowercased while the static map ids are not.

import { useMemo } from "react";

import { RESOURCE_COLORS } from "../constants";
import { heatColor } from "./heat";
import { buildAdjacency, findPath, type Path } from "./pathfinding";
import type { FillMode } from "./types";
import { useResourceData, useTopRoutes, useWareOffers, type ResourceSource } from "./useAnalysisData";

export type SectorTint = { fill: string; opacity: number };
export type RouteInfo = { wareName: string; sellSector: string; profitPerHour: number; hops: number | null };
export type RouteMarker = { id: string; coord: [number, number]; color: string; routes: RouteInfo[] };

export type AnalysisOverlay = {
  sectorTint: Map<string, SectorTint> | null; // keyed by lowercase sector id; null → faction base
  sectorBadges: Map<string, string>;
  alternateDots: Map<string, string[]>;       // lowercase sector → alt resource colors
  dimOthers: boolean;
  routeMarkers: RouteMarker[];
  highlightPath: [number, number][];
  pathPoints: [number, number][];
  pathHops: number | null;
  navOrigin: [number, number] | null;
  navDest: [number, number] | null;
  resourceSource: ResourceSource | null;
  isLoading: boolean;
};

function compact(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${s}${(a / 1_000).toFixed(1)}k`;
  return `${s}${a}`;
}

export function useAnalysisOverlay({
  fillMode, resource, wareId, maxJumps, selectedRouteSector, navFrom, navTo, sectorCoords, connections,
}: {
  fillMode: FillMode;
  resource: string | null;
  wareId: string | null;
  maxJumps: number | null;
  selectedRouteSector: string | null;
  navFrom: string | null;
  navTo: string | null;
  sectorCoords: Map<string, [number, number]>;
  connections: { from_sector_id: string; to_sector_id: string; kind: string | null }[];
}): AnalysisOverlay {
  const resourcesOn = fillMode === "resources";
  const tradeRoutesOn = fillMode === "trade" && !wareId;
  const wareOn = fillMode === "trade" && !!wareId;

  const resourceData = useResourceData(resourcesOn);
  const offers = useWareOffers(wareOn ? wareId : null);
  const routes = useTopRoutes(tradeRoutesOn || !!selectedRouteSector);

  // Case-insensitive sector coordinate lookup, shared by routes + navigation.
  const coordsCI = useMemo(() => {
    const m = new Map<string, [number, number]>();
    sectorCoords.forEach((v, k) => m.set(k.toLowerCase(), v));
    return m;
  }, [sectorCoords]);

  const adjacency = useMemo(
    () => buildAdjacency(connections.map((c) => ({
      from_sector_id: c.from_sector_id.toLowerCase(),
      to_sector_id: c.to_sector_id.toLowerCase(),
      kind: c.kind,
    }))),
    [connections]
  );
  const navPath: Path | null = useMemo(
    () => (navFrom && navTo ? findPath(adjacency, navFrom.toLowerCase(), navTo.toLowerCase()) : null),
    [navFrom, navTo, adjacency]
  );

  // ── Fill overlay ──
  const fill = useMemo(() => {
    const empty = {
      tint: null as Map<string, SectorTint> | null,
      badges: new Map<string, string>(),
      dots: new Map<string, string[]>(),
      dim: false,
      source: null as ResourceSource | null,
      loading: false,
    };

    if (fillMode === "resources") {
      const source = resourceData.data?.source ?? null;
      const loading = resourceData.isLoading;
      if (resource) {
        // Single-resource heatmap: low → high, sectors without it grayed by dimOthers.
        const wareYields = resourceData.data?.byWare.get(resource);
        if (!wareYields) return { ...empty, source, loading, dim: true };
        const tint = new Map<string, SectorTint>();
        const badges = new Map<string, string>();
        wareYields.forEach((y, sid) => {
          tint.set(sid, { fill: heatColor(y.intensity), opacity: 0.2 + 0.65 * y.intensity });
          badges.set(sid, y.label);
        });
        return { ...empty, tint, badges, dim: true, source, loading };
      }
      // Overview: dominant resource fill + alternate dots.
      const bySector = resourceData.data?.bySector;
      if (!bySector) return { ...empty, source, loading, dim: true };
      const tint = new Map<string, SectorTint>();
      const dots = new Map<string, string[]>();
      bySector.forEach((sr, sid) => {
        const color = RESOURCE_COLORS[sr.dominant.ware] ?? "#9ca3af";
        tint.set(sid, { fill: color, opacity: 0.35 + 0.5 * sr.dominant.intensity });
        const alt = sr.all.slice(1).map((e) => RESOURCE_COLORS[e.ware] ?? "#9ca3af");
        if (alt.length) dots.set(sid, alt);
      });
      return { ...empty, tint, dots, dim: true, source, loading };
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
        tint.set(sid, { fill: net >= 0 ? "#22c55e" : "#ef4444", opacity: 0.15 + 0.75 * mag });
        badges.set(sid, `${net >= 0 ? "+" : ""}${compact(net)}`);
      });
      return { ...empty, tint, badges, dim: true, loading: offers.isLoading };
    }

    return empty; // faction, or trade-routes view (no fill tint)
  }, [fillMode, wareOn, resource, resourceData.data, resourceData.isLoading, offers.data, offers.isLoading]);

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
      tint.set(sid, { fill: "#22c55e", opacity: 0.2 + 0.65 * t });
      badges.set(sid, `${compact(list[0].profitPerHour)}/h`);
    });
    return { markers, tint, badges };
  }, [tradeRoutesOn, routes.data, maxJumps, coordsCI]);
  const routeMarkers = routeData.markers;

  // ── Highlighted route path (clicked marker → buy → sell jump path) ──
  const highlightPath = useMemo<[number, number][]>(() => {
    if (!selectedRouteSector) return [];
    const marker = routeMarkers.find((m) => m.id === selectedRouteSector.toLowerCase());
    const sell = marker?.routes[0]?.sellSector;
    if (!marker || !sell) return [];
    const p = findPath(adjacency, selectedRouteSector.toLowerCase(), sell.toLowerCase());
    if (!p) return [marker.coord, coordsCI.get(sell.toLowerCase())].filter(Boolean) as [number, number][];
    return p.sectors.map((s) => coordsCI.get(s)).filter(Boolean) as [number, number][];
  }, [selectedRouteSector, routeMarkers, adjacency, coordsCI]);

  // ── Navigation (fewest-jump path) ──
  const nav = useMemo(() => {
    const pathPoints = (navPath?.sectors ?? [])
      .map((sid) => coordsCI.get(sid))
      .filter(Boolean) as [number, number][];
    const navOrigin = navFrom ? coordsCI.get(navFrom.toLowerCase()) ?? null : null;
    const navDest = navTo ? coordsCI.get(navTo.toLowerCase()) ?? null : null;
    const pathHops = navPath ? navPath.edges.length : null;
    return { pathPoints, navOrigin, navDest, pathHops };
  }, [navPath, navFrom, navTo, coordsCI]);

  return useMemo(() => ({
    sectorTint: tradeRoutesOn ? routeData.tint : fill.tint,
    sectorBadges: tradeRoutesOn ? routeData.badges : fill.badges,
    alternateDots: fill.dots,
    dimOthers: fill.dim || tradeRoutesOn,
    routeMarkers,
    highlightPath,
    pathPoints: nav.pathPoints,
    pathHops: nav.pathHops,
    navOrigin: nav.navOrigin,
    navDest: nav.navDest,
    resourceSource: fill.source,
    isLoading: fill.loading || ((tradeRoutesOn || !!selectedRouteSector) && routes.isLoading),
  }), [fill, routeData, routeMarkers, highlightPath, nav, tradeRoutesOn, selectedRouteSector, routes.isLoading]);
}
