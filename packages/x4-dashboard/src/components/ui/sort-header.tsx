import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { TableHead } from "./table";

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
    <TableHead className={className}>
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
    </TableHead>
  );
}
