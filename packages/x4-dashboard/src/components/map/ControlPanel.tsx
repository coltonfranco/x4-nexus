// Right-panel map controls (below the overlay tabs): connection-line toggles and DLC
// filters. Faction colors and resources are no longer toggles here — they're the
// Faction and Resources overlay tabs.

import { dlcLabel } from "../../lib/map/names";

export function ControlPanel({
  allDlcs, activeDlcs, showGates, showHighways, showLocalHighways, showGrid, showStations, showFactionLogos, bgStyle,
  onToggleGates, onToggleHighways, onToggleLocalHighways, onToggleGrid, onToggleStations, onToggleFactionLogos, onBgStyleChange, onToggleDlc,
}: {
  allDlcs: string[]; activeDlcs: Set<string>;
  showGates: boolean; showHighways: boolean; showLocalHighways: boolean; showGrid: boolean; showStations: boolean; showFactionLogos: boolean;
  bgStyle: "nebula" | "starfield" | "flat";
  onToggleGates: (v: boolean) => void;
  onToggleHighways: (v: boolean) => void; onToggleLocalHighways: (v: boolean) => void;
  onToggleGrid: (v: boolean) => void; onToggleStations: (v: boolean) => void; onToggleFactionLogos: (v: boolean) => void;
  onBgStyleChange: (v: "nebula" | "starfield" | "flat") => void;
  onToggleDlc: (dlc: string, on: boolean) => void;
}) {
  return (
    <div className="p-4 flex flex-col gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Overlays</p>
        <div className="space-y-2">
          {([
            ["Gates", showGates, onToggleGates],
            ["Superhighways", showHighways, onToggleHighways],
            ["Local Highways", showLocalHighways, onToggleLocalHighways],
            ["Hex Grid", showGrid, onToggleGrid],
            ["Stations", showStations, onToggleStations],
            ["Faction Logos", showFactionLogos, onToggleFactionLogos],
          ] as [string, boolean, (v: boolean) => void][]).map(([label, checked, setter]) => (
            <label key={label} className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
              <input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} className="w-3 h-3 accent-primary" />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Background</p>
        <div className="flex bg-muted/50 p-1 rounded-md">
          {(["nebula", "starfield", "flat"] as const).map((style) => (
            <button
              key={style}
              onClick={() => onBgStyleChange(style)}
              className={`flex-1 text-[10px] font-medium py-1 px-2 rounded capitalize transition-colors ${
                bgStyle === style ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>
      {allDlcs.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">DLC</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
              <input type="checkbox" checked disabled className="w-3 h-3" />
              Base Game
            </label>
            {allDlcs.map((dlc) => (
              <label key={dlc} className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                <input type="checkbox" checked={activeDlcs.has(dlc)}
                  onChange={(e) => onToggleDlc(dlc, e.target.checked)} className="w-3 h-3 accent-primary" />
                {dlcLabel(dlc)}
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs text-muted-foreground/40 space-y-0.5 pt-4 border-t border-border">
        <p>Scroll · zoom</p>
        <p>Drag · pan</p>
        <p>Click hex · details</p>
      </div>
    </div>
  );
}
