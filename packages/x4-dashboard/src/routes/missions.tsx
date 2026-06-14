import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Target, MapPin, Building2, ScrollText, Swords, RefreshCw, Clock, User } from "lucide-react";
import { HUDCard } from "../components/HUDCard";
import { FilterPill } from "../components/ui/filter-pill";
import { FactionCombobox } from "../components/FactionCombobox";
import { FactionBadge } from "../components/FactionBadge";
import { StatBar } from "../components/StatBar";
import { PageLoaderPreset } from "../components/PageLoader";
import type { FactionSummary } from "../lib/map/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type MissionObjective = {
  step: number | null;
  type: string | null;
  text: string | null;
  is_active: boolean;
  target_id: string | null;
  progress_current: number | null;
  progress_max: number | null;
  progress_name: string | null;
  encyclopedia_type: string | null;
  encyclopedia_item: string | null;
};

type Mission = {
  mission_id: string | null;
  name: string | null;
  description: string | null;
  faction: string | null;
  type: string | null;
  level: string | null;
  is_active: boolean;
  priority: number | null;
  abortable: boolean | null;
  associated_entity: string | null;
  group_id: string | null;
  is_story: boolean | null;
  rewardtext: string | null;
  reward_credits: number | null;
  opposing_faction: string | null;
  caption: string | null;
  icon: string | null;
  time: string | null;
  objectives: MissionObjective[];
};

type MissionOffer = {
  offer_id: string | null;
  name: string | null;
  description: string | null;
  faction: string | null;
  type: string | null;
  level: string | null;
  actor: string | null;
  station_id: string | null;
  bbs_station_id: string | null;
  is_repeatable: boolean;
  rewardtext: string | null;
};

type PlayerMeta = { in_game_time_sec: number | null };

type PlayerStat = { stat_id: string; value: number; display: string };

// ── Difficulty constants ──────────────────────────────────────────────────────

const DIFFICULTY_KEYS = ["trivial", "veryeasy", "easy", "medium", "hard", "veryhard"] as const;
type Difficulty = (typeof DIFFICULTY_KEYS)[number];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  trivial:  "Trivial",
  veryeasy: "Very Easy",
  easy:     "Easy",
  medium:   "Medium",
  hard:     "Hard",
  veryhard: "Very Hard",
};

const LEVEL_COLORS: Record<Difficulty, string> = {
  trivial:   "#22d3ee",
  veryeasy:  "#4ade80",
  easy:      "#a3e635",
  medium:    "#facc15",
  hard:      "#f97316",
  veryhard:  "#ef4444",
};

function levelLabel(level: string | null): string | null {
  if (!level) return null;
  return DIFFICULTY_LABEL[level as Difficulty] ?? level;
}

// ── Mission type colours ──────────────────────────────────────────────────────

type MissionType = string;

const TYPE_COLORS: Record<MissionType, string> = {
  plot:        "#eab308",
  build:       "#f59e0b",
  destroy:     "#ef4444",
  fight:       "#f97316",
  kill:        "#dc2626",
  board:       "#e879f9",
  protect:     "#3b82f6",
  escort:      "#60a5fa",
  deliver:     "#22c55e",
  transport:   "#2dd4bf",
  drop:        "#14b8a6",
  hack:        "#c084fc",
  intelligence:"#a855f7",
  find:        "#fbbf24",
  rescue:      "#64748b",
  upkeep_hirenpc: "#94a3b8",
  tutorial:    "#6b7280",
};

function typeColor(t: MissionType): string {
  return TYPE_COLORS[t] ?? "#94a3b8";
}

