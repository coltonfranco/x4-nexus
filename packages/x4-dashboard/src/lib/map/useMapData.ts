// Bundles every server query the universe map depends on into one typed hook.

import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../api";
import type {
  Cluster,
  ClusterResourceEntry,
  FactionSummary,
  Gate,
  Highway,
  MapStation,
  Sector,
  SectorConnection,
  Zone,
} from "./types";

export function useMapData() {
  const clustersQuery = useQuery<Cluster[]>({
    queryKey: ["map-clusters"],
    queryFn: () => apiGet<Cluster[]>("/api/v1/map/clusters?limit=2000"),
  });
  const sectorsQuery = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => apiGet<Sector[]>("/api/v1/map/sectors?limit=2000"),
  });
  const zonesQuery = useQuery<Zone[]>({
    queryKey: ["map-zones"],
    queryFn: () => apiGet<Zone[]>("/api/v1/map/zones?limit=5000"),
  });
  const gatesQuery = useQuery<Gate[]>({
    queryKey: ["map-gates"],
    queryFn: () => apiGet<Gate[]>("/api/v1/map/gates?limit=5000"),
  });
  const highwaysQuery = useQuery<Highway[]>({
    queryKey: ["map-superhighways"],
    queryFn: () => apiGet<Highway[]>("/api/v1/map/superhighways?limit=5000"),
  });
  const connectionsQuery = useQuery<SectorConnection[]>({
    queryKey: ["map-sector-connections"],
    queryFn: () => apiGet<SectorConnection[]>("/api/v1/map/sector-connections"),
  });
  const resourcesQuery = useQuery<ClusterResourceEntry[]>({
    queryKey: ["map-cluster-resources"],
    queryFn: () => apiGet<ClusterResourceEntry[]>("/api/v1/map/cluster-resources"),
  });
  const factionsQuery = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => apiGet<FactionSummary[]>("/api/v1/factions"),
  });
  const stationsQuery = useQuery<MapStation[]>({
    queryKey: ["map-stations"],
    queryFn: () => apiGet<MapStation[]>("/api/v1/map/stations?limit=20000"),
  });

  return {
    clusters: clustersQuery.data ?? [],
    sectors: sectorsQuery.data ?? [],
    zones: zonesQuery.data ?? [],
    gates: gatesQuery.data ?? [],
    highways: highwaysQuery.data ?? [],
    connections: connectionsQuery.data ?? [],
    resources: resourcesQuery.data ?? [],
    factions: factionsQuery.data ?? [],
    stations: stationsQuery.data ?? [],
    isLoading: clustersQuery.isLoading || sectorsQuery.isLoading,
  };
}

export type MapData = ReturnType<typeof useMapData>;
