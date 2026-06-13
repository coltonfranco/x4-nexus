// Sector-overlay controls: Faction (default) / Resources / Trade tabs. Resources shows
// the dominant resource per sector until one is picked (then a heatmap); Trade shows
// route markers until a ware is picked (then supply/demand).

import { useState } from "react";

import { RESOURCE_COLORS, RESOURCE_ORDER, STATUS_COLORS } from "../../lib/map/constants";
import type { FillMode } from "../../lib/map/overlays/types";
import { type EconomyWare, type ResourceSource } from "../../lib/map/overlays/useAnalysisData";
import type { ConflictToggles } from "../../lib/map/overlays/useAnalysisOverlay";

const TABS: { id: FillMode; label: string }[] = [
  { id: "faction", label: "Faction" },
  { id: "relations", label: "Relations" },
  { id: "resources", label: "Resources" },
  { id: "trade", label: "Trade" },
  { id: "conflict", label: "Conflict" },
];

export function AnalysisPanel({
  fillMode, onFillModeChange,
  resource, onResourceChange, onClearResource, resourceSource,
  wareId, wareName, onWareChange, onClearWare, economyWares, waresLoading,
  routesLoading, markerCount, maxJumps, onMaxJumpsChange,
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
  routesLoading: boolean;
  markerCount: number;
  maxJumps: number | null;
  onMaxJumpsChange: (j: number | null) => void;
  overlayLoading?: boolean;
  conflictToggles?: ConflictToggles;
  onToggleConflict?: (key: keyof ConflictToggles, value: boolean) => void;
}) {
  const [wareFilter, setWareFilter] = useState("");
  const filtered = economyWares
    .filter((w) => (w.ware_name ?? w.ware_id).toLowerCase().includes(wareFilter.toLowerCase()))
    .slice(0, 40);

  return (
    <div className="p-4 border-b border-border flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sector overlay</p>
      <div className="grid grid-cols-3 gap-1.5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => onFillModeChange(t.id)}
            className={`text-xs px-2 py-1.5 rounded border transition-colors ${
              fillMode === t.id
                ? "bg-primary/20 border-primary/60 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {fillMode === "faction" && (
        <p className="text-[11px] text-muted-foreground">Sectors colored by owning faction.</p>
      )}

      {fillMode === "conflict" && conflictToggles && onToggleConflict && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground/80 mb-1">
            Toggle which conflict elements to show on the map.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "showDanger", label: "Danger Zones" },
              { key: "showTensions", label: "Border Tensions" },
              { key: "showConflicts", label: "Sector Battles" },
              { key: "showPlayer", label: "Player Ships" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={conflictToggles[key as keyof ConflictToggles]}
                  onChange={(e) => onToggleConflict(key as keyof ConflictToggles, e.target.checked)}
                  className="rounded border-border bg-muted/30 text-primary focus:ring-primary/60"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {fillMode === "relations" && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground">
            Sectors colored by player relation to owner.
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
            <span>enemy (-30)</span>
            <span className="h-2 flex-1 rounded-full" style={{
              background: `linear-gradient(to right, ${STATUS_COLORS.danger}, ${STATUS_COLORS.neutral}, ${STATUS_COLORS.success})`,
            }} />
            <span>friend (+30)</span>
          </div>
          <p className="text-[11px] text-muted-foreground/60">Neutral (+0) is grey. Hover/click for details.</p>
        </div>
      )}

      {fillMode === "resources" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              {resource ? "Heat-mapping yields. Badges show the level." : "Dominant resource fill · dots = others present."}
            </p>
            {resourceSource && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                resourceSource === "live" ? "bg-emerald-900/40 text-emerald-300" : "bg-muted/40 text-muted-foreground"
              }`}>
                {resourceSource === "live" ? "live" : "static"}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {RESOURCE_ORDER.map((r) => (
              <button key={r} onClick={() => onResourceChange(r)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border capitalize transition-colors ${
                  resource === r ? "border-primary/60 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground"
                }`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RESOURCE_COLORS[r] ?? "#888" }} />
                {r}
              </button>
            ))}
          </div>
          {resource ? (
            <>
              <HeatLegend />
              <button onClick={onClearResource} className="self-start text-xs text-muted-foreground hover:text-foreground underline">
                ← Back to overview
              </button>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground/60">Click a resource for its low→high heatmap.</p>
          )}
        </div>
      )}

      {fillMode === "trade" && (
        <div className="flex flex-col gap-2">
          {wareId ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground truncate">Supply/demand for <span className="text-foreground">{wareName ?? wareId}</span></p>
                <button onClick={onClearWare} className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline">
                  routes
                </button>
              </div>
              <Legend items={[[STATUS_COLORS.success, "surplus (supply > demand)"], [STATUS_COLORS.danger, "deficit (demand > supply)"]]} />
              <p className="text-[11px] text-muted-foreground/60">Brighter = larger net volume.</p>
            </>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">
                {routesLoading ? "Loading routes…" : markerCount > 0
                  ? `${markerCount} sectors · brighter = more profit/h. Hover for details, click to map a route.`
                  : "No mappable routes — activate a save first."}
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-muted-foreground mr-0.5">max jumps</span>
                {([["∞", null], ["1", 1], ["2", 2], ["3", 3], ["4", 4], ["5", 5]] as [string, number | null][]).map(([label, val]) => (
                  <button key={label} onClick={() => onMaxJumpsChange(val)}
                    className={`text-[11px] px-1.5 py-0.5 rounded tabular-nums transition-colors ${
                      maxJumps === val ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <input value={wareFilter} onChange={(e) => setWareFilter(e.target.value)}
            placeholder={waresLoading ? "Loading wares…" : "Search a ware for supply/demand…"}
            className="w-full text-xs px-2 py-1.5 rounded bg-muted/30 border border-border focus:outline-none focus:border-primary/60" />
          {wareFilter && (
            <div className="flex flex-col gap-0.5 max-h-44 overflow-y-auto">
              {filtered.map((w) => (
                <button key={w.ware_id} onClick={() => onWareChange(w.ware_id)}
                  className={`text-left text-xs px-2 py-1 rounded transition-colors ${
                    wareId === w.ware_id ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}>
                  {w.ware_name ?? w.ware_id}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {overlayLoading && <p className="text-[11px] text-muted-foreground/60">Loading overlay…</p>}
    </div>
  );
}

function HeatLegend() {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span>low</span>
      <span className="h-2 flex-1 rounded-full" style={{
        background: `linear-gradient(to right, ${STATUS_COLORS.danger}, ${STATUS_COLORS.warning}, ${STATUS_COLORS.success})`,
      }} />
      <span>high</span>
    </div>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map(([color, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
