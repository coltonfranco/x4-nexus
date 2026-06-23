import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Building2, Database } from "lucide-react";
import { cn } from "../../lib/utils";

const TABS = [
  { to: "/stations", label: "Modules", icon: Database, exact: true },
  { to: "/stations/overview", label: "My Stations", icon: Building2, exact: false },
  // Future: { to: "/stations/planner", label: "Station Planner", icon: Factory, exact: false },
] as const;

/** Station construction hub: a tabbed layout over modules, and future planner. */
export function StationsLayout() {
  const { location } = useRouterState();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card px-4 py-2">
        {TABS.map(({ to, label, icon: Icon, exact }) => {
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
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
