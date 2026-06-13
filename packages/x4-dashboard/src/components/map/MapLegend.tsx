import { FillMode } from "../../lib/map/overlays/types";
import { STATUS_COLORS } from "../../lib/map/constants";

export function MapLegend({ fillMode }: { fillMode: FillMode }) {
  if (fillMode === "faction") return null;

  return (
    <div className="absolute bottom-5 left-5 bg-card/90 backdrop-blur-md border border-border rounded-lg shadow-lg p-3 text-[11px] text-muted-foreground w-64 pointer-events-none z-10">
      {fillMode === "conflict" && (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-foreground font-semibold text-xs border-b border-border/50 pb-1 mb-1">Conflict Legend</h3>
          
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1.5">Sector Battles</div>
            <div className="grid grid-cols-[16px_1fr] gap-x-2 gap-y-1.5 items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-[conflict-blink-intense_0.5s_infinite]" />
              <span>Intense Battle (40+ ships)</span>
              
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-[conflict-pulse-fast_1s_infinite]" />
              <span>Invasion (15-39 ships)</span>
              
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-[conflict-pulse-slow_2s_infinite]" />
              <span>Skirmish (1-14 ships)</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1.5 mt-1">Border Tensions</div>
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
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1.5 mt-1">Danger Zones</div>
            <div className="grid grid-cols-[16px_1fr] gap-x-2 gap-y-1.5 items-center">
              <div className="w-3 h-2.5 border-2 border-red-500/80 rounded-[2px]" />
              <span>High Threat (10+ hostile)</span>
              
              <div className="w-3 h-2.5 border-2 border-orange-500/80 rounded-[2px]" />
              <span>Medium Threat (5-9 hostile)</span>
              
              <div className="w-3 h-2.5 border-2 border-yellow-500/80 rounded-[2px]" />
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
          <h3 className="text-foreground font-semibold text-xs border-b border-border/50 pb-1 mb-1">Relations Legend</h3>
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
          <h3 className="text-foreground font-semibold text-xs border-b border-border/50 pb-1 mb-1">Trade Legend</h3>
          <p className="mb-1 leading-tight">Trade routes are colored by profit per hour.</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-yellow-400 drop-shadow-[0_0_2px_rgba(250,204,21,0.8)]" />
              <span>Highly Profitable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-cyan-400 opacity-60" />
              <span>Moderately Profitable</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-0.5 bg-blue-500 opacity-30" />
              <span>Low Profit</span>
            </div>
          </div>
        </div>
      )}
      
      {fillMode === "resources" && (
        <div className="flex flex-col gap-2">
          <h3 className="text-foreground font-semibold text-xs border-b border-border/50 pb-1 mb-1">Resources Legend</h3>
          <p className="mb-1 leading-tight">Select a resource to view sector yields.</p>
          <div className="flex items-center gap-2 mt-1">
            <span>Low Yield</span>
            <div className="h-2 flex-1 rounded-full" style={{
              background: `linear-gradient(to right, ${STATUS_COLORS.danger}, ${STATUS_COLORS.warning}, ${STATUS_COLORS.success})`,
            }} />
            <span>High Yield</span>
          </div>
        </div>
      )}
    </div>
  );
}
