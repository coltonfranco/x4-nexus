import type { ReactNode } from "react";
import { cn } from "../lib/utils";

interface FilterBarProps {
  children: ReactNode;
  secondRow?: ReactNode;
  className?: string;
}

export function FilterBar({ children, secondRow, className }: FilterBarProps) {
  return (
    <div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border/50 bg-muted/5 relative z-10",
          className
        )}
      >
        {children}
      </div>
      {secondRow && (
        <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-b border-border/50 bg-muted/5">
          {secondRow}
        </div>
      )}
    </div>
  );
}
