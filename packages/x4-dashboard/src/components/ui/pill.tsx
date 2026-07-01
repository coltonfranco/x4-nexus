import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Small uppercase tag used for mission/offer metadata (level, story, repeatable, …).
 * Distinct from `Badge` (which is `rounded-none` and sized for catalog filters) —
 * this is the compact 9px/5px-radius pill used in list-card badge rows.
 */
export function Pill({
  label,
  color,
  bg = "transparent",
  border,
  icon,
  className,
}: {
  label: ReactNode;
  color: string;
  bg?: string;
  border?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      style={{
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        background: bg,
        color,
        borderRadius: "5px",
        border,
      }}
    >
      {icon}
      {label}
    </span>
  );
}