function typeLabel(t: MissionType): string {
  return t
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

// Objective types from the save XML — human-readable labels.
const OBJ_TYPE_LABEL: Record<string, string> = {
  acquire_crew: "Acquire Crew",
  await:        "Await",
  build_module: "Build Module",
  claim:        "Claim",
  custom:       "Objective",
  deliver:      "Deliver",
  dockat:       "Dock At",
  flyto:        "Fly To",
  investigate:  "Investigate",
  kill:         "Kill",
  talkto:       "Talk To",
  unlock:       "Unlock",
};

function objTypeLabel(t: string | null): string {
  if (!t) return "";
  return OBJ_TYPE_LABEL[t] ?? t.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(missionTime: string | null | undefined, nowSec: number | null): string | null {
  if (!missionTime || nowSec == null) return null;
  const t = parseFloat(missionTime);
  if (isNaN(t)) return null;
  const deltaSec = nowSec - t;
  if (deltaSec < 0) return null;
  const hrs = Math.floor(deltaSec / 3600);
  const mins = Math.floor((deltaSec % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m ago`;
  return `${mins}m ago`;
}

function fmtItemRef(encyclopediaItem: string | null | undefined): string | null {
  if (!encyclopediaItem) return null;
  // Convert inv_agidevice_01 → "AGI Device"
  return encyclopediaItem
    .replace(/^inv_/, "")
    .replace(/^ship_/, "")
    .replace(/_/g, " ")
    .replace(/[0-9]+$/, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Tag / badge helpers ───────────────────────────────────────────────────────

function levelBadge(level: string | null) {
  const label = levelLabel(level);
  if (!label) return null;
  const color = LEVEL_COLORS[level as Difficulty] ?? "var(--text-muted)";
  return (
    <span
      style={{
        padding: "3px 8px",
        fontWeight: 700,
        fontSize: "8.5px",
        textTransform: "uppercase",
        background: `${color}20`,
        color,
        borderRadius: 0,
      }}
    >
      {label}
    </span>
  );
}

function storyTag() {
  return (
    <span
      style={{
        padding: "3px 8px",
        fontWeight: 700,
        fontSize: "8.5px",
        textTransform: "uppercase",
        background: "transparent",
        color: "var(--gold)",
        border: "1px solid var(--gold-dim)",
        borderRadius: 0,
      }}
    >
      Story
    </span>
  );
}

function repeatableTag() {
  return (
    <span
      className="flex items-center gap-1"
      style={{
        padding: "3px 8px",
        fontWeight: 700,
        fontSize: "8.5px",
        textTransform: "uppercase",
        background: "transparent",
        color: "#7dd3fc",
        border: "1px solid rgba(125,211,252,0.35)",
        borderRadius: 0,
      }}
    >
      <RefreshCw className="w-3 h-3" />
      Repeatable
    </span>
  );
}

function typeIcon(type: string | null) {
  if (!type) return <Target className="w-4 h-4 text-muted-foreground" />;
  const iconMap: Record<string, typeof Target> = {
    plot: ScrollText,
    build: Building2,
    destroy: Swords,
    fight: Swords,
    kill: Swords,
    board: Swords,
    protect: Shield,
    escort: Shield,
  };
  const Icon = iconMap[type] ?? Target;
  return <Icon className="w-4 h-4 text-muted-foreground" />;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  const [difficultyFilter, setDifficultyFilter] = useState<Set<Difficulty>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<MissionType>>(new Set());
  const [factionFilter, setFactionFilter] = useState<string>("all");
  const [storyOnly, setStoryOnly] = useState(false);

  const { data: missions, isLoading: missionsLoading } = useQuery<Mission[]>({
    queryKey: ["missions"],
    queryFn: () => fetch("/api/v1/missions").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: offers, isLoading: offersLoading } = useQuery<MissionOffer[]>({
    queryKey: ["mission-offers"],
    queryFn: () => fetch("/api/v1/missions/offers?exclude_tutorials=true").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<PlayerStat[]>({
    queryKey: ["player-stats"],
    queryFn: () => fetch("/api/v1/player/stats").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: playerMeta } = useQuery<PlayerMeta>({
    queryKey: ["player-meta"],
    queryFn: () => fetch("/api/v1/player").then((r) => (r.ok ? r.json() : { in_game_time_sec: null })),
    staleTime: 60_000,
  });

  const { data: factions } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
    staleTime: 300_000,
  });

  const factionMap = useMemo(() => {
    const map = new Map<string, FactionSummary>();
    for (const f of factions ?? []) map.set(f.faction_id, f);
    return map;
  }, [factions]);

  const nowSec = playerMeta?.in_game_time_sec ?? null;

  if (missionsLoading || offersLoading) {
    return (
      <div className="h-full flex flex-col justify-center text-sm text-muted-foreground">
        <PageLoaderPreset preset="missions" />
      </div>
    );
  }

  const accepted = stats?.find((s) => s.stat_id === "missions_accepted")?.value ?? 0;
  const completed = stats?.find((s) => s.stat_id === "missions_completed")?.value ?? 0;

  const filterMission = (m: Mission) => {
    if (difficultyFilter.size > 0 && !difficultyFilter.has(m.level as Difficulty)) return false;
    if (typeFilter.size > 0 && m.type && !typeFilter.has(m.type)) return false;
    if (factionFilter !== "all" && m.faction !== factionFilter) return false;
    if (storyOnly && !m.is_story) return false;
    return true;
  };

  const filterOffer = (o: MissionOffer) => {
    if (difficultyFilter.size > 0 && !difficultyFilter.has(o.level as Difficulty)) return false;
    if (typeFilter.size > 0 && o.type && !typeFilter.has(o.type)) return false;
    if (factionFilter !== "all" && o.faction !== factionFilter) return false;
    return true;
  };

  const availableFactionIds = [
    ...new Set([
      ...(missions ?? []).map((m) => m.faction).filter(Boolean),
      ...(offers ?? []).map((o) => o.faction).filter(Boolean),
    ]),
  ].sort() as string[];

  const availableTypes = [
    ...new Set([
      ...(missions ?? []).map((m) => m.type).filter(Boolean),
      ...(offers ?? []).map((o) => o.type).filter(Boolean),
    ]),
  ].sort() as string[];

  const factionSummaries: FactionSummary[] = (factions ?? [])
    .filter((f) => availableFactionIds.includes(f.faction_id))
    .map((f) => ({ ...f }));

  const activeMissions = (missions ?? []).filter((m) => m.is_active && filterMission(m));
  const inactiveMissions = (missions ?? []).filter((m) => !m.is_active && filterMission(m));
  const repeatableOffers = (offers ?? []).filter((o) => o.is_repeatable && filterOffer(o));
  const oneShotOffers = (offers ?? []).filter((o) => !o.is_repeatable && filterOffer(o));

  const hasFilters = difficultyFilter.size > 0 || typeFilter.size > 0 || factionFilter !== "all" || storyOnly;

  const toggleFilter = <T,>(setter: (fn: (prev: Set<T>) => Set<T>) => void, value: T) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border shrink-0 space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Missions</h1>
          <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold flex items-center gap-1.5 flex-wrap">
            <Shield className="h-3 w-3" />
            Mission Board
            {accepted > 0 && (
              <>
                <span className="opacity-50">·</span>
                <span>
                  {completed}/{accepted} completed
                </span>
              </>
            )}
          </p>
        </div>

        {/* Filter bar — difficulty */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Difficulty</span>
          {DIFFICULTY_KEYS.map((d) => {
            const active = difficultyFilter.has(d);
            const color = LEVEL_COLORS[d];
            return (
              <button
                key={d}
                onClick={() => toggleFilter(setDifficultyFilter, d)}
                className="rounded-none px-2.5 py-1 text-xs font-medium transition-colors"
                style={{
                  background: active ? `${color}20` : "var(--muted)",
                  color: active ? color : "var(--text-muted)",
                  border: active ? `1px solid ${color}40` : "1px solid transparent",
                }}
              >
                {DIFFICULTY_LABEL[d]}
              </button>
            );
          })}
        </div>

        {/* Filter bar — type */}
        {availableTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Type</span>
            {availableTypes.map((t) => {
              const active = typeFilter.has(t);
              const color = typeColor(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleFilter(setTypeFilter, t)}
                  className="rounded-none px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: active ? `${color}20` : "var(--muted)",
                    color: active ? color : "var(--text-muted)",
                    border: active ? `1px solid ${color}40` : "1px solid transparent",
                  }}
                >
                  {typeLabel(t)}
                </button>
              );
            })}
          </div>
        )}

        {/* Filter bar — faction + story + clear */}
        <div className="flex flex-wrap items-center gap-1.5">
          {factionSummaries.length > 1 && (
            <FactionCombobox
              factions={factionSummaries}
              value={factionFilter}
              onChange={setFactionFilter}
              className="w-[180px]"
            />
          )}
          <FilterPill active={storyOnly} onClick={() => setStoryOnly(!storyOnly)}>
            Story Only
          </FilterPill>
          {hasFilters && (
            <button
              onClick={() => { setDifficultyFilter(new Set()); setTypeFilter(new Set()); setFactionFilter("all"); setStoryOnly(false); }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl">
          {/* Active missions */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              Active Missions ({activeMissions.length + inactiveMissions.length})
            </h2>

            {activeMissions.length === 0 && inactiveMissions.length === 0 && (
              <p className="text-sm text-muted-foreground py-8">
                No missions match the current filters.
              </p>
            )}

            {[...activeMissions, ...inactiveMissions].map((m) => {
              const factionObj = m.faction ? factionMap.get(m.faction) : undefined;
              const opposingObj = m.opposing_faction ? factionMap.get(m.opposing_faction) : undefined;
              const mtypeColor = m.type ? typeColor(m.type) : undefined;
              const relativeTime = fmtTime(m.time, nowSec);
              return (
              <HUDCard key={m.mission_id} className="rounded-lg overflow-hidden" accents={false}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {typeIcon(m.type)}
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm truncate">{m.name}</h3>
                        {m.caption && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <User className="w-3 h-3" />
                            {m.caption}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {m.is_story && storyTag()}
                      {levelBadge(m.level)}
                    </div>
                  </div>

                  {m.description && (
                    <p className="text-xs text-muted-foreground mb-3 line-clamp-2">
                      {m.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {factionObj && (
                      <FactionBadge
                        name={factionObj.name}
                        color_hex={factionObj.color_hex}
                        icon_url={factionObj.icon_url}
                        faction_id={factionObj.faction_id}
                        size="sm"
                      />
                    )}
                    {!factionObj && m.faction && (
                      <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                        {m.faction}
                      </span>
                    )}
                    {opposingObj && (
                      <>
                        <span className="text-[10px] text-muted-foreground">vs</span>
                        <FactionBadge
                          name={opposingObj.name}
                          color_hex={opposingObj.color_hex}
                          icon_url={opposingObj.icon_url}
                          faction_id={opposingObj.faction_id}
                          size="sm"
                        />
                      </>
                    )}
                    {m.type && mtypeColor && (
                      <span
                        className="text-xs uppercase tracking-wide font-semibold"
                        style={{ color: mtypeColor }}
                      >
                        {m.type}
                      </span>
                    )}
                    {relativeTime && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {relativeTime}
                      </span>
                    )}
                    {m.is_active && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--accent-light)",
                          boxShadow: "0 0 6px var(--accent-glow)",
                        }}
                      />
                    )}
                  </div>

                  {/* Reward */}
                  {(m.rewardtext || m.reward_credits != null) && (
                    <div
                      className="mb-3 text-xs flex items-center gap-1.5"
                      style={{
                        borderLeft: "3px solid var(--gold)",
                        paddingLeft: 10,
                        paddingTop: 6,
                        paddingBottom: 6,
                        background: "rgba(250,204,21,0.04)",
                      }}
                    >
                      <span className="font-mono font-bold tabular-nums" style={{color: "var(--gold)"}}>
                        <span style={{color: "var(--gold-dim)", marginRight: 2}}>{"\u2B21"}</span>
                        {m.reward_credits != null
                          ? `${m.reward_credits.toLocaleString()} Cr`
                          : m.rewardtext}
                      </span>
                      {m.reward_credits != null && m.rewardtext && (
                        <span className="text-muted-foreground">· {m.rewardtext}</span>
                      )}
                    </div>
                  )}

                  {/* Objectives */}
                  {m.objectives.length > 0 && (() => {
                    const sorted = [...m.objectives].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
                    const activeStep = sorted.find(o => o.is_active)?.step ?? 0;
                    return (
                    <div className="border-t border-border pt-3 space-y-1.5">
                      {sorted.map((obj, i) => {
                        const step = obj.step ?? 0;
                        const isActive = obj.is_active;
                        const isUpcoming = step > activeStep && activeStep > 0;
                        const hasProgress = obj.progress_current != null && obj.progress_max != null;
                        const itemLabel = fmtItemRef(obj.encyclopedia_item);
                        return (
                          <div
                            key={`${m.mission_id}-obj-${i}`}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: isActive
                                  ? "var(--accent-light)"
                                  : isUpcoming
                                  ? "var(--text-ghost)"
                                  : "var(--text-muted)",
                                flexShrink: 0,
                                boxShadow: isActive ? "0 0 6px var(--accent-glow)" : undefined,
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <span
                                className={
                                  isActive
                                    ? "text-foreground"
                                    : isUpcoming
                                    ? "text-muted-foreground/50"
                                    : "text-muted-foreground line-through"
                                }
                              >
                                {obj.type && (
                                  <span className="text-muted-foreground mr-1 font-semibold">
                                    {objTypeLabel(obj.type)}:
                                  </span>
                                )}
                                {obj.text ?? `Step ${obj.step}`}
                              </span>
                              {hasProgress && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  <StatBar
                                    value={obj.progress_current!}
                                    max={obj.progress_max!}
                                    height={4}
                                    className="w-12"
                                  />
                                  <span className="text-[10px] text-muted-foreground tabular-nums">
                                    {obj.progress_current}/{obj.progress_max}
                                  </span>
                                </span>
                              )}
                              {itemLabel && (
                                <span className="ml-2 text-[10px] text-muted-foreground/60">
                                  {itemLabel}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}
                </div>
              </HUDCard>
              );
            })}
          </div>

          {/* Mission offers board */}
          <div className="space-y-4">
            {repeatableOffers.length > 0 && (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Swords className="w-4 h-4" />
                  Guild & War Missions ({repeatableOffers.length})
                </h2>

                {repeatableOffers.map((o) => {
                  const factionObj = o.faction ? factionMap.get(o.faction) : undefined;
                  const otypeColor = o.type ? typeColor(o.type) : undefined;
                  return (
                  <HUDCard
                    key={o.offer_id}
                    className="rounded-lg overflow-hidden opacity-80 hover:opacity-100 transition-opacity"
                    accents={false}
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {typeIcon(o.type)}
                          <h3 className="font-medium text-sm truncate">{o.name}</h3>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {levelBadge(o.level)}
                          {repeatableTag()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        {factionObj && (
                          <FactionBadge
                            name={factionObj.name}
                            color_hex={factionObj.color_hex}
                            icon_url={factionObj.icon_url}
                            faction_id={factionObj.faction_id}
                            size="sm"
                          />
                        )}
                        {!factionObj && o.faction && (
                          <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                            {o.faction}
                          </span>
                        )}
                        {o.type && otypeColor && (
                          <span
                            className="text-xs uppercase tracking-wide font-semibold"
                            style={{ color: otypeColor }}
                          >
                            {o.type}
                          </span>
                        )}
                        {o.station_id && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                            <MapPin className="w-3 h-3" />
                            {o.station_id}
                          </span>
                        )}
                        {o.bbs_station_id && (
                          <span className="text-xs text-muted-foreground/60 flex items-center gap-1 font-mono">
                            <MapPin className="w-3 h-3 opacity-50" />
                            {o.bbs_station_id}
                          </span>
                        )}
                      </div>
                      {o.rewardtext && (
                        <div
                          className="text-xs flex items-center gap-1.5"
                          style={{
                            borderLeft: "3px solid var(--gold)",
                            paddingLeft: 10,
                            paddingTop: 4,
                            paddingBottom: 4,
                            background: "rgba(250,204,21,0.04)",
                          }}
                        >
                          <span className="font-mono font-bold" style={{color: "var(--gold)"}}>
                            <span style={{color: "var(--gold-dim)", marginRight: 2}}>{"\u2B21"}</span>
                            {o.rewardtext}
                          </span>
                        </div>
                      )}
                    </div>
                  </HUDCard>
                  );
                })}
              </>
            )}

            {oneShotOffers.length > 0 && (
              <>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mt-6">
                  <MapPin className="w-4 h-4" />
                  Available Offers ({oneShotOffers.length})
                </h2>

                {oneShotOffers.slice(0, 10).map((o) => {
                  const factionObj = o.faction ? factionMap.get(o.faction) : undefined;
                  const otypeColor = o.type ? typeColor(o.type) : undefined;
                  return (
                  <HUDCard
                    key={o.offer_id}
                    className="rounded-lg overflow-hidden opacity-70 hover:opacity-100 transition-opacity"
                    accents={false}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {typeIcon(o.type)}
                          <div>
                            <h3 className="font-medium text-sm truncate">{o.name}</h3>
                            {o.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {o.description}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {levelBadge(o.level)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {factionObj && (
                          <FactionBadge
                            name={factionObj.name}
                            color_hex={factionObj.color_hex}
                            icon_url={factionObj.icon_url}
                            faction_id={factionObj.faction_id}
                            size="sm"
                          />
                        )}
                        {!factionObj && o.faction && (
                          <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
                            {o.faction}
                          </span>
                        )}
                        {o.type && otypeColor && (
                          <span
                            className="text-xs uppercase tracking-wide font-semibold"
                            style={{ color: otypeColor }}
                          >
                            {o.type}
                          </span>
                        )}
                        {o.station_id && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                            <MapPin className="w-3 h-3" />
                            {o.station_id}
                          </span>
                        )}
                        {o.bbs_station_id && (
                          <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                            <MapPin className="w-3 h-3 opacity-50" />
                            BBS: {o.bbs_station_id}
                          </span>
                        )}
                      </div>
                      {o.rewardtext && (
                        <div
                          className="text-xs flex items-center gap-1.5 mt-2"
                          style={{
                            borderLeft: "3px solid var(--gold)",
                            paddingLeft: 10,
                            paddingTop: 4,
                            paddingBottom: 4,
                            background: "rgba(250,204,21,0.04)",
                          }}
                        >
                          <span className="font-mono font-bold" style={{color: "var(--gold)"}}>
                            <span style={{color: "var(--gold-dim)", marginRight: 2}}>{"\u2B21"}</span>
                            {o.rewardtext}
                          </span>
                        </div>
                      )}
                    </div>
                  </HUDCard>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
