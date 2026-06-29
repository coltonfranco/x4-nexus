import { useEffect, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useIsMutating } from "@tanstack/react-query";
import {
  Boxes,
  Crown,
  Map,
  MessageSquare,
  Rocket,
  Shield,
  TrendingUp,
  Target,
  Factory,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useHasSave } from "../../lib/useHasSave";
import { SaveSelector } from "../SaveSelector";
import { PlayerSummary } from "../PlayerSummary";
import { RefreshIndicator } from "../RefreshIndicator";
import { SettingsModal } from "../SettingsModal";
import { UpdateNotifier } from "../UpdateNotifier";
// ThemeToggle hidden per design — dark-only, infrastructure preserved for future light theme

const navItems = [
  { to: "/empire", label: "Empire", icon: Crown, requiresSave: true },
  { to: "/map", label: "Map", icon: Map, requiresSave: false },
  { to: "/trade", label: "Trade", icon: TrendingUp, requiresSave: false },
  { to: "/inventory", label: "Inventory", icon: Boxes, requiresSave: false },
  { to: "/ships", label: "Ships", icon: Rocket, requiresSave: false },
  { to: "/stations", label: "Stations", icon: Factory, requiresSave: false },
  { to: "/missions", label: "Missions", icon: Target, requiresSave: true },
  { to: "/messages", label: "Messages", icon: MessageSquare, requiresSave: true },
  { to: "/factions", label: "Factions", icon: Shield, requiresSave: false },
] as const;

export function AppLayout() {
  const { hasSave } = useHasSave();
  const { location } = useRouterState();
  const isActivating = useIsMutating({ mutationKey: ["activate-save"] }) > 0;

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
          {/* Logo + settings */}
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
            <div className="ml-auto">
              <SettingsModal />
            </div>
          </div>

          {/* Active player */}
          <PlayerSummary />

          {/* Nav */}
          <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
            {navItems.filter(item => !item.requiresSave || hasSave).map(({ to, label, icon: Icon }) => {
              const active = location.pathname.startsWith(to);
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
          <RefreshIndicator />
          <UpdateNotifier />
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>

      {/* Save activation overlay */}
      {isActivating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-card border border-border shadow-2xl">
            <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-foreground">Ingesting save…</p>
            <p className="text-xs text-muted-foreground">Extracting ships, stations, relations, and trade data</p>
          </div>
        </div>
      )}
    </div>
  );
}
