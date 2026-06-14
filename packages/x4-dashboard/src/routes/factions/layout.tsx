import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Handshake, Shield } from "lucide-react";
import { cn } from "../../lib/utils";

const TABS = [
  { to: "/factions", label: "Registry", icon: Shield, exact: true },
  { to: "/factions/diplomacy", label: "Diplomacy", icon: Handshake, exact: false },
] as const;

export function FactionsLayout() {
  const { location } = useRouterState();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-border bg-card px-4 py-2 shrink-0">
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
      <div className="min-h-0 flex-1 flex flex-col">
        <Outlet />
      </div>
    </div>
  );
}
