import { useEffect } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Crown,
  Cpu,
  Handshake,
  Home,
  Map,
  PackageOpen,
  Rocket,
  Shield,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { SaveSelector } from "../SaveSelector";
import { SettingsModal } from "../SettingsModal";
// ThemeToggle hidden per design — dark-only, infrastructure preserved for future light theme

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/empire", label: "Empire", icon: Crown },
  { to: "/trade", label: "Trade", icon: TrendingUp },
  { to: "/equipment", label: "Equipment", icon: Cpu },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/map", label: "Map", icon: Map },
  { to: "/ships", label: "Ships", icon: Rocket },
  { to: "/factions", label: "Factions", icon: Shield },
  { to: "/drops", label: "Drop Tables", icon: PackageOpen },
  { to: "/diplomacy", label: "Diplomacy", icon: Handshake },
  { to: "/player", label: "Player", icon: User },
] as const;

export function AppLayout() {
  const { location } = useRouterState();

  // Force dark-only — infrastructure preserved for future light theme
  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  return (
    <div
      style={{ display: "flex", height: "100vh" }}
      className="bg-transparent text-foreground"
    >
      {/* Sidebar */}
      <aside
        style={{ width: 240, flexShrink: 0 }}
        className="flex flex-col border-r border-border bg-card"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--primary-foreground)",
            }}
          >
            X4
          </div>
          <span className="font-semibold text-sm tracking-wide">Companion</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
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
        <div className="p-3 border-t border-border flex items-center justify-end">
          <SettingsModal />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
