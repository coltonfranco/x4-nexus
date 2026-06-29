import { dlcLabel } from "../../lib/map/names";
import { useState } from "react";

const BG_STYLES = [
  { id: "nebula" as const, label: "Nebula" },
  { id: "starfield" as const, label: "Stars" },
  { id: "flat" as const, label: "Flat" },
];

export function MapLayersPanel({
  allDlcs, activeDlcs,
  showGates, showHighways, showLocalHighways, showGrid, showStations, showFactionLogos, showSectorNames,
  showPlayer, bgStyle, onBgStyleChange,
  onToggleGates, onToggleHighways, onToggleLocalHighways, onToggleGrid, onToggleStations, onToggleFactionLogos, onToggleSectorNames,
  onTogglePlayer, onToggleDlc,
}: {
  allDlcs: string[]; activeDlcs: Set<string>;
  showGates: boolean; showHighways: boolean; showLocalHighways: boolean; showGrid: boolean; showStations: boolean; showFactionLogos: boolean; showSectorNames: boolean; showPlayer: boolean;
  bgStyle: "nebula" | "starfield" | "flat";
  onBgStyleChange: (v: "nebula" | "starfield" | "flat") => void;
  onToggleGates: (v: boolean) => void;
  onToggleHighways: (v: boolean) => void;
  onToggleLocalHighways: (v: boolean) => void;
  onToggleGrid: (v: boolean) => void;
  onToggleStations: (v: boolean) => void;
  onToggleFactionLogos: (v: boolean) => void;
  onToggleSectorNames: (v: boolean) => void;
  onTogglePlayer: (v: boolean) => void;
  onToggleDlc: (dlc: string, on: boolean) => void;
}) {
  const [dlcOpen, setDlcOpen] = useState(false);

  const overlays = [
    ["Gates", showGates, onToggleGates],
    ["Superhighways", showHighways, onToggleHighways],
    ["Local Highways", showLocalHighways, onToggleLocalHighways],
    ["Hex Grid", showGrid, onToggleGrid],
    ["Stations", showStations, onToggleStations],
    ["Faction", showFactionLogos, onToggleFactionLogos],
    ["Sector Names", showSectorNames, onToggleSectorNames],
    ["Player Location", showPlayer, onTogglePlayer],
  ] as [string, boolean, (v: boolean) => void][];

  return (
    <div className="absolute top-[64px] right-[20px] w-[248px] bg-[#0d121e]/96 backdrop-blur-[16px] border border-white/10 rounded-[13px] p-[15px] shadow-[0_18px_50px_rgba(0,0,0,0.55)] z-20">
      {/* Overlay toggles */}
      <div className="text-[10px] tracking-[1.4px] text-[#6b7890] mb-[11px]">MAP OVERLAYS</div>
      <div className="flex flex-col gap-[10px]">
        {overlays.map(([label, checked, setter]) => (
          <div key={label} className="flex items-center gap-[9px] cursor-pointer group" onClick={() => setter(!checked)}>
            <div className={`w-[15px] h-[15px] rounded-[4px] shrink-0 border transition-colors flex items-center justify-center ${
              checked ? "bg-primary border-primary/70" : "bg-transparent border-white/[0.18]"
            }`}>
              {checked && <div className="w-1.5 h-1.5 rounded-sm bg-white/80" />}
            </div>
            <span className="text-[12.5px] text-[#c4ccda] group-hover:text-white transition-colors">{label}</span>
          </div>
        ))}
      </div>

      {/* Background style */}
      <div className="h-[1px] bg-white/[0.07] my-[14px]" />
      <div className="text-[10px] tracking-[1.4px] text-[#6b7890] mb-[9px]">BACKGROUND</div>
      <div className="flex gap-[5px]">
        {BG_STYLES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onBgStyleChange(id)}
            className={`flex-1 py-[5px] rounded-[7px] text-[11.5px] font-medium border transition-colors ${
              bgStyle === id
                ? "bg-primary/20 border-primary/50 text-white"
                : "bg-white/5 border-white/[0.10] text-[#8a97ad] hover:text-[#c4ccda] hover:bg-white/[0.08]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* DLC / Content */}
      {allDlcs.length > 0 && (
        <>
          <div className="h-[1px] bg-white/[0.07] my-[14px]" />
          <div className="flex items-center justify-between cursor-pointer group" onClick={() => setDlcOpen(!dlcOpen)}>
            <span className="text-[10px] tracking-[1.4px] text-[#6b7890] group-hover:text-[#aeb7c8] transition-colors">CONTENT & DLC</span>
            <span className="text-[11px] text-[#6b7890]">{activeDlcs.size + 1} active {dlcOpen ? "˅" : "›"}</span>
          </div>
          {dlcOpen && (
            <div className="flex flex-col gap-[9px] mt-[11px]">
              <div className="flex items-center gap-[9px]">
                <div className="w-[15px] h-[15px] rounded-[4px] shrink-0 border bg-primary border-primary/70 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-sm bg-white/80" />
                </div>
                <span className="text-[12px] text-[#aeb7c8]">Base Game</span>
              </div>
              {allDlcs.map((dlc) => {
                const checked = activeDlcs.has(dlc);
                return (
                  <div key={dlc} className="flex items-center gap-[9px] cursor-pointer group" onClick={() => onToggleDlc(dlc, !checked)}>
                    <div className={`w-[15px] h-[15px] rounded-[4px] shrink-0 border transition-colors flex items-center justify-center ${
                      checked ? "bg-primary border-primary/70" : "bg-transparent border-white/[0.18]"
                    }`}>
                      {checked && <div className="w-1.5 h-1.5 rounded-sm bg-white/80" />}
                    </div>
                    <span className="text-[12px] text-[#aeb7c8] group-hover:text-white transition-colors">{dlcLabel(dlc)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
