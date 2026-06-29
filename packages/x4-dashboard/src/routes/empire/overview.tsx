import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { Building2, ChevronDown, Coins, FileText, Handshake, Rocket, ScrollText, Ship, Trophy, User, Upload } from "lucide-react";
import { Reputation } from "../../components/GameValues";
import { Currency } from "../../components/Currency";
import { FactionBadge } from "../../components/FactionBadge";
import { getReputationScore } from "../../lib/formatters";
import { prettyId } from "../../lib/wareFormat";
import { ShipDetailPanel } from "../../components/ShipDetailPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../components/ui/dialog";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { useHasSave } from "../../lib/useHasSave";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { STATUS_COLORS } from "../../lib/map/constants";

type Player = { player_id: string | null; name: string | null; credits: number | null; current_ship_id: string | null };
type Licence = { licence_type: string; faction_id: string };
type FleetShip = {
  ship_id: string;
  code: string | null;
  name: string | null;
  macro: string | null;
  catalog_name: string | null;
  class_id: string | null;
  sector_id: string | null;
  role: string | null;
  ship_type: string | null;
};
type Station = { station_id: string; code: string | null; name: string | null; sector_id: string | null; is_under_construction: boolean };
type PlayerRelation = { faction_id: string; faction_name: string | null; color_hex: string | null; relation: number; initial_relation: number | null };
type FactionStrength = {
  faction_id: string;
  military_score: number;
  economic_score: number;
  diplomatic_score: number;
  territory_score: number;
};

type Health = {
  ok: boolean;
  api_version: string;
  save_age_sec: number | null;
  game_version: string | null;
};

const STANDING_CATS = [
  { key: "military_score", label: "Military", color: "var(--destructive)" },
  { key: "economic_score", label: "Economic", color: "var(--success)" },
  { key: "diplomatic_score", label: "Diplomatic", color: "var(--info)" },
  { key: "territory_score", label: "Territory", color: "hsl(38 92% 50%)" },
] as const;
type Faction = { faction_id: string; name: string; color_hex: string | null; icon_url?: string | null };
type Sector = { sector_id: string; name: string | null };

const ROLE_ORDER = ["fight", "trade", "mine", "build", "auxiliary"] as const;
const ROLE_META: Record<string, { label: string; color: string }> = {
  fight: { label: "Combat", color: "bg-red-500" },
  trade: { label: "Trade", color: "bg-sky-500" },
  mine: { label: "Mining", color: "bg-emerald-500" },
  build: { label: "Construction", color: "bg-violet-500" },
  auxiliary: { label: "Auxiliary", color: "bg-amber-500" },
  other: { label: "Other", color: "bg-muted-foreground" },
};
const roleKey = (r: string | null) => (r && ROLE_META[r] ? r : "other");
const CLASS_LABEL: Record<string, string> = { ship_xs: "XS", ship_s: "S", ship_m: "M", ship_l: "L", ship_xl: "XL" };

