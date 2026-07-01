import { MapPin, User } from "lucide-react";
import { FactionBadge } from "../../components/FactionBadge";
import { MissionListCard } from "./CardShell";
import type { FactionSummary } from "../../lib/map/types";
import type { MissionOffer } from "./types";
import {
  typeColor,
  typeLabel,
  fmtCredits,
  LevelBadge,
  RepeatableTag,
} from "./helpers";

type Props = {
  o: MissionOffer;
  factionMap: Map<string, FactionSummary>;
  isSelected: boolean;
  isInRun: boolean;
  onClick: () => void;
  onToggleRun?: () => void;
};

export function OfferCard({ o, factionMap, isSelected, isInRun, onClick, onToggleRun }: Props) {
  const factionObj = o.faction ? factionMap.get(o.faction) : undefined;
  const opposingObj = o.opposing_faction ? factionMap.get(o.opposing_faction) : undefined;
  const mtypeColor = o.type ? typeColor(o.type) : undefined;
  const mtLabel = o.type ? typeLabel(o.type) : null;

  const hasReward = o.reward_credits != null || o.rewardtext != null;
  const rewardDisplay = o.reward_credits != null
    ? fmtCredits(o.reward_credits)
    : o.rewardtext ?? null;

  return (
    <MissionListCard
      onClick={onClick}
      isSelected={isSelected}
      opacityClassName="opacity-80 hover:opacity-100"
      dotColor={mtypeColor ?? "#8a95ab"}
      title={o.name}
      subtitle={
        o.actor_name && (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {o.actor_name}
          </span>
        )
      }
      trailing={
        <>
          {hasReward && (
            <div className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: "var(--gold)" }}>
              {rewardDisplay}
            </div>
          )}
          {o.distance != null && (
            <div className="font-mono text-[10px] text-muted-foreground mt-1">
              ⤳ {o.distance} jump{o.distance !== 1 ? "s" : ""}
            </div>
          )}
        </>
      }
      badges={
        <>
          {mtLabel && mtypeColor && (
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.3px] px-2 py-0.5 rounded-[5px]"
              style={{ background: `${mtypeColor}18`, color: mtypeColor }}
            >
              {mtLabel}
            </span>
          )}
          <LevelBadge level={o.level} />
          {o.is_repeatable && <RepeatableTag />}
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
          {!factionObj && o.faction && (
            <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
              ◈ {o.faction}
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
          {o.station_name && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <MapPin className="w-2.5 h-2.5" />
              {o.station_name}
            </span>
          )}
        </>
      }
      trailingButton={
        onToggleRun && (
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
        )
      }
    />
  );
}
