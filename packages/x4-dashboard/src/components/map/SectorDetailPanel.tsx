// Right-panel detail view for a selected sector.

import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Shield, Swords, X } from "lucide-react";
import { CATEGORY_LABELS, CATEGORY_ORDER, RESOURCE_COLORS, RESOURCE_ORDER } from "../../lib/map/constants";
import { dlcLabel, sectorDisplayName } from "../../lib/map/names";
import type { Cluster, FactionSummary, Sector } from "../../lib/map/types";

export function SectorDetailPanel({ sector, cluster, resources, factionMap, onClose, connections, zoneCount, stationCategories, forces, conflict, playerCurrentSector, liveResources, onNavigate }: {
  sector: Sector;
  cluster: Cluster | null;
  resources: Set<string>;
  factionMap: Map<string, FactionSummary>;
  onClose: () => void;
  connections: { sectorId: string; name: string; kind: string }[];
  zoneCount: number;
  stationCategories: { category: string; count: number }[];
  forces: { factionId: string; factionName: string; fighterCount: number }[] | null;
  conflict: { type: string; intensity: number; invaderName?: string; sectorOwnerName?: string } | null;
  playerCurrentSector: string | null;
  liveResources: { ware: string; current: number; max: number }[] | null;
  onNavigate?: (sectorId: string) => void;
}) {
  const [descExpanded, setDescExpanded] = useState(false);

  const faction = sector.owner_faction ? factionMap.get(sector.owner_faction) : null;
  const clusterFaction = cluster?.owner_faction ? factionMap.get(cluster.owner_faction) : null;
  const effectiveFaction = faction ?? clusterFaction;
  const color = effectiveFaction?.color_hex ?? null;

  const isPlayerHere = playerCurrentSector != null
    && playerCurrentSector.toLowerCase() === sector.sector_id.toLowerCase();

  // Live resource lookup by ware name for the depletion bars.
  const liveByWare = new Map<string, { current: number; max: number }>();
  if (liveResources) {
    for (const lr of liveResources) {
      liveByWare.set(lr.ware, { current: lr.current, max: lr.max });
    }
  }
  const hasLiveResources = liveByWare.size > 0;

  // Station categories ordered and labeled.  Specific factory subtypes (e.g.
  // "Weapon Components") aren't in CATEGORY_ORDER — append them after the known
  // order so they still appear in the breakdown.
  const orderedCats = CATEGORY_ORDER
    .map((c) => ({ category: c, count: stationCategories.find((sc) => sc.category === c)?.count ?? 0 }))
    .filter((c) => c.count > 0);
  const knownCats = new Set(orderedCats.map((c) => c.category));
  for (const sc of stationCategories) {
    if (!knownCats.has(sc.category)) {
      orderedCats.push(sc);
    }
  }

  // Forces sorted by count desc.
  const sortedForces = forces ? [...forces].sort((a, b) => b.fighterCount - a.fighterCount) : null;
  const totalFighters = sortedForces?.reduce((sum, f) => sum + f.fighterCount, 0) ?? 0;

  // Connections sorted by kind (gates first) then name.
  const sortedConns = [...connections].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "gate" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="bg-[#0d121e]/97 backdrop-blur-[16px] border border-white/10 rounded-[13px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] overflow-hidden w-[320px] max-h-[calc(100vh-200px)] flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-[14px] pt-[13px] pb-[10px] border-b border-white/[0.07] shrink-0">
        <div className="flex flex-col gap-[3px] min-w-0">
          <div className="flex items-center gap-[8px]">
            {color && <div className="w-[10px] h-[10px] rounded-sm shrink-0" style={{ background: color }} />}
            <span className="font-semibold text-[13.5px] text-[#eef3fa] truncate">{sectorDisplayName(sector)}</span>
            {isPlayerHere && (
              <span className="text-[9px] px-[5px] py-[1px] rounded-[4px] bg-emerald-900/40 text-emerald-300 border border-emerald-700/30 shrink-0">
                YOU
              </span>
            )}
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

      {/* Scrollable body */}
      <div className="overflow-y-auto flex flex-col gap-[10px] px-[14px] py-[10px]">
        {/* Description */}
        {sector.description && (
          <div>
            <p className={`text-[11px] leading-[1.5] text-[#7d8ca3] italic ${descExpanded ? "" : "line-clamp-3"}`}>
              {sector.description}
            </p>
            {sector.description.length > 150 && (
              <button
                onClick={() => setDescExpanded(!descExpanded)}
                className="flex items-center gap-[4px] text-[10px] text-[#6b7890] hover:text-[#aeb7c8] mt-[4px] transition-colors cursor-pointer"
              >
                {descExpanded ? (
                  <><ChevronUp className="w-[11px] h-[11px]" /> Show less</>
                ) : (
                  <><ChevronDown className="w-[11px] h-[11px]" /> Show more</>
                )}
              </button>
            )}
          </div>
        )}

        {/* Stats pips */}
        <div className="grid grid-cols-4 gap-[7px]">
          {([ ["Econ", sector.economy], ["Sec", sector.security], ["Sun", sector.sunlight], ["Zones", zoneCount > 0 ? zoneCount : null] ] as [string, number | null][])
            .filter(([, v]) => v != null).map(([label, v]) => (
              <div key={label} className="text-center px-2 py-[7px] rounded-[8px] bg-white/[0.045] border border-white/[0.06]">
                <p className="text-[10px] text-[#6b7890] tracking-[0.8px] uppercase mb-[2px]">{label}</p>
                <p className="text-[13px] font-bold tabular-nums text-[#c4ccda]">
                  {label === "Zones" ? v : `${((v as number) * 100).toFixed(0)}%`}
                </p>
              </div>
            ))}
        </div>

        {/* Alerts */}
        <div className="flex flex-col gap-[5px]">
          {sector.tags?.includes("anarchy") && (
            <div className="text-[11px] px-[9px] py-[5px] rounded-[7px] bg-orange-900/30 text-orange-400 border border-orange-700/30 flex items-center gap-[5px]">
              <Shield className="w-[12px] h-[12px] shrink-0" /> Anarchy zone — no sector security
            </div>
          )}
          {sector.access_licence && (
            <div className="text-[11px] px-[9px] py-[5px] rounded-[7px] bg-violet-900/25 text-violet-300 border border-violet-700/30 flex items-center gap-[5px]">
              <MapPin className="w-[12px] h-[12px] shrink-0" /> {sector.access_licence} licence required
            </div>
          )}
          {conflict && (
            <div className={`text-[11px] px-[9px] py-[6px] rounded-[7px] border flex items-center gap-[5px] ${
              conflict.type === "battle" ? "bg-red-900/30 text-red-300 border-red-700/40" :
              conflict.type === "invasion" ? "bg-amber-900/30 text-amber-300 border-amber-700/40" :
              "bg-orange-900/25 text-orange-300 border-orange-700/30"
            }`}>
              <Swords className="w-[12px] h-[12px] shrink-0" />
              <span>
                <span className="font-semibold capitalize">{conflict.type}</span>
                {conflict.invaderName && conflict.sectorOwnerName && (
                  <> — {conflict.invaderName} vs {conflict.sectorOwnerName}</>
                )}
                <span className="ml-[4px] text-[10px] opacity-70">
                  ({Math.round(conflict.intensity * 100)}% intensity)
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Resources */}
        {(resources.size > 0 || hasLiveResources) && (
          <div>
            <p className="text-[10px] tracking-[1.2px] text-[#6b7890] uppercase mb-[7px]">Resources</p>
            {hasLiveResources ? (
              <div className="flex flex-col gap-[4px]">
                {RESOURCE_ORDER.filter((r) => liveByWare.has(r)).map((ware) => {
                  const lr = liveByWare.get(ware)!;
                  const pct = lr.max > 0 ? Math.min(1, lr.current / lr.max) : 0;
                  const color = RESOURCE_COLORS[ware] ?? "#94a3b8";
                  return (
                    <div key={ware} className="flex items-center gap-[7px]">
                      <span className="text-[10px] font-medium capitalize w-[55px] shrink-0 text-right" style={{ color }}>
                        {ware}
                      </span>
                      <div className="flex-1 h-[8px] rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct * 100}%`, background: color, opacity: pct < 0.15 ? 0.45 : 0.85 }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-[#6b7890] w-[60px] shrink-0">
                        {lr.current.toLocaleString()}/{lr.max.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-[6px]">
                {RESOURCE_ORDER.filter((r) => resources.has(r)).map((r) => (
                  <span key={r} className="px-[9px] py-[3px] rounded-full text-[11px] font-medium capitalize"
                    style={{ background: `${RESOURCE_COLORS[r]}22`, color: RESOURCE_COLORS[r], border: `1px solid ${RESOURCE_COLORS[r]}55` }}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Station breakdown */}
        {orderedCats.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[1.2px] text-[#6b7890] uppercase mb-[6px]">
              Stations ({orderedCats.reduce((s, c) => s + c.count, 0)})
            </p>
            <div className="flex flex-wrap gap-[5px]">
              {orderedCats.map(({ category, count }) => (
                <span key={category} className="px-[8px] py-[3px] rounded-[6px] text-[10px] bg-white/[0.04] border border-white/[0.06] text-[#aeb7c8]">
                  {CATEGORY_LABELS[category] ?? category} <span className="text-[#6b7890] ml-[2px] tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Forces */}
        {sortedForces && sortedForces.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[1.2px] text-[#6b7890] uppercase mb-[6px]">
              Forces ({totalFighters} fighters)
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {sortedForces.map((f) => {
                const fc = factionMap.get(f.factionId);
                const fColor = fc?.color_hex ?? "#6b7890";
                return (
                  <span key={f.factionId} className="px-[8px] py-[3px] rounded-[6px] text-[10px] bg-white/[0.04] border border-white/[0.06] flex items-center gap-[5px]">
                    <span className="w-[7px] h-[7px] rounded-sm shrink-0" style={{ background: fColor }} />
                    <span className="text-[#c4ccda]">{f.factionName}</span>
                    <span className="tabular-nums text-[#eef3fa] font-medium">{f.fighterCount}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Connections */}
        {sortedConns.length > 0 && (
          <div>
            <p className="text-[10px] tracking-[1.2px] text-[#6b7890] uppercase mb-[6px]">
              Connections ({sortedConns.length})
            </p>
            <div className="flex flex-wrap gap-[5px]">
              {sortedConns.map((c) => (
                <button
                  key={c.sectorId}
                  onClick={() => onNavigate?.(c.sectorId)}
                  className="px-[8px] py-[3px] rounded-[6px] text-[10px] bg-white/[0.04] border border-white/[0.06] text-[#aeb7c8] hover:bg-white/[0.08] hover:text-[#eef3fa] hover:border-white/[0.12] transition-colors cursor-pointer text-left"
                >
                  {c.name}
                  <span className="text-[#6b7890] ml-[4px]">
                    {c.kind === "highway" ? "⏩" : "⏺"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Player location indicator (if not already in header YOU badge) */}
        {isPlayerHere && (
          <div className="text-[10px] px-[9px] py-[5px] rounded-[7px] bg-emerald-900/20 text-emerald-300 border border-emerald-700/25 flex items-center gap-[5px]">
            <MapPin className="w-[11px] h-[11px] shrink-0" /> You are currently in this sector
          </div>
        )}

        {/* DLC */}
        {sector.dlc && (
          <p className="text-[10px] text-[#6b7890]/60 pt-[2px]">DLC: {dlcLabel(sector.dlc)}</p>
        )}
      </div>
    </div>
  );
}
