// Right-panel detail view for a selected sector.

import { RESOURCE_COLORS, RESOURCE_ORDER } from "../../lib/map/constants";
import { dlcLabel, sectorDisplayName } from "../../lib/map/names";
import type { Cluster, FactionSummary, Sector } from "../../lib/map/types";

export function SectorDetailPanel({ sector, cluster, resources, factionMap, onClose }: {
  sector: Sector; cluster: Cluster | null; resources: Set<string>;
  factionMap: Map<string, FactionSummary>; onClose: () => void;
}) {
  const faction = sector.owner_faction ? factionMap.get(sector.owner_faction) : null;
  const clusterFaction = cluster?.owner_faction ? factionMap.get(cluster.owner_faction) : null;
  const effectiveFaction = faction ?? clusterFaction;
  const color = effectiveFaction?.color_hex ?? null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <button onClick={onClose} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground self-start">
        ← Back
      </button>
      <div>
        <div className="flex items-center gap-2 mb-1">
          {color && <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />}
          <span className="font-bold text-sm">{sectorDisplayName(sector)}</span>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          {effectiveFaction && <p style={{ color: color ?? undefined }}>{effectiveFaction.name}</p>}
          {cluster && (
            <p>System: <span className="text-foreground">
              {cluster.name && !cluster.name.startsWith("{")
                ? cluster.name
                : (cluster.macro_id ?? cluster.cluster_id).replace(/_macro$/i, "").replace(/_/g, " ")}
            </span></p>
          )}
          {sector.dlc && <p>DLC: <span className="text-foreground">{dlcLabel(sector.dlc)}</span></p>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {([["Econ", sector.economy], ["Sec", sector.security], ["Sun", sector.sunlight]] as [string, number | null][])
          .filter(([, v]) => v != null).map(([label, v]) => (
            <div key={label} className="text-center p-2 rounded bg-muted/20">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-sm font-bold tabular-nums">{(v! * 100).toFixed(0)}%</p>
            </div>
          ))}
      </div>
      {sector.tags?.includes("anarchy") && (
        <div className="text-xs px-2 py-1 rounded bg-orange-900/30 text-orange-400">Anarchy zone</div>
      )}
      {resources.size > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Resources</p>
          <div className="flex flex-wrap gap-1.5">
            {RESOURCE_ORDER.filter((r) => resources.has(r)).map((r) => (
              <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                style={{ background: `${RESOURCE_COLORS[r]}22`, color: RESOURCE_COLORS[r], border: `1px solid ${RESOURCE_COLORS[r]}55` }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground/30 break-all mt-auto">{sector.sector_id}</p>
    </div>
  );
}
