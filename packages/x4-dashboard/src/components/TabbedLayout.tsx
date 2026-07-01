import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";

export type TabbedLayoutTab = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
  requiresSave?: boolean;
};

// Each domain's layout.tsx supplies its own TABS array plus the outlet-wrapper classes
// it already used (they aren't identical across domains — some scroll their own content,
// some hand scrolling to a child flex column) so this extraction changes no layout behavior.
export function TabbedLayout({
  tabs,
  hasSave = true,
  tabBarClassName,
  outletClassName = "min-h-0 flex-1",
}: {
  tabs: readonly TabbedLayoutTab[];
  hasSave?: boolean;
  tabBarClassName?: string;
  outletClassName?: string;
}) {
  const { location } = useRouterState();
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex items-center gap-1 border-b border-border bg-card px-4 py-2", tabBarClassName)}>
        {tabs
          .filter((t) => !t.requiresSave || hasSave)
          .map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? location.pathname === to : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
      </div>
      <div className={outletClassName}>
        <Outlet />
      </div>
    </div>
  );
}
