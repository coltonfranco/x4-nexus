// Bundles every server query the universe map depends on into one typed hook.

import { useQuery } from "@tanstack/react-query";

import type {
  Cluster,
  ClusterResourceEntry,
  FactionSummary,
  Gate,
  Highway,
  Sector,
  SectorConnection,
  Zone,
} from "./types";

const okJson = (r: Response) => {
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
};

export function useMapData() {
  const clustersQuery = useQuery<Cluster[]>({
    queryKey: ["map-clusters"],
    queryFn: () => fetch("/api/v1/map/clusters?limit=2000").then((r) => r.json()),
  });
  const sectorsQuery = useQuery<Sector[]>({
    queryKey: ["map-sectors"],
    queryFn: () => fetch("/api/v1/map/sectors?limit=2000").then((r) => r.json()),
  });
  const zonesQuery = useQuery<Zone[]>({
    queryKey: ["map-zones"],
    queryFn: () => fetch("/api/v1/map/zones?limit=5000").then(okJson),
  });
  const gatesQuery = useQuery<Gate[]>({
    queryKey: ["map-gates"],
    queryFn: () => fetch("/api/v1/map/gates?limit=5000").then(okJson),
  });
  const highwaysQuery = useQuery<Highway[]>({
    queryKey: ["map-superhighways"],
    queryFn: () => fetch("/api/v1/map/superhighways?limit=5000").then(okJson),
  });
  const connectionsQuery = useQuery<SectorConnection[]>({
    queryKey: ["map-sector-connections"],
    queryFn: () => fetch("/api/v1/map/sector-connections").then((r) => r.json()),
  });
  const resourcesQuery = useQuery<ClusterResourceEntry[]>({
    queryKey: ["map-cluster-resources"],
    queryFn: () => fetch("/api/v1/map/cluster-resources").then((r) => r.json()),
  });
  const factionsQuery = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
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
    isLoading: clustersQuery.isLoading || sectorsQuery.isLoading,
  };
}

export type MapData = ReturnType<typeof useMapData>;
