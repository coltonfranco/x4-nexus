import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Activity, Box, Briefcase, Compass, Crosshair, Globe,
  Handshake, Mountain, Shield, Swords, Timer, TrendingUp, User,
} from "lucide-react";
import { PageLoaderPreset } from "./PageLoader";
import { Currency } from "./Currency";
import { HUDCard } from "./HUDCard";
import { apiGet, apiGetOrNull } from "../lib/api";
import { useSaveTime } from "../lib/useSaveTime";
import { formatCompactNumber, formatDuration } from "../lib/formatters";

// ── Types ──────────────────────────────────────────────────────────────────────

type PlayerStat = { stat_id: string; value: number; display: string };

type StatGroup = {
  label: string;
  icon: typeof Activity;
  stats: PlayerStat[];
};

// ── Category definitions ───────────────────────────────────────────────────────

const CATEGORY_PREFIXES: Record<string, { label: string; icon: typeof Activity }> = {
  "bullets_":         { label: "Marksmanship",  icon: Crosshair },
  "missiles_":        { label: "Missiles",      icon: Crosshair },
  "ships_destroyed":  { label: "Combat",        icon: Swords },
  "xenon_":           { label: "Combat",        icon: Swords },
  "khaak_":           { label: "Combat",        icon: Swords },
  "capships_":        { label: "Combat",        icon: Swords },
  "turrets_":         { label: "Combat",        icon: Swords },
  "fight_":           { label: "Combat",        icon: Swords },
  "boarding_":        { label: "Combat",        icon: Swords },
  "lasertowers_":     { label: "Combat",        icon: Swords },
  "mines_":           { label: "Combat",        icon: Swords },
  "countermeasures_": { label: "Combat",        icon: Swords },
  "pilots_":          { label: "Combat",        icon: Swords },
  "drones_":          { label: "Combat",        icon: Swords },

  "distance_":        { label: "Travel",        icon: Compass },
  "time_":            { label: "Travel",        icon: Timer },
  "gates_":           { label: "Travel",        icon: Compass },
  "accelerators_":    { label: "Travel",        icon: Compass },
  "anomalies_":       { label: "Travel",        icon: Compass },
  "clusters_":        { label: "Exploration",   icon: Globe },
  "sectors_":         { label: "Exploration",   icon: Globe },

  "trade_":           { label: "Economy",       icon: TrendingUp },
  "trades_":          { label: "Economy",       icon: TrendingUp },
  "money_":           { label: "Economy",       icon: TrendingUp },
  "stations_":        { label: "Economy",       icon: Briefcase },
  "station_":         { label: "Economy",       icon: Briefcase },
  "discounts_":       { label: "Economy",       icon: TrendingUp },
  "commissions_":     { label: "Economy",       icon: TrendingUp },
  "objects_":         { label: "Economy",       icon: Box },

  "missions_":        { label: "Missions",      icon: Shield },
  "escort_":          { label: "Missions",      icon: Shield },
  "passenger_":       { label: "Missions",      icon: Shield },

  "diplomacy_":       { label: "Diplomacy",     icon: Handshake },
  "terraforming_":    { label: "Terraforming",  icon: Mountain },

  "venture_":         { label: "Ventures",      icon: Globe },

  "ships_owned":      { label: "Fleet",         icon: Briefcase },
  "ships_boarded":    { label: "Fleet",         icon: Swords },
  "ships_claimed":    { label: "Fleet",         icon: Briefcase },

  "staff_":           { label: "Personnel",     icon: User },
  "population":       { label: "Personnel",     icon: User },

  "weapon_mods":      { label: "Modifications", icon: Activity },
  "engine_mods":      { label: "Modifications", icon: Activity },
  "shield_mods":      { label: "Modifications", icon: Activity },
  "ship_mods":        { label: "Modifications", icon: Activity },
  "clothing_mods":    { label: "Modifications", icon: Activity },
  "paint_mods":       { label: "Modifications", icon: Activity },
};

