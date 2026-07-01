import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export function PageSubtitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p className={cn("text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold", className)}>
      {children}
    </p>
  );
}
