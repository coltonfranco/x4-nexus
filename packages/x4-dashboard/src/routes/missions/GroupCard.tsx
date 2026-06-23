import { FactionBadge } from "../../components/FactionBadge";
import type { FactionSummary } from "../../lib/map/types";
import type { Mission } from "./types";

export type GroupKind = "choice" | "all";

type Props = {
  kind: GroupKind;
  groupId: string;
  groupName: string | null;
  missions: Mission[];
  factionMap: Map<string, FactionSummary>;
  isSelected: boolean;
  onClick: () => void;
};

/** Derive group kind from the mission group. Heuristic:
 *  - If missions in the group have different factions, it's likely a choice fork.
 *  - Otherwise it's an all-required sequence.
 */
export function deriveGroupKind(missions: Mission[]): GroupKind {
  const factions = new Set(
    missions.map((m) => m.faction).filter(Boolean),
  );
  return factions.size > 1 ? "choice" : "all";
}

export function GroupCard({
  kind,
  groupId,
  groupName,
  missions,
  factionMap,
  isSelected,
  onClick,
}: Props) {
  // Use the first mission's faction for display
  const primaryMission = missions[0];
  const factionObj = primaryMission?.faction
    ? factionMap.get(primaryMission.faction)
    : undefined;

  const isChoice = kind === "choice";
  const edgeColor = isChoice ? "#d79be8" : "#3b9ae1";
  const tagBg = isChoice
    ? "rgba(200,121,224,0.14)"
    : "rgba(92,200,236,0.14)";
  const tagColor = isChoice ? "#d79be8" : "#7fb9d6";

  const tag = isChoice
    ? `CHOICE · ${missions.length} PATHS`
    : `ALL REQUIRED · ${missions.length} STAGES`;

  const isStory = missions.some((m) => m.is_story);

  const title = groupName ?? groupId.replace(/_/g, " ");
  const subtitle = isChoice
    ? "Pick one path"
    : "All stages required";

  return (
    <div
      onClick={onClick}
      className="relative mb-2 rounded-[11px] cursor-pointer overflow-hidden select-none transition-colors"
      style={{
        background: isSelected
          ? "rgba(92,200,236,0.08)"
          : "rgba(255,255,255,0.018)",
        border: `1px solid ${isSelected ? "rgba(92,200,236,0.4)" : "rgba(255,255,255,0.09)"}`,
      }}
    >
      {/* Left edge strip — always visible for groups */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: edgeColor }}
      />

      <div className="p-3 pl-4">
        {/* Top row */}
        <div className="flex items-start gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span
              className="w-2 h-2 rounded-[2px] shrink-0 mt-1"
              style={{ background: isChoice ? "#d79be8" : "#7fb9d6" }}
            />
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-foreground truncate">
                {title}
              </h3>
              <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span
              className="font-mono text-[13px] font-semibold"
              style={{ color: edgeColor }}
            >
              {isChoice ? "⑂" : "⛓"}
            </span>
          </div>
        </div>

        {/* Badge row */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-[5px]"
            style={{ background: tagBg, color: tagColor }}
          >
            {tag}
          </span>
          <span
            className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-[5px]"
            style={{
              background: "rgba(138,149,171,0.12)",
              color: "#8a95ab",
            }}
          >
            {isChoice ? "BRANCHING" : "SEQUENCE"}
          </span>
          {isStory && (
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-[5px]"
              style={{
                background: "rgba(200,121,224,0.14)",
                color: "#d79be8",
              }}
            >
              ✦ STORY
            </span>
          )}
          {factionObj && (
            <span className="text-[10px]">
              <FactionBadge
                name={factionObj.name}
                color_hex={factionObj.color_hex}
                icon_url={factionObj.icon_url}
                faction_id={factionObj.faction_id}
                size="sm"
              />
            </span>
          )}
          {!factionObj && primaryMission?.faction && (
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              ◈ {primaryMission.faction}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