function categorizeStats(stats: PlayerStat[]): StatGroup[] {
  const groups = new Map<string, { label: string; icon: typeof Activity; stats: PlayerStat[] }>();
  const other: PlayerStat[] = [];

  for (const stat of stats) {
    let matched = false;
    for (const [prefix, group] of Object.entries(CATEGORY_PREFIXES)) {
      if (stat.stat_id === prefix || stat.stat_id.startsWith(prefix)) {
        if (!groups.has(group.label)) {
          groups.set(group.label, { ...group, stats: [] });
        }
        groups.get(group.label)!.stats.push(stat);
        matched = true;
        break;
      }
    }
    if (!matched) {
      other.push(stat);
    }
  }

  const result = Array.from(groups.values());
  if (other.length > 0) {
    result.push({ label: "Other", icon: Box, stats: other });
  }
  return result;
}

// ── Formatting helpers ─────────────────────────────────────────────────────────

function fmtValue(stat: PlayerStat): string {
  const v = stat.value;
  if (stat.stat_id.endsWith("_percent")) return `${v.toFixed(1)}%`;
  if (stat.stat_id.includes("_rank")) return `${v}`;
  if (stat.stat_id.includes("_score")) return v.toLocaleString();
  if (v >= 1_000) return formatCompactNumber(v, { decimals: 1 });
  if (v === Math.floor(v)) return v.toLocaleString();
  return v.toFixed(1);
}

// ── Player Card ────────────────────────────────────────────────────────────────

export function PlayerCard() {
  const { data: meta, isLoading: metaLoading } = useQuery<{
    player_name?: string; player_credits?: number;
    game_version?: string;
  } | null>({
    queryKey: ["player-meta"],
    queryFn: () =>
      apiGetOrNull<{ player_name?: string; player_credits?: number; game_version?: string }>(
        "/api/v1/player"
      ),
    staleTime: 60_000,
  });

  const saveTime = useSaveTime();

  const { data: stats = [] } = useQuery<PlayerStat[]>({
    queryKey: ["player-stats"],
    queryFn: () => apiGet<PlayerStat[]>("/api/v1/player/stats"),
    staleTime: 60_000,
  });

  const groups = useMemo(() => categorizeStats(stats), [stats]);

  const playTime = saveTime > 0 ? formatDuration(saveTime) : null;

  if (metaLoading) return <div className="text-sm text-muted-foreground p-6"><PageLoaderPreset preset="player" /></div>;
  if (!meta) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">
          {meta.player_name || "Player Stats"}
        </h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold flex items-center gap-1.5 flex-wrap">
          <Activity className="h-3 w-3" /> Player Statistics
          {meta.game_version && (
            <>
              <span className="opacity-50">·</span>
              <span>v{meta.game_version}</span>
            </>
          )}
          {playTime && (
            <>
              <span className="opacity-50">·</span>
              <Timer className="w-3.5 h-3.5" />
              <span>{playTime} play time</span>
            </>
          )}
          {meta.player_credits != null && (
            <>
              <span className="opacity-50">·</span>
              <Currency value={meta.player_credits} className="text-amber-500" />
            </>
          )}
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl">
          {groups.map((group) => (
            <HUDCard
              key={group.label}
              className="rounded-lg border-border overflow-hidden h-full flex flex-col"
            >
              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/20 shrink-0">
                <group.icon className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </span>
                <span className="ml-auto text-xs text-muted-foreground/60 tabular-nums">
                  {group.stats.length}
                </span>
              </div>
              {/* Group rows */}
              <div className="divide-y divide-border/50 flex-1">
                {group.stats.map((stat) => (
                  <div
                    key={stat.stat_id}
                    className="flex items-center justify-between px-4 py-2 hover:bg-muted/10 transition-colors"
                  >
                    <span className="text-sm">{stat.display}</span>
                    <span className="text-sm font-mono tabular-nums font-medium text-foreground/80">
                      {fmtValue(stat)}
                    </span>
                  </div>
                ))}
              </div>
            </HUDCard>
          ))}
        </div>

        {stats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
            <Activity className="w-10 h-10 opacity-30" />
            <p className="text-sm">No stats yet — ingest a save to see your player card</p>
          </div>
        )}
      </div>
    </div>
  );
}
