import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../../lib/utils";

type SortHeaderProps = {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  className?: string;
};

/** A sortable table column header with ascending/descending arrow indicator.
 *  Used by equipment, inventory, and trade/catalog tables. */
export function SortHeader({ label, active, dir, onClick, className }: SortHeaderProps) {
  return (
    <th className={cn("px-3 py-2 text-left font-medium", className)}>
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : ""
        )}
      >
        {label}
        {active && (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );
}
