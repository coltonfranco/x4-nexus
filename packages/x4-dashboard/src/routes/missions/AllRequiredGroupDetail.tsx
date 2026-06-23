import { useState } from "react";
import { FactionBadge } from "../../components/FactionBadge";
import type { FactionSummary } from "../../lib/map/types";
import type { Mission } from "./types";
import { typeColor } from "./helpers";
import { EmbeddedMap } from "./EmbeddedMap";

export type SubStage = {
  mission: Mission;
  status: "done" | "current" | "next";
  typeLabel: string;
  destName: string;
};

type Props = {
  groupName: string | null;
  groupId: string;
  subStages: SubStage[];
  factionMap: Map<string, FactionSummary>;
};

export function AllRequiredGroupDetail({
  groupName,
  groupId,
  subStages,
  factionMap,
}: Props) {
  const [mapExpanded, setMapExpanded] = useState(false);
  if (mapExpanded) {
    return (
      <EmbeddedMap
        targetSectorId={null}
        fullscreen
        onBack={() => setMapExpanded(false)}
      />
    );
  }

  const title = groupName ?? groupId.replace(/_/g, " ");

  const firstFaction = subStages[0]?.mission.faction;
  const factionObj = firstFaction ? factionMap.get(firstFaction) : undefined;
  const opposingObj = subStages[0]?.mission.opposing_faction
    ? factionMap.get(subStages[0].mission.opposing_faction!)
    : undefined;

  const doneCount = subStages.filter((s) => s.status === "done").length;
  const progressPct =
    subStages.length > 0 ? Math.round((doneCount / subStages.length) * 100) : 0;

  // Summary text: combine all descriptions
  const summary =
    subStages
      .map((s) => s.mission.description)
      .filter(Boolean)
      .join(" ") || "Complete all stages to advance the campaign.";

  const STATUS_STYLES = {
    done: {
      icon: "✓",
      dotBorder: "#34d399",
      dotBg: "rgba(52,211,153,0.16)",
      dotFg: "#34d399",
      titleColor: "#7a8499",
      rowBg: "rgba(255,255,255,0.015)",
      rowBorder: "rgba(255,255,255,0.05)",
      statusText: "Completed",
    },
    current: {
      icon: "●",
      dotBorder: "#5cc8ec",
      dotBg: "rgba(92,200,236,0.16)",
      dotFg: "#5cc8ec",
      titleColor: "#eef2f8",
      rowBg: "rgba(92,200,236,0.05)",
      rowBorder: "rgba(92,200,236,0.18)",
      statusText: "In progress",
    },
    next: {
      icon: "",
      dotBorder: "rgba(255,255,255,0.18)",
      dotBg: "transparent",
      dotFg: "#5a6680",
      titleColor: "#cdd5e3",
      rowBg: "rgba(255,255,255,0.015)",
      rowBorder: "rgba(255,255,255,0.05)",
      statusText: "Locked",
    },
  } as const;

  return (
    <div className="p-6 max-w-[760px] animate-in fade-in slide-in-from-right-2 duration-150">
      {/* Header */}
      <div
        className="text-[10px] tracking-[2px] font-mono uppercase mb-2"
        style={{ color: "#7fb9d6" }}
      >
        {title} · MULTI-STAGE
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
        {opposingObj && (
          <>
            <span className="text-[11px] text-muted-foreground">vs</span>
            <span
              className="font-semibold"
              style={{ color: opposingObj.color_hex ?? "#f87171" }}
            >
              {opposingObj.name}
            </span>
          </>
        )}
      </div>

      {/* Summary + progress */}
      <div
        className="flex items-center gap-3.5 mt-4 p-3.5 rounded-xl border"
        style={{
          background: "rgba(255,255,255,0.02)",
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex-1">
          <div
            className="text-[12.5px] leading-relaxed"
            style={{ color: "#aab4c6" }}
          >
            {summary}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="font-mono text-xl font-semibold"
            style={{ color: "#5cc8ec" }}
          >
            {doneCount} / {subStages.length}
          </div>
          <div
            className="text-[10px] tracking-[1px] font-mono uppercase"
            style={{ color: "#5a6680" }}
          >
            COMPLETE
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div
        className="h-[6px] rounded-full mt-2.5 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progressPct}%`,
            background: "linear-gradient(90deg, #3b9ae1, #34d399)",
          }}
        />
      </div>

      {/* All required to advance */}
      <div className="flex items-center gap-2.5 mt-6 mb-3">
        <span
          className="text-[11px] tracking-[1.5px] font-mono uppercase"
          style={{ color: "#7a8499" }}
        >
          ▸ ALL REQUIRED TO ADVANCE
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      <div className="flex flex-col gap-2">
        {subStages.map((s, i) => {
          const style = STATUS_STYLES[s.status];
          const mtypeColor = s.mission.type
            ? typeColor(s.mission.type)
            : undefined;

          return (
            <div
              key={s.mission.mission_id ?? i}
              className="flex items-center gap-3 p-3 rounded-[11px]"
              style={{
                background: style.rowBg,
                border: `1px solid ${style.rowBorder}`,
              }}
            >
              {/* Status dot */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] font-semibold shrink-0"
                style={{
                  border: `1.5px solid ${style.dotBorder}`,
                  background: style.dotBg,
                  color: style.dotFg,
                }}
              >
                {style.icon || `${i + 1}`}
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className="text-[13.5px] font-semibold"
                  style={{ color: style.titleColor }}
                >
                  {s.mission.name}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-md"
                    style={{
                      background: mtypeColor
                        ? `${mtypeColor}18`
                        : "rgba(138,149,171,0.12)",
                      color: mtypeColor ?? "#8a95ab",
                    }}
                  >
                    {s.typeLabel}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {style.statusText}
                  </span>
                </div>
              </div>

              <div
                className="shrink-0 font-mono text-[11px]"
                style={{ color: "#7fb9d6" }}
              >
                ⌖ {s.destName}
              </div>
            </div>
          );
        })}
      </div>

      {/* Combined route */}
      <div className="flex items-center gap-2.5 mt-6 mb-3">
        <span
          className="text-[11px] tracking-[1.5px] font-mono uppercase"
          style={{ color: "#7a8499" }}
        >
          ▸ COMBINED ROUTE
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          Tour of {subStages.length} sector{subStages.length !== 1 ? "s" : ""}
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
        targetSectorId={null}
        onExpand={() => setMapExpanded(true)}
        height={220}
      />
    </div>
  );
}
