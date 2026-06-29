import { useState } from "react";
import { FactionBadge } from "../../components/FactionBadge";
import type { FactionSummary } from "../../lib/map/types";
import type { Mission } from "./types";
import { typeColor, typeLabel, LevelBadge, StoryTag } from "./helpers";
import { EmbeddedMap } from "./EmbeddedMap";

export type PathOption = {
  mission: Mission;
  consequence: string;
};

type Props = {
  groupName: string | null;
  groupId: string;
  paths: PathOption[];
  factionMap: Map<string, FactionSummary>;
};

export function ChoiceGroupDetail({
  groupName,
  groupId,
  paths,
  factionMap,
}: Props) {
  const [mapExpanded, setMapExpanded] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = paths[selectedIdx];
  const title = groupName ?? groupId.replace(/_/g, " ");

  // Use first path's faction for header badge
  const firstFaction = paths[0]?.mission.faction;
  const factionObj = firstFaction ? factionMap.get(firstFaction) : undefined;

  // Resolve target sector for map
  const mapTargetSector =
    selected?.mission.associated_entity_sector_id ?? null;

  if (mapExpanded) {
    return (
      <EmbeddedMap
        targetSectorId={mapTargetSector}
        fullscreen
        onBack={() => setMapExpanded(false)}
      />
    );
  }

  return (
    <div className="p-6 max-w-[760px] animate-in fade-in slide-in-from-right-2 duration-150">
      {/* Header */}
      <div
        className="text-[10px] tracking-[2px] font-mono uppercase mb-2"
        style={{ color: "#d79be8" }}
      >
        {title} · BRANCHING
      </div>
      <h2 className="text-[26px] font-semibold leading-tight">{title}</h2>

      <div className="flex items-center gap-2 mt-2.5">
        {factionObj && (
          <FactionBadge
            name={factionObj.name}
            color_hex={factionObj.color_hex}
            icon_url={factionObj.icon_url}
            faction_id={factionObj.faction_id}
            size="md"
          />
        )}
        <StoryTag />
      </div>

      {/* Warning summary */}
      <div
        className="flex items-start gap-3 mt-4 p-3.5 rounded-xl border"
        style={{
          background: "rgba(200,121,224,0.07)",
          borderColor: "rgba(200,121,224,0.2)",
        }}
      >
        <span className="text-base shrink-0" style={{ color: "#d79be8" }}>
          ⚠
        </span>
        <div
          className="text-[12.5px] leading-relaxed"
          style={{ color: "#cdb6d6" }}
        >
          You must choose one path. Your choice is permanent and will reshape the
          faction&apos;s fate.
        </div>
      </div>

      {/* Choose one path */}
      <div className="flex items-center gap-2.5 mt-6 mb-3">
        <span
          className="text-[11px] tracking-[1.5px] font-mono uppercase"
          style={{ color: "#7a8499" }}
        >
          ▸ CHOOSE ONE PATH
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      <div className="flex flex-col gap-2.5">
        {paths.map((p, i) => {
          const isSelected = i === selectedIdx;
          const mtypeColor = p.mission.type ? typeColor(p.mission.type) : undefined;
          const mtLabel = p.mission.type ? typeLabel(p.mission.type) : null;
          const edgeColor = mtypeColor ?? "#c879e0";

          return (
            <div
              key={p.mission.mission_id ?? i}
              onClick={() => setSelectedIdx(i)}
              className="relative p-3.5 rounded-xl cursor-pointer overflow-hidden transition-colors"
              style={{
                background: isSelected
                  ? "rgba(200,121,224,0.07)"
                  : "rgba(255,255,255,0.02)",
                border: `1px solid ${
                  isSelected
                    ? "rgba(200,121,224,0.4)"
                    : "rgba(255,255,255,0.07)"
                }`,
              }}
            >
              {/* Edge strip */}
              <div
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                style={{ background: isSelected ? "#d79be8" : "transparent" }}
              />

              {/* Row: radio + title + badges */}
              <div className="flex items-center gap-3">
                {/* Radio */}
                <div
                  className="w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0"
                  style={{
                    border: `1.5px solid ${
                      isSelected ? "#d79be8" : "rgba(255,255,255,0.2)"
                    }`,
                    background: isSelected
                      ? "rgba(200,121,224,0.16)"
                      : "transparent",
                  }}
                >
                  {isSelected && (
                    <div
                      className="w-[9px] h-[9px] rounded-full"
                      style={{ background: "#d79be8" }}
                    />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-foreground">
                    {p.mission.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    ⌖ {p.mission.caption ?? "Unknown giver"}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {mtLabel && mtypeColor && (
                    <span
                      className="text-[9px] font-semibold uppercase tracking-[0.4px] px-2 py-0.5 rounded-md"
                      style={{
                        background: `${mtypeColor}18`,
                        color: mtypeColor,
                      }}
                    >
                      {mtLabel}
                    </span>
                  )}
                  <LevelBadge level={p.mission.level} />
                </div>
              </div>

              {/* Expanded: summary + consequence */}
              {isSelected && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <div
                    className="text-[12px] leading-relaxed"
                    style={{ color: "#aab4c6" }}
                  >
                    {p.mission.description ?? "No description available."}
                  </div>
                  <div
                    className="flex items-start gap-2.5 mt-2.5 p-2.5 rounded-lg"
                    style={{
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <span style={{ color: edgeColor, fontSize: "13px" }}>⮑</span>
                    <div
                      className="text-[11.5px] leading-relaxed"
                      style={{ color: "#9aa4ba" }}
                    >
                      <span
                        className="text-[9.5px] tracking-[1px] font-mono uppercase"
                        style={{ color: "#7a8499" }}
                      >
                        CONSEQUENCE&nbsp;&nbsp;
                      </span>
                      {p.consequence}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Route map */}
      <div className="flex items-center gap-2.5 mt-6 mb-3">
        <span
          className="text-[11px] tracking-[1.5px] font-mono uppercase"
          style={{ color: "#7a8499" }}
        >
          ▸ ROUTE
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          {selected?.mission.name ?? "No path selected"}
        </span>
        <div className="flex-1 h-px bg-border/40" />
        <button
          onClick={() => setMapExpanded(true)}
          className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors hover:brightness-125"
          style={{
            color: "#7fb9d6",
            borderColor: "rgba(92,200,236,0.22)",
            background: "rgba(92,200,236,0.06)",
          }}
        >
          ⤢ Expand
        </button>
      </div>

      <EmbeddedMap
        targetSectorId={mapTargetSector}
        onExpand={() => setMapExpanded(true)}
        height={220}
      />
    </div>
  );
}
