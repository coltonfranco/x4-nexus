// Sector-overlay controls: Faction (default) / Resources / Trade tabs. Resources shows
// the dominant resource per sector until one is picked (then a heatmap); Trade shows
// route markers until a ware is picked (then supply/demand).

import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import { RESOURCE_COLORS, RESOURCE_ORDER } from "../../lib/map/constants";
import type { FillMode } from "../../lib/map/overlays/types";
import type { EconomyWare } from "../../lib/map/overlays/types";
import type { ResourceSource } from "../../lib/map/overlays/useAnalysisData";
import type { ConflictToggles } from "../../lib/map/overlays/useAnalysisOverlay";

const TABS: { id: FillMode; label: string; icon: React.ReactNode }[] = [
  {
    id: "faction",
    label: "Faction",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="M5 21V4h10l-2 3 2 3H5"></path>
      </svg>
    ),
  },
  {
    id: "relations",
    label: "Relations",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <circle cx="9" cy="12" r="5"></circle>
        <circle cx="15" cy="12" r="5"></circle>
      </svg>
    ),
  },
  {
    id: "resources",
    label: "Resources",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="M12 3 21 9 12 21 3 9z"></path>
      </svg>
    ),
  },
  {
    id: "trade",
    label: "Trade",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17V7m0 0L4 10m3-3 3 3M17 7v10m0 0 3-3m-3 3-3-3"></path>
      </svg>
    ),
  },
  {
    id: "conflict",
    label: "Conflict",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"></path>
      </svg>
    ),
  },
];

