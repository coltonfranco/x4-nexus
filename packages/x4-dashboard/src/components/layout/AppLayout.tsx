import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Boxes,
  Crown,
  Handshake,
  Home,
  Map,
  PackageOpen,
  Rocket,
  Shield,
  TrendingUp,
  User,
  Activity,
  Target,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { SaveSelector } from "../SaveSelector";
import { SettingsModal } from "../SettingsModal";
// ThemeToggle hidden per design — dark-only, infrastructure preserved for future light theme

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/empire", label: "Empire", icon: Crown },
  { to: "/trade", label: "Trade", icon: TrendingUp },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/map", label: "Map", icon: Map },
  { to: "/ships", label: "Ships", icon: Rocket },
  { to: "/missions", label: "Missions", icon: Target },
  { to: "/factions", label: "Factions", icon: Shield },
  { to: "/stats", label: "Stats", icon: Activity },
] as const;

export function AppLayout() {
  const { location } = useRouterState();

  // Force dark-only — infrastructure preserved for future light theme
  useEffect(() => {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  const isMap = location.pathname === "/map" || location.pathname.startsWith("/map/");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Hide sidebar only when the map is open AND in browser fullscreen.
  // Normal map browsing keeps the nav accessible.
  const hideSidebar = isMap && isFullscreen;

  return (
    <div
      style={{ display: "flex", height: "100vh" }}
      className="bg-transparent text-foreground"
    >
      {/* Sidebar — hidden only when on map route AND in browser fullscreen */}
      {!hideSidebar && (
        <aside
          style={{ width: 240, flexShrink: 0 }}
          className="flex flex-col border-r border-border bg-card"
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border select-none">
            <img
              src="/logo.svg"
              alt="X4 Nexus Logo"
              className="w-9 h-9"
            />
            <div className="flex items-baseline gap-1">
              <span className="font-bold text-xl tracking-wide text-foreground">X4</span>
              <span className="font-medium text-[14px] tracking-[0.2em] text-primary uppercase">Nexus</span>
            </div>
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
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors select-none",
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
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
