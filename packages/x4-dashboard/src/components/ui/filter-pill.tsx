import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type FilterPillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

/** A pill-shaped toggle button for filter bars.  Used by economy, equipment,
 *  inventory, drops, and the ship builder for category/size/type filters. */
export function FilterPill({ active, className, children, ...props }: FilterPillProps) {
  return (
    <button
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted/50 text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