export function AnalysisPanel({
  fillMode,
  onFillModeChange,
  resource,
  onResourceChange,
  onClearResource,
  resourceSource,
  wareId,
  wareName,
  onWareChange,
  onClearWare,
  economyWares,
  waresLoading,
  maxJumps,
  onMaxJumpsChange,
  overlayLoading,
  conflictToggles,
  onToggleConflict,
}: {
  fillMode: FillMode;
  onFillModeChange: (m: FillMode) => void;
  resource: string | null;
  onResourceChange: (r: string) => void;
  onClearResource: () => void;
  resourceSource: ResourceSource | null;
  wareId: string | null;
  wareName: string | null;
  onWareChange: (w: string) => void;
  onClearWare: () => void;
  economyWares: EconomyWare[];
  waresLoading: boolean;
  maxJumps: number | null;
  onMaxJumpsChange: (j: number | null) => void;
  overlayLoading?: boolean;
  conflictToggles?: ConflictToggles;
  onToggleConflict?: (key: keyof ConflictToggles, value: boolean) => void;
}) {
  const [wareFilter, setWareFilter] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const filtered = economyWares
    .filter((w) =>
      (w.ware_name ?? w.ware_id)
        .toLowerCase()
        .includes(wareFilter.toLowerCase()),
    )
    .slice(0, 40);

  return (
    <div className="flex flex-col gap-[10px]">
      {/* Mode Buttons — inline, no scroll, all tabs always visible */}
      <div className="flex gap-[3px] p-[5px] bg-[#0a0f1a]/82 backdrop-blur-[12px] border border-white/10 rounded-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.4)] pointer-events-auto">
        {TABS.map((t) => {
          const active = fillMode === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onFillModeChange(t.id)}
              className={`flex items-center gap-[6px] px-[10px] py-[7px] rounded-[8px] font-['Space_Grotesk',sans-serif] text-[12px] whitespace-nowrap tracking-[0.2px] transition-colors ${
                active
                  ? "font-semibold border border-primary/55 bg-primary/15 text-white"
                  : "font-medium border border-transparent bg-transparent text-[#8a97ad] hover:text-[#c4ccda] hover:bg-white/5"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Resources Context */}
      {fillMode === "resources" && (
        <div className="bg-[#0a0f1a]/82 backdrop-blur-[12px] border border-white/10 rounded-[12px] pointer-events-auto">
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="w-full flex items-center justify-between p-[11px_12px] rounded-[12px]"
          >
            <span className="text-[10px] tracking-[1.4px] text-[#6b7890]">
              HEAT-MAP YIELD
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {resourceSource && (
                <span
                  className={`text-[9px] px-1 rounded ${
                    resourceSource === "live"
                      ? "text-emerald-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {resourceSource === "live" ? "LIVE" : "STATIC"}
                </span>
              )}
              {resource && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearResource();
                  }}
                  className="text-[10px] tracking-[1px] uppercase text-[#6b7890] hover:text-white transition-colors"
                >
                  Clear
                </button>
              )}
              <ChevronDown
                className={`w-3 h-3 text-[#6b7890] transition-transform ${panelOpen ? "rotate-0" : "-rotate-90"}`}
                strokeWidth={2.5}
              />
            </span>
          </button>
          {panelOpen && (
            <div className="px-[12px] pb-[11px]">
              <div className="grid grid-cols-5 gap-[6px]">
                {RESOURCE_ORDER.map((r) => {
                  const active = resource === r;
                  return (
                    <button
                      key={r}
                      onClick={() =>
                        active ? onClearResource() : onResourceChange(r)
                      }
                      className={`flex items-center gap-[6px] px-[10px] py-[5px] rounded-full font-['Space_Grotesk',sans-serif] text-[11.5px] cursor-pointer transition-colors ${
                        active
                          ? "font-semibold border border-primary/50 bg-primary/15 text-white"
                          : "font-medium border border-white/10 bg-white/5 text-[#9aa6ba] hover:text-[#c4ccda]"
                      }`}
                    >
                      {r !== "sunlight" ? (
                        <div
                          className="w-3.5 h-3.5 shrink-0"
                          style={{
                            backgroundColor: RESOURCE_COLORS[r] ?? "#888",
                            WebkitMaskImage: `url(/static/icons/wares/ware_${r === "rawscrap" ? "scrapmetal" : r}.png)`,
                            WebkitMaskSize: "contain",
                            WebkitMaskRepeat: "no-repeat",
                            WebkitMaskPosition: "center",
                          }}
                        />
                      ) : (
                        <span
                          className="w-2 h-2 rounded-full shrink-0 mx-[3px]"
                          style={{ background: RESOURCE_COLORS[r] ?? "#888" }}
                        />
                      )}
                      <span className="capitalize">{r}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conflict Context */}
      {fillMode === "conflict" && conflictToggles && onToggleConflict && (
        <div className="bg-[#0a0f1a]/82 backdrop-blur-[12px] border border-white/10 rounded-[12px] min-w-[212px] pointer-events-auto">
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="w-full flex items-center justify-between p-[11px_12px] rounded-[12px]"
          >
            <span className="text-[10px] tracking-[1.4px] text-[#6b7890]">
              SHOW ON MAP
            </span>
            <ChevronDown
              className={`w-3 h-3 text-[#6b7890] transition-transform ${panelOpen ? "rotate-0" : "-rotate-90"}`}
              strokeWidth={2.5}
            />
          </button>
          {panelOpen && (
            <div className="px-[12px] pb-[11px]">
              <div className="flex flex-col gap-[9px]">
                {[
                  { key: "showDanger", label: "Danger Zones" },
                  { key: "showTensions", label: "Border Tensions" },
                  { key: "showConflicts", label: "Sector Battles" },
                  { key: "showPlayer", label: "Player Ships" },
                ].map(({ key, label }) => {
                  const checked = conflictToggles[key as keyof ConflictToggles];
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-[9px] cursor-pointer group"
                      onClick={() =>
                        onToggleConflict(key as keyof ConflictToggles, !checked)
                      }
                    >
                      <div
                        className={`w-[15px] h-[15px] rounded-[4px] shrink-0 border transition-colors flex items-center justify-center ${
                          checked
                            ? "bg-primary border-primary/70"
                            : "bg-transparent border-white/[0.18]"
                        }`}
                      >
                        {checked && (
                          <div className="w-1.5 h-1.5 rounded-sm bg-white/80" />
                        )}
                      </div>
                      <span className="text-[12.5px] text-[#c4ccda] group-hover:text-white transition-colors">
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trade Context */}
      {fillMode === "trade" && (
        <div className="bg-[#0a0f1a]/82 backdrop-blur-[12px] border border-white/10 rounded-[12px] min-w-[260px] pointer-events-auto">
          {wareId ? (
            <>
              <button
                onClick={() => setPanelOpen(!panelOpen)}
                className="w-full flex items-center justify-between p-[11px_12px] rounded-[12px]"
              >
                <p className="text-[11.5px] text-[#c4ccda] truncate text-left">
                  Supply/demand for{" "}
                  <span className="text-white font-semibold">
                    {wareName ?? wareId}
                  </span>
                </p>
                <span className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearWare();
                    }}
                    className="text-[10px] tracking-[1px] uppercase text-[#6b7890] hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                  <ChevronDown
                    className={`w-3 h-3 text-[#6b7890] transition-transform ${panelOpen ? "rotate-0" : "-rotate-90"}`}
                    strokeWidth={2.5}
                  />
                </span>
              </button>
              {panelOpen && (
                <div className="px-[12px] pb-[11px] flex flex-col gap-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6b7890]" />
                    <input
                      value={wareFilter}
                      onChange={(e) => setWareFilter(e.target.value)}
                      placeholder={
                        waresLoading ? "Loading wares…" : "Search a ware…"
                      }
                      className="w-full text-[12px] pl-[24px] pr-2 py-[5px] rounded-[6px] bg-white/5 border border-white/10 focus:outline-none focus:border-primary/50 text-[#e7edf6] placeholder:text-[#6b7890]"
                    />
                  </div>

                  {wareFilter && (
                    <div className="flex flex-col gap-[2px] max-h-[160px] overflow-y-auto mt-1 no-scrollbar pr-1">
                      {filtered.map((w) => (
                        <button
                          key={w.ware_id}
                          onClick={() => onWareChange(w.ware_id)}
                          className={`text-left text-[12px] px-2 py-1.5 rounded transition-colors ${
                            wareId === w.ware_id
                              ? "bg-primary/20 text-white"
                              : "text-[#9aa6ba] hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {w.ware_name ?? w.ware_id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setPanelOpen(!panelOpen)}
                className="w-full flex items-center justify-between p-[11px_12px] rounded-[12px]"
              >
                <span className="text-[10px] tracking-[1.4px] text-[#6b7890]">
                  TRADE ROUTES
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-[#6b7890] transition-transform ${panelOpen ? "rotate-0" : "-rotate-90"}`}
                  strokeWidth={2.5}
                />
              </button>
              {panelOpen && (
                <div className="px-[12px] pb-[11px] flex flex-col gap-3">
                  <div className="flex items-center gap-[6px] flex-wrap">
                    <span className="text-[11px] text-[#6b7890]">
                      Max jumps:
                    </span>
                    {(
                      [
                        ["∞", null],
                        ["1", 1],
                        ["2", 2],
                        ["3", 3],
                        ["4", 4],
                        ["5", 5],
                      ] as [string, number | null][]
                    ).map(([label, val]) => (
                      <button
                        key={label}
                        onClick={() => onMaxJumpsChange(val)}
                        className={`text-[11px] px-[6px] py-[2px] rounded transition-colors ${
                          maxJumps === val
                            ? "bg-primary/20 text-white border border-primary/40"
                            : "bg-white/5 text-[#9aa6ba] border border-transparent hover:text-white hover:bg-white/10"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#6b7890]" />
                    <input
                      value={wareFilter}
                      onChange={(e) => setWareFilter(e.target.value)}
                      placeholder={
                        waresLoading ? "Loading wares…" : "Search a ware…"
                      }
                      className="w-full text-[12px] pl-[24px] pr-2 py-[5px] rounded-[6px] bg-white/5 border border-white/10 focus:outline-none focus:border-primary/50 text-[#e7edf6] placeholder:text-[#6b7890]"
                    />
                  </div>

                  {wareFilter && (
                    <div className="flex flex-col gap-[2px] max-h-[160px] overflow-y-auto mt-1 no-scrollbar pr-1">
                      {filtered.map((w) => (
                        <button
                          key={w.ware_id}
                          onClick={() => onWareChange(w.ware_id)}
                          className={`text-left text-[12px] px-2 py-1.5 rounded transition-colors ${
                            wareId === w.ware_id
                              ? "bg-primary/20 text-white"
                              : "text-[#9aa6ba] hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          {w.ware_name ?? w.ware_id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {overlayLoading && (
        <div className="text-[11px] text-[#6b7890] px-1">Loading overlay…</div>
      )}
    </div>
  );
}
