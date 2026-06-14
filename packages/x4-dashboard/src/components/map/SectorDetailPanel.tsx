// Right-panel detail view for a selected sector.

import { X } from "lucide-react";
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
    <div className="bg-[#0d121e]/96 backdrop-blur-[16px] border border-white/10 rounded-[13px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] overflow-hidden w-[260px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-[14px] pt-[13px] pb-[10px] border-b border-white/[0.07]">
        <div className="flex flex-col gap-[3px] min-w-0">
          <div className="flex items-center gap-[8px]">
            {color && <div className="w-[10px] h-[10px] rounded-sm shrink-0" style={{ background: color }} />}
            <span className="font-semibold text-[13.5px] text-[#eef3fa] truncate">{sectorDisplayName(sector)}</span>
          </div>
          {effectiveFaction && (
            <p className="text-[11px] pl-[18px]" style={{ color: color ?? "#6b7890" }}>{effectiveFaction.name}</p>
          )}
          {cluster && (
            <p className="text-[11px] text-[#6b7890] pl-[18px]">
              {cluster.name && !cluster.name.startsWith("{")
                ? cluster.name
                : (cluster.macro_id ?? cluster.cluster_id).replace(/_macro$/i, "").replace(/_/g, " ")}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 mt-[1px] w-[22px] h-[22px] flex items-center justify-center rounded-[6px] text-[#6b7890] hover:text-[#eef3fa] hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-[13px] h-[13px]" strokeWidth={2} />
        </button>
      </div>

      {/* Stats */}
      <div className="px-[14px] py-[10px] flex flex-col gap-[10px]">
        <div className="grid grid-cols-3 gap-[8px]">
          {([ ["Econ", sector.economy], ["Sec", sector.security], ["Sun", sector.sunlight] ] as [string, number | null][])
            .filter(([, v]) => v != null).map(([label, v]) => (
              <div key={label} className="text-center px-2 py-[7px] rounded-[8px] bg-white/[0.045] border border-white/[0.06]">
                <p className="text-[10px] text-[#6b7890] tracking-[0.8px] uppercase mb-[2px]">{label}</p>
                <p className="text-[13px] font-bold tabular-nums text-[#c4ccda]">{(v! * 100).toFixed(0)}%</p>
              </div>
            ))}
        </div>

        {sector.tags?.includes("anarchy") && (
          <div className="text-[11px] px-[9px] py-[5px] rounded-[7px] bg-orange-900/30 text-orange-400 border border-orange-700/30">
            ⚠ Anarchy zone
          </div>
        )}

        {resources.size > 0 && (
          <div>
            <p className="text-[10px] tracking-[1.2px] text-[#6b7890] uppercase mb-[8px]">Resources</p>
            <div className="flex flex-wrap gap-[6px]">
              {RESOURCE_ORDER.filter((r) => resources.has(r)).map((r) => (
                <span key={r} className="px-[9px] py-[3px] rounded-full text-[11px] font-medium capitalize"
                  style={{ background: `${RESOURCE_COLORS[r]}22`, color: RESOURCE_COLORS[r], border: `1px solid ${RESOURCE_COLORS[r]}55` }}>
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {sector.dlc && (
          <p className="text-[10px] text-[#6b7890]/60">DLC: {dlcLabel(sector.dlc)}</p>
        )}
      </div>
    </div>
  );
}

