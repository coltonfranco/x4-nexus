import { MapPin } from "lucide-react";
import { FactionBadge } from "../../components/FactionBadge";

import type { FactionSummary } from "../../lib/map/types";
import type { Mission } from "./types";
import {
  typeColor,
  typeLabel,
  fmtTime,
  fmtCredits,
  LevelBadge,
  StoryTag,
} from "./helpers";

type Props = {
  m: Mission;
  factionMap: Map<string, FactionSummary>;
  nowSec: number | null;
  isSelected: boolean;
  isInRun: boolean;
  onClick: () => void;
  onToggleRun?: () => void;
};

export function MissionCard({ m, factionMap, nowSec, isSelected, isInRun, onClick, onToggleRun }: Props) {
  const factionObj = m.faction ? factionMap.get(m.faction) : undefined;
  const opposingObj = m.opposing_faction ? factionMap.get(m.opposing_faction) : undefined;
  const mtypeColor = m.type ? typeColor(m.type) : undefined;
  const mtLabel = m.type ? typeLabel(m.type) : null;
  const relativeTime = fmtTime(m.time, nowSec);

  // Reward display
  const hasReward = m.reward_credits != null || m.rewardtext != null;
  const rewardDisplay = m.reward_credits != null
    ? fmtCredits(m.reward_credits)
    : m.rewardtext ?? null;

  return (
    <div
      onClick={onClick}
      className="relative mb-2 rounded-[11px] cursor-pointer overflow-hidden select-none transition-colors"
      style={{
        background: isSelected
          ? "rgba(92,200,236,0.08)"
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${isSelected ? "rgba(92,200,236,0.4)" : "rgba(255,255,255,0.07)"}`,
      }}
    >
      {/* Left edge strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: isSelected ? "#5cc8ec" : "transparent" }}
      />

      <div className="p-3 pl-4">
        {/* Top row: type dot + title + reward */}
        <div className="flex items-start gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Type color dot */}
            <span
              className="w-2 h-2 rounded-[2px] shrink-0 mt-1"
              style={{ background: mtypeColor ?? "#8a95ab" }}
            />
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-foreground truncate">
                {m.name}
              </h3>
              <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                {m.caption
                  ? <><UserLabel /> {m.caption}</>
                  : m.group_name
                    ? `${m.group_name} · Mission`
                    : relativeTime
                      ? relativeTime
                      : null}
              </p>
            </div>
          </div>

          {/* Reward + time */}
          <div className="text-right shrink-0">
            {hasReward && (
              <div
                className="font-mono text-[13px] font-semibold tabular-nums"
                style={{ color: "var(--gold)" }}
              >
                {rewardDisplay}
              </div>
            )}
            {relativeTime && (
              <div className="font-mono text-[10px] text-muted-foreground mt-1">
                {relativeTime}
              </div>
            )}
          </div>
        </div>

        {/* Badge row */}
        <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
          {mtLabel && mtypeColor && (
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-[5px]"
              style={{ background: `${mtypeColor}18`, color: mtypeColor }}
            >
              {mtLabel}
            </span>
          )}
          <LevelBadge level={m.level} />
          {m.is_story && <StoryTag />}
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
          {!factionObj && m.faction && (
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              ◈ {m.faction}
            </span>
          )}
          {opposingObj && (
            <>
              <span className="text-[10px] text-muted-foreground">vs</span>
              <FactionBadge
                name={opposingObj.name}
                color_hex={opposingObj.color_hex}
                icon_url={opposingObj.icon_url}
                faction_id={opposingObj.faction_id}
                size="sm"
              />
            </>
          )}
          {m.group_name && (
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-[5px]"
              style={{
                background: "rgba(250,204,21,0.12)",
                color: "var(--gold)",
              }}
            >
              {m.group_name}
            </span>
          )}
          {m.associated_entity_name && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />
              {m.associated_entity_name}
            </span>
          )}
        </div>

        {/* Add to Run button */}
        {onToggleRun && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleRun(); }}
            className="absolute right-2.5 bottom-2.5 w-6 h-6 rounded-md flex items-center justify-center text-[13px] transition-colors hover:brightness-125"
            style={{
              background: isInRun
                ? "rgba(52,211,153,0.14)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${isInRun ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.1)"}`,
              color: isInRun ? "#34d399" : "#7a8499",
            }}
            title={isInRun ? "In Run" : "Add to Run"}
          >
            {isInRun ? "✓" : "＋"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Inline user icon for the subtitle line. */
function UserLabel() {
  return (
    <svg
      className="inline-block w-3 h-3 text-muted-foreground mr-0.5 align-[-1px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
