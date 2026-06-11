import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Handshake,
  Home,
  Map,
  Package,
  Shield,
  Sword,
  TrendingUp,
  User,
  Wrench,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { SaveSelector } from "../SaveSelector";
import { ThemeToggle } from "./ThemeToggle";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/empire", label: "Empire", icon: User },
  { to: "/trade", label: "Trade", icon: TrendingUp },
  { to: "/equipment", label: "Equipment", icon: Wrench },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/map", label: "Map", icon: Map },
  { to: "/ships", label: "Ships", icon: Sword },
  { to: "/factions", label: "Factions", icon: Shield },
  { to: "/drops", label: "Drop Tables", icon: Package },
  { to: "/diplomacy", label: "Diplomacy", icon: Handshake },
] as const;

export function AppLayout() {
  const { location } = useRouterState();

  return (
    <div
      style={{ display: "flex", minHeight: "100vh" }}
      className="bg-background text-foreground"
    >
      {/* Sidebar */}
      <aside
        style={{ width: 200, flexShrink: 0 }}
        className="flex flex-col border-r border-border bg-card"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "hsl(var(--primary))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "hsl(var(--primary-foreground))",
            }}
          >
            X4
          </div>
          <span className="font-semibold text-sm tracking-wide">Companion</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-2 flex-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <SaveSelector />
        <div className="p-3 border-t border-border">
          <ThemeToggle />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
