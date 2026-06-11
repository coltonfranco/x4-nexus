// Shared types for the universe map feature. These mirror the shapes returned by
// the /api/v1/map/* and /api/v1/factions endpoints.

export type Cluster = {
  cluster_id: string;
  macro_id: string | null;
  name: string | null;
  owner_faction: string | null;
  dlc: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  qx: number | null;
  qy: number | null;
  qz: number | null;
  qw: number | null;
};

export type Sector = {
  sector_id: string;
  cluster_id: string | null;
  macro_id: string | null;
  name: string | null;
  owner_faction: string | null;
  dlc: string | null;
  sunlight: number | null;
  economy: number | null;
  security: number | null;
  tags: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
  qx: number | null;
  qy: number | null;
  qz: number | null;
  qw: number | null;
};

export type Zone = {
  zone_id: string;
  sector_id: string | null;
  x: number | null;
  y: number | null;
  z: number | null;
};

export type Gate = { from_zone_id: string; to_zone_id: string; kind: string | null };
export type Highway = { from_zone_id: string; to_zone_id: string; kind: string };
export type SectorConnection = { from_sector_id: string; to_sector_id: string; kind: string | null };
export type ClusterResourceEntry = { cluster_id: string; ware: string; yield_level: string };
export type FactionSummary = { faction_id: string; name: string; color_hex: string | null };

export type Transform = { x: number; y: number; scale: number };