export default function EmpireOverviewPage() {
  const [showShips, setShowShips] = useState(false);
  const [selectedMacroId, setSelectedMacroId] = useState<string | null>(null);
  const [selectedMacroName, setSelectedMacroName] = useState<string | null>(null);

  const { hasSave } = useHasSave();

  const { data: health, isLoading: isHealthLoading, error: healthError } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/v1/health");
      if (!r.ok) throw new Error(`Health check failed: ${r.status}`);
      return r.json();
    },
  });

  const { data: player, isLoading: isPlayerLoading } = useQuery<Player | null>({
    queryKey: ["player"],
    queryFn: async () => { const r = await fetch("/api/v1/player"); return r.ok ? r.json() : null; },
  });
  const { data: blueprints = [] } = useQuery<{ ware_id: string }[]>({
    queryKey: ["player-blueprints"], queryFn: () => fetch("/api/v1/player/blueprints").then((r) => r.json()),
  });
  const { data: licences = [] } = useQuery<Licence[]>({
    queryKey: ["player-licences"], queryFn: () => fetch("/api/v1/player/licences").then((r) => r.json()),
  });
  const { data: fleet = [] } = useQuery<FleetShip[]>({
    queryKey: ["fleet-player"], queryFn: () => fetch("/api/v1/fleet?player_only=true&limit=2000").then((r) => r.json()),
  });
  const { data: stations = [] } = useQuery<Station[]>({
    queryKey: ["stations-player"], queryFn: () => fetch("/api/v1/stations?player_only=true&limit=2000").then((r) => r.json()),
  });
  const { data: factions = [] } = useQuery<Faction[]>({
    queryKey: ["factions"], queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });
  const { data: reputation = [] } = useQuery<PlayerRelation[]>({
    queryKey: ["player-reputation"], queryFn: () => fetch("/api/v1/player/reputation").then((r) => r.json()),
  });
  const { data: strength = [] } = useQuery<FactionStrength[]>({
    queryKey: ["factions-strength"], queryFn: () => fetch("/api/v1/factions/strength").then((r) => r.json()), staleTime: 30_000,
  });

  const factionMap = useMemo(() => {
    const m = new Map(factions.map(f => [f.faction_id, f]));
    return m;
  }, [factions]);

  const standing = useMemo(
    () =>
      STANDING_CATS.map((c) => {
        const sorted = [...strength].filter((f) => f[c.key] > 0).sort((a, b) => b[c.key] - a[c.key]);
        const idx = sorted.findIndex((f) => f.faction_id === "player");
        const me = strength.find((f) => f.faction_id === "player");
        return { ...c, rank: idx >= 0 ? idx + 1 : null, total: sorted.length, score: me?.[c.key] ?? 0 };
      }),
    [strength]
  );
  const { data: sectors = [] } = useQuery<Sector[]>({
    queryKey: ["map-sectors"], queryFn: () => fetch("/api/v1/map/sectors?limit=2000").then((r) => r.json()), staleTime: 600_000,
  });

  const sectorName = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sectors) if (s.name) m.set(s.sector_id.toLowerCase(), s.name);
    return (id: string | null) => (id ? (m.get(id.toLowerCase()) ?? prettyId(id)) : "Unknown");
  }, [sectors]);
  const factionName = useMemo(() => new Map(factions.map((f) => [f.faction_id, f])), [factions]);

  const fleetByRole = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of fleet) c.set(roleKey(s.role), (c.get(roleKey(s.role)) ?? 0) + 1);
    return [...ROLE_ORDER, "other"].map((r) => ({ r, n: c.get(r) ?? 0 })).filter((x) => x.n > 0);
  }, [fleet]);

  const licencesByFaction = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const l of licences) m.set(l.faction_id, [...(m.get(l.faction_id) ?? []), l.licence_type]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [licences]);

  if (isPlayerLoading) return <PageLoaderPreset preset="empire" />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <User className="h-6 w-6 text-primary" /> {player?.name ?? "Pilot"}
          </h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
            Your empire at a glance
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-4 flex flex-col">
        <div className="flex-1 overflow-auto p-2">
          <div className="max-w-5xl mx-auto w-full space-y-6">
            {!hasSave && (
              <div className="flex items-start gap-4 p-5 rounded-lg border border-amber-500/30 bg-amber-500/5 mb-6">
                <Upload className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-semibold text-amber-200">No save loaded</p>
                  <p className="text-xs text-amber-300/70 mt-1 leading-relaxed">
                    Load a save file from the sidebar to unlock live game data — faction relations,
                    trade routes, conflict zones, empire stats, and more.
                  </p>
                </div>
              </div>
            )}

            {/* API status */}
            <Card className="max-w-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">API Status</CardTitle>
              </CardHeader>
              <CardContent>
                {isHealthLoading ? (
                  <p className="text-sm text-muted-foreground">Connecting…</p>
                ) : healthError ? (
                  <p className="text-sm text-destructive">API unreachable</p>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: health?.ok ? STATUS_COLORS.success : STATUS_COLORS.danger }}
                      />
                      <span className="text-sm font-medium">{health?.ok ? "Online" : "Degraded"}</span>
                      <span className="text-xs text-muted-foreground ml-auto">v{health?.api_version}</span>
                    </div>
                    {health?.game_version && (
                      <p className="text-xs text-muted-foreground">Game {health.game_version}</p>
                    )}
                    {health?.save_age_sec != null && (
                      <p className="text-xs text-muted-foreground">
                        Save {Math.floor(health.save_age_sec)}s old
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {player && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard tone="text-gold" big value={<Currency value={player.credits} abbreviate />} label="Credits" />
                <StatCard icon={Ship} tone="text-sky-400" value={fleet.length.toString()} label="Ships" />
                <StatCard icon={Building2} tone="text-violet-400" value={stations.length.toString()} label="Stations" />
                <StatCard icon={FileText} tone="text-emerald-400" value={blueprints.length.toString()} label="Blueprints" />
              </div>
            )}

            {/* Standing — player rank per live category, among all factions */}
            {strength.length > 0 && player && (
              <Panel title="Standing among factions" icon={Trophy}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {standing.map((c) => {
                    const medal = c.rank === 1 ? "#FFD700" : c.rank === 2 ? "#C0C0C0" : c.rank === 3 ? "#CD7F32" : null;
                    return (
                      <div key={c.key} className="rounded-md border border-border bg-muted/10 p-3">
                        <p className="text-xs text-muted-foreground">{c.label}</p>
                        <div className="flex items-baseline gap-1.5">
                          <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: c.rank != null ? (medal ?? c.color) : undefined }}>
                            {c.rank != null ? `#${c.rank}` : "—"}
                          </p>
                          {c.rank != null && <span className="text-xs text-muted-foreground tabular-nums">of {c.total}</span>}
                        </div>
                        <div className="h-1 bg-border rounded-full overflow-hidden mt-2">
                          <div className="h-full rounded-full" style={{ width: `${c.score}%`, backgroundColor: c.color }} />
                        </div>
                        <p className="text-xs text-muted-foreground tabular-nums mt-1">{c.score.toFixed(0)}/100</p>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* Reputation — player standing with each faction */}
            {reputation.length > 0 && player && (
              <Panel title={`Reputation · ${reputation.length} factions`} icon={Handshake}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                  {reputation.map((r) => {
                    const cur = getReputationScore(r.relation);
                    const init = r.initial_relation != null ? getReputationScore(r.initial_relation) : null;
                    const drift = init != null ? cur - init : 0;
                    return (
                      <div key={r.faction_id} className="flex items-center justify-between gap-2 text-sm py-0.5">
                        <FactionBadge name={r.faction_name ?? prettyId(r.faction_id)} color_hex={r.color_hex} icon_url={factionMap.get(r.faction_id)?.icon_url} faction_id={r.faction_id} />
                        <div className="flex items-center gap-1.5 shrink-0">
                          {Math.abs(drift) >= 1 && (
                            <span className={`text-xs tabular-nums ${drift > 0 ? "text-success" : "text-danger"}`}>
                              {drift > 0 ? "▲" : "▼"}
                              {Math.abs(drift).toFixed(0)}
                            </span>
                          )}
                          <Reputation value={cur} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* Fleet by role */}
            {player && (
              <Panel title={`Fleet · ${fleet.length} ships`} icon={Rocket}>
                {fleet.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No player-owned ships.</p>
                ) : (
                  <>
                    <div className="flex h-3 w-full rounded-full overflow-hidden bg-border">
                      {fleetByRole.map(({ r, n }) => (
                        <div key={r} className={ROLE_META[r].color} style={{ width: `${(n / fleet.length) * 100}%` }} title={`${ROLE_META[r].label}: ${n}`} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                      {fleetByRole.map(({ r, n }) => (
                        <div key={r} className="flex items-center gap-1.5 text-sm">
                          <span className={`h-2.5 w-2.5 rounded-sm ${ROLE_META[r].color}`} />
                          <span className="font-medium">{ROLE_META[r].label}</span>
                          <span className="text-muted-foreground tabular-nums">{n}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowShips((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showShips ? "rotate-180" : ""}`} />
                      {showShips ? "Hide" : "Show all ships"}
                    </button>
                    {showShips && (
                      <div className="mt-2 max-h-80 overflow-auto rounded-md border border-border divide-y divide-border/40">
                        {[...fleet]
                          .sort((a, b) => roleKey(a.role).localeCompare(roleKey(b.role)))
                          .map((s) => (
                            <div
                              key={s.ship_id}
                              className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-muted/20 cursor-pointer"
                              onClick={() => {
                                if (s.macro) {
                                  setSelectedMacroId(s.macro);
                                  setSelectedMacroName(s.name || s.catalog_name || s.ship_type || "Ship");
                                }
                              }}
                            >
                              <span className={`h-2 w-2 rounded-sm shrink-0 ${ROLE_META[roleKey(s.role)].color}`} />
                              <span className="font-medium truncate w-40">{s.name || s.catalog_name || s.ship_type || "Ship"}</span>
                              <span className="text-muted-foreground w-8 tabular-nums">{CLASS_LABEL[s.class_id ?? ""] ?? ""}</span>
                              <span className="text-muted-foreground capitalize w-16 truncate">{s.ship_type ?? ""}</span>
                              <span className="text-muted-foreground/80 truncate flex-1">{sectorName(s.sector_id)}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </Panel>
            )}

            {/* Player stations */}
            {stations.length > 0 && player && (
              <Panel title={`Stations · ${stations.length}`} icon={Building2}>
                <div className="flex flex-wrap gap-2">
                  {stations.map((st) => (
                    <div key={st.station_id} className="rounded-md border border-border bg-muted/20 px-3 py-1.5 text-xs">
                      <div className="font-medium">{st.name || st.code || "Station"}</div>
                      <div className="text-muted-foreground">
                        {sectorName(st.sector_id)}
                        {st.is_under_construction && <span className="text-warning"> · building</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* Licences */}
            {player && (
              <Panel title={`Licences · ${licences.length}`} icon={ScrollText}>
                <p className="text-xs text-muted-foreground mb-3">Includes default trade licences granted by most factions.</p>
                {licencesByFaction.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No licences held.</p>
                ) : (
                  <div className="space-y-3">
                    {licencesByFaction.map(([fid, types]) => {
                      const f = factionName.get(fid);
                      return (
                        <div key={fid}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <Link to="/factions" search={{ faction: fid }} className="flex items-center gap-2 transition-opacity hover:opacity-80">
                              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: f?.color_hex ?? "#888" }} />
                              <span className="text-sm font-semibold" style={{ color: f?.color_hex ?? undefined }}>{f?.name ?? prettyId(fid)}</span>
                            </Link>
                            <span className="text-xs text-muted-foreground">{types.length}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 pl-4">
                            {types.map((t) => (
                              <span key={t} className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground">
                                {prettyId(t)}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            )}
          </div>
        </div>
      </div>

      <Dialog open={selectedMacroId !== null} onOpenChange={(open) => { if (!open) setSelectedMacroId(null); }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedMacroName ?? "Ship details"}</DialogTitle>
            <DialogDescription>Detailed stats for {selectedMacroName}</DialogDescription>
          </DialogHeader>
          {selectedMacroId && <ShipDetailPanel shipId={selectedMacroId} factions={factions} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon: Icon, tone, value, label, big }: { icon?: typeof Coins; tone: string; value: ReactNode; label: string; big?: boolean }) {
  return (
    <HUDCard className="p-4 flex flex-col gap-1 justify-center">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className={`h-3.5 w-3.5 ${tone}`} />}
        {label}
      </div>
      <span className={`font-bold tabular-nums leading-tight ${big ? "text-4xl" : "text-3xl"} ${tone}`}>{value}</span>
    </HUDCard>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Coins; children: ReactNode }) {
  return (
    <HUDCard className="p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 border-b border-border/50 pb-3">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      {children}
    </HUDCard>
  );
}
