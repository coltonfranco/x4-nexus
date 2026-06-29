import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { FillMode } from "../../lib/map/overlays/types";
import { STATUS_COLORS, RESOURCE_COLORS, RESOURCE_ORDER, MAP_THEME } from "../../lib/map/constants";
import type { FactionSummary } from "../../lib/map/types";

export function MapLegend({
  fillMode,
  factionMap,
  resource,
}: {
  fillMode: FillMode;
  factionMap?: Map<string, FactionSummary>;
  resource?: string | null;
}) {
  const [open, setOpen] = useState(true);

  const legendLabel =
    fillMode === "conflict" ? "Conflict Legend" :
    fillMode === "relations" ? "Relations Legend" :
    fillMode === "trade" ? "Trade Legend" :
    fillMode === "resources" ? "Resources Legend" :
    fillMode === "faction" ? "Faction Legend" : "Legend";

  const factionsList = useMemo(() => {
    if (!factionMap) return [];
    const factions = Array.from(factionMap.values());
    // Filter out factions without a name or color, and sort alphabetically
    return factions
      .filter(f => f.name && f.color_hex)
      .sort((a, b) => a.name!.localeCompare(b.name!));
  }, [factionMap]);

  return (
    <div className="absolute bottom-5 left-5 bg-card/90 backdrop-blur-md border border-border rounded-lg shadow-lg text-[11px] text-muted-foreground w-64 pointer-events-auto z-10">
      {/* Collapsable header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 rounded-t-lg"
      >
        <span className="text-foreground font-semibold text-xs">{legendLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          strokeWidth={2}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0">
      {fillMode === "faction" && factionsList.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          <div className="flex flex-col gap-1.5">
            {factionsList.map(f => (
              <div key={f.faction_id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: f.color_hex! }} />
                <span className="truncate">{f.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded shrink-0 border border-white/10" style={{ backgroundColor: MAP_THEME.sectorFallback }} />
              <span className="truncate italic opacity-80">Unclaimed Space</span>
            </div>
          </div>
        </div>
      )}

      {fillMode === "conflict" && (
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-1.5">Sector Battles</div>
            <div className="grid grid-cols-[16px_1fr] gap-x-2 gap-y-1.5 items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-[conflict-blink-intense_0.5s_infinite]" />
              <span>Intense Battle (10+ ships per side)</span>

              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-[conflict-pulse-fast_1s_infinite]" />
              <span>Invasion (5+ hostiles vs Owner)</span>

              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-[conflict-pulse-slow_2s_infinite]" />
              <span>Skirmish (Minor Conflict)</span>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-1.5 mt-1">Border Tensions</div>
            <div className="grid grid-cols-[16px_1fr] gap-x-2 gap-y-1.5 items-center">
              <div className="w-3 h-0.5 bg-red-500 animate-[conflict-blink-intense_0.5s_infinite]" />
              <span>Massive Fleet (120+ ships)</span>

              <div className="w-3 h-0.5 bg-red-500" />
              <span>Large Fleet (75-119 ships)</span>

              <div className="w-3 h-0.5 bg-orange-500" />
              <span>Medium Fleet (45-74 ships)</span>

              <div className="w-3 h-0.5 bg-yellow-500" />
              <span>Small Fleet (1-44 ships)</span>
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground/80 mb-1.5 mt-1">Danger Zones</div>
            <div className="grid grid-cols-[16px_1fr] gap-x-2 gap-y-1.5 items-center">
              <div className="w-3 h-2.5 border-2 border-dashed border-red-500/80 rounded-[2px]" />
              <span>High Threat (10+ hostile)</span>

              <div className="w-3 h-2.5 border-2 border-dashed border-orange-500/80 rounded-[2px]" />
              <span>Medium Threat (5-9 hostile)</span>

              <div className="w-3 h-2.5 border-2 border-dashed border-yellow-500/80 rounded-[2px]" />
              <span>Low Threat (1-4 hostile)</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 rounded-full bg-green-500 ml-0.5" />
            <span>Player Forces Present</span>
          </div>
        </div>
      )}

      {fillMode === "relations" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500" />
              <span>Ally (+20 to +30)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500/40" />
              <span>Friend (+10 to +19)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-muted-foreground/30" />
              <span>Neutral (-9 to +9)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500/40" />
              <span>Hostile (-10 to -19)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-500" />
              <span>Enemy (-20 to -30)</span>
            </div>
          </div>
        </div>
      )}

      {fillMode === "trade" && (
        <div className="flex flex-col gap-2">
          <p className="mb-1 leading-tight">Sector trade route profit per hour.</p>
          <div className="flex items-center gap-2 mt-1">
            <span>Low Profit</span>
            <div className="h-2 flex-1 rounded-full" style={{
              background: `linear-gradient(to right, ${STATUS_COLORS.danger}, ${STATUS_COLORS.warning}, ${STATUS_COLORS.success})`,
            }} />
            <span>High Profit</span>
          </div>
        </div>
      )}

      {fillMode === "resources" && (
        <div className="flex flex-col gap-2">
          {resource ? (
            <>
              <p className="mb-1 leading-tight">
                {resource === "sunlight"
                  ? "Sunlight intensity by sector."
                  : <>Sector yields for <span className="capitalize text-foreground font-medium">{resource.replace(/_/g, " ")}</span>.</>
                }
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span>{resource === "sunlight" ? "Low" : "Low Yield"}</span>
                <div className="h-2 flex-1 rounded-full" style={{
                  background: `linear-gradient(to right, ${STATUS_COLORS.danger}, ${STATUS_COLORS.warning}, ${STATUS_COLORS.success})`,
                }} />
                <span>{resource === "sunlight" ? "High" : "High Yield"}</span>
              </div>
            </>
          ) : (
            <>
              <p className="mb-1 leading-tight">Dominant resource by area.</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
                {RESOURCE_ORDER.map(res => (
                  <div key={res} className="flex items-center gap-2">
                    {res !== "sunlight" ? (
                      <div
                        className="w-3.5 h-3.5 shrink-0"
                        style={{
                          backgroundColor: RESOURCE_COLORS[res] ?? "#888",
                          WebkitMaskImage: `url(/static/icons/wares/ware_${res === "rawscrap" ? "scrapmetal" : res}.png)`,
                          WebkitMaskSize: "contain",
                          WebkitMaskRepeat: "no-repeat",
                          WebkitMaskPosition: "center",
                        }}
                      />
                    ) : (
                      <div
                        className="w-3 h-3 rounded shrink-0 mx-[1px]"
                        style={{ backgroundColor: RESOURCE_COLORS[res] ?? "#888" }}
                      />
                    )}
                    <span className="capitalize">{res.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
        </div>
      )}
    </div>
  );
}
