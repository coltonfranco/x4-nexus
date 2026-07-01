import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Shared shell for the mission-board list cards (MissionCard, OfferCard, GroupCard):
 * rounded container, left accent strip, top row (dot + title/subtitle + trailing
 * content), and a wrapped badge row. Each card supplies its own field mapping and
 * composes this for the structural/visual parts that were previously copy-pasted
 * three times.
 */
export function MissionListCard({
  onClick,
  isSelected,
  dotColor,
  title,
  subtitle,
  trailing,
  badges,
  edgeColor,
  alwaysShowEdge = false,
  opacityClassName,
  bg = "rgba(255,255,255,0.02)",
  unselectedBorder = "rgba(255,255,255,0.07)",
  trailingButton,
}: {
  onClick: () => void;
  isSelected: boolean;
  /** Small square dot color next to the title. */
  dotColor: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned content in the top row (reward, time, distance, glyph, …). */
  trailing?: ReactNode;
  /** Wrapped badge row below the top row. */
  badges?: ReactNode;
  /** Left-strip color. Defaults to the selection highlight (cyan) when omitted. */
  edgeColor?: string;
  /** GroupCard: the strip is always shown in `edgeColor`, not just on selection. */
  alwaysShowEdge?: boolean;
  opacityClassName?: string;
  bg?: string;
  unselectedBorder?: string;
  /** Absolutely-positioned bottom-right button (the run-toggle), Mission/Offer only. */
  trailingButton?: ReactNode;
}) {
  const stripColor = alwaysShowEdge ? edgeColor : isSelected ? (edgeColor ?? "#5cc8ec") : "transparent";

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative mb-2 rounded-[11px] cursor-pointer overflow-hidden select-none transition-colors",
        opacityClassName
      )}
      style={{
        background: isSelected ? "rgba(92,200,236,0.08)" : bg,
        border: `1px solid ${isSelected ? "rgba(92,200,236,0.4)" : unselectedBorder}`,
      }}
    >
      {/* Left edge strip */}
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: stripColor }} />

      <div className="p-3 pl-4">
        {/* Top row: dot + title/subtitle + trailing content */}
        <div className="flex items-start gap-2.5">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="w-2 h-2 rounded-[2px] shrink-0 mt-1" style={{ background: dotColor }} />
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-foreground truncate">{title}</h3>
              {subtitle && (
                <p className="text-[10.5px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {trailing && <div className="text-right shrink-0">{trailing}</div>}
        </div>

        {/* Badge row */}
        {badges && <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">{badges}</div>}

        {trailingButton}
      </div>
    </div>
  );
}
