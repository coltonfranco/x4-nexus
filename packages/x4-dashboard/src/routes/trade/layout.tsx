import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, BookOpen, TrendingUp } from "lucide-react";
import { cn } from "../../lib/utils";
import { useHasSave } from "../../lib/useHasSave";

const TABS = [
  { to: "/trade", label: "Catalog", icon: BookOpen, exact: true, requiresSave: false },
  { to: "/trade/supply", label: "Supply Radar", icon: AlertTriangle, exact: false, requiresSave: true },
  { to: "/trade/routes", label: "Routes", icon: TrendingUp, exact: false, requiresSave: true },
] as const;

/** Trade hub: a slim tab strip over the commodity catalog, live supply radar, and
 *  ranked routes. Each tab is its own route so the URL is shareable. */
export function TradeLayout() {
  const { hasSave } = useHasSave();
  const { location } = useRouterState();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card px-4 py-2">
        {TABS.filter(t => !t.requiresSave || hasSave).map(({ to, label, icon: Icon, exact }) => {
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
