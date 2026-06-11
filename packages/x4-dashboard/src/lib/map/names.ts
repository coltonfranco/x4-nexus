// Display-name helpers for sectors and DLCs.

import { DLC_LABELS } from "./constants";
import type { Sector } from "./types";

export function sectorDisplayName(s: Sector): string {
  if (s.name && !s.name.startsWith("{") && !/^(Cluster|cluster)_/i.test(s.name)) {
    return s.name;
  }
  const base = s.macro_id ?? s.sector_id;
  return base
    .replace(/_macro$/i, "")
    .replace(/^Cluster_0*(\d+)_Sector0*(\d+)$/i, "C$1 S$2")
    .replace(/^Cluster_(\w+)_Sector0*(\d+)$/i, "$1 S$2")
    .replace(/_/g, " ");
}

export function dlcLabel(dlc: string | null | undefined): string {
  if (!dlc) return "Base Game";
  return DLC_LABELS[dlc.toLowerCase()] ?? dlc.replace(/_/g, " ");
}
