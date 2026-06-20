import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  Target,
  MapPin,
  Building2,
  ScrollText,
  Swords,
  RefreshCw,
  Clock,
  User,
  ChevronDown,
} from "lucide-react";
import { HUDCard } from "../components/HUDCard";
import { Switch } from "../components/ui/switch";
import { MultiSelect } from "../components/ui/multi-select";
import { FactionCombobox } from "../components/FactionCombobox";
import { FactionBadge } from "../components/FactionBadge";
import { StatBar } from "../components/StatBar";
import { PageLoaderPreset } from "../components/PageLoader";
import { MissionMapModal } from "../components/MissionMapModal";
import type { MapObjective } from "../components/MissionMapModal";
import type { FactionSummary } from "../lib/map/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type MissionObjective = {
  step: number | null;
  type: string | null;
  text: string | null;
  is_active: boolean;
  target_id: string | null;
  target_name: string | null;
  target_sector_id: string | null;
  target_zone_id: string | null;
  target_x: number | null;
  target_y: number | null;
  target_z: number | null;
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
  associated_entity_name: string | null;
  associated_entity_kind: string | null;
  associated_entity_sector_id: string | null;
  associated_entity_zone_id: string | null;
  associated_entity_x: number | null;
  associated_entity_y: number | null;
  associated_entity_z: number | null;
  group_id: string | null;
  group_name: string | null;
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
  actor_name: string | null;
  station_id: string | null;
  station_name: string | null;
  bbs_station_id: string | null;
  bbs_station_name: string | null;
  station_sector_id: string | null;
  station_zone_id: string | null;
  station_x: number | null;
  station_z: number | null;
  bbs_station_sector_id: string | null;
  bbs_station_zone_id: string | null;
  bbs_station_x: number | null;
  bbs_station_z: number | null;
  is_repeatable: boolean;
  rewardtext: string | null;
  reward_credits: number | null;
  opposing_faction: string | null;
  group_id: string | null;
  component_id: string | null;
  distance: number | null;
  thread_type: string | null;
};

type PlayerMeta = { in_game_time_sec: number | null };

type PlayerStat = { stat_id: string; value: number; display: string };

// ── Difficulty constants ──────────────────────────────────────────────────────

const DIFFICULTY_KEYS = [
  "trivial",
  "veryeasy",
  "easy",
  "medium",
  "hard",
  "veryhard",
] as const;
type Difficulty = (typeof DIFFICULTY_KEYS)[number];

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  trivial: "Trivial",
  veryeasy: "Very Easy",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  veryhard: "Very Hard",
};

const LEVEL_COLORS: Record<Difficulty, string> = {
  trivial: "#22d3ee",
  veryeasy: "#4ade80",
  easy: "#a3e635",
  medium: "#facc15",
  hard: "#f97316",
  veryhard: "#ef4444",
};

function levelLabel(level: string | null): string | null {
  if (!level) return null;
  return DIFFICULTY_LABEL[level as Difficulty] ?? level;
}

// ── Mission type colours ──────────────────────────────────────────────────────

type MissionType = string;

const TYPE_COLORS: Record<MissionType, string> = {
  plot: "#eab308",
  build: "#f59e0b",
  destroy: "#ef4444",
  fight: "#f97316",
  kill: "#dc2626",
  board: "#e879f9",
  protect: "#3b82f6",
  escort: "#60a5fa",
  deliver: "#22c55e",
  transport: "#2dd4bf",
  drop: "#14b8a6",
  hack: "#c084fc",
  intelligence: "#a855f7",
  find: "#fbbf24",
  rescue: "#64748b",
  upkeep_hirenpc: "#94a3b8",
  tutorial: "#6b7280",
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
  await: "Await",
  build_module: "Build Module",
  claim: "Claim",
  custom: "Objective",
  deliver: "Deliver",
  dockat: "Dock At",
  flyto: "Fly To",
  investigate: "Investigate",
  kill: "Kill",
  talkto: "Talk To",
  unlock: "Unlock",
};

function objTypeLabel(t: string | null): string {
  if (!t) return "";
  return (
    OBJ_TYPE_LABEL[t] ??
    t.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase())
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(
  missionTime: string | null | undefined,
  nowSec: number | null,
): string | null {
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

function fmtItemRef(
  encyclopediaItem: string | null | undefined,
): string | null {
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

// ── Sub-components ────────────────────────────────────────────────────────────

function MissionCard({
  m,
  factionMap,
  nowSec,
  isGrouped,
  onShowOnMap,
}: {
  m: Mission;
  factionMap: Map<string, FactionSummary>;
  nowSec: number | null;
  isGrouped?: boolean;
  onShowOnMap?: (sectorId: string | null, objectives: MapObjective[]) => void;
}) {
  const factionObj = m.faction ? factionMap.get(m.faction) : undefined;
  const opposingObj = m.opposing_faction ? factionMap.get(m.opposing_faction) : undefined;
  const mtypeColor = m.type ? typeColor(m.type) : undefined;
  const relativeTime = fmtTime(m.time, nowSec);
  return (
    <HUDCard
      className={`overflow-hidden ${isGrouped ? "" : "rounded-lg"}`}
      accents={false}
    >
      <div className="p-4 select-none">
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
            {m.group_name && (
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
                {m.group_name}
              </span>
            )}
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
            <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: mtypeColor }}>
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
          {(() => {
            // Gather coordinates from associated entity + objective targets.
            // Deduplicate by label AND by coordinates so 10 objectives at the
            // same location don't read as "10 locations".
            const points: MapObjective[] = [];
            const seenLabels = new Set<string>();
            const seenCoords = new Set<string>();
            const pushPoint = (p: MapObjective) => {
              // Deduplicate by label AND by coordinates independently — two
              // points are the same location if they share a label OR the
              // same (zoneId, x, z) position.
              if (p.label && seenLabels.has(p.label.toLowerCase())) return;
              if (p.x != null) {
                const ck = `${p.zoneId ?? ""}|${p.x.toFixed(0)}|${p.z != null ? p.z.toFixed(0) : ""}`;
                if (seenCoords.has(ck)) return;
                seenCoords.add(ck);
              }
              if (p.label) seenLabels.add(p.label.toLowerCase());
              points.push(p);
            };
            let bestSector: string | null = m.associated_entity_sector_id ?? null;
            if (m.associated_entity_name) {
              if (m.associated_entity_x != null) {
                pushPoint({ label: m.associated_entity_name, x: m.associated_entity_x, z: m.associated_entity_z, zoneId: m.associated_entity_zone_id });
              }
              if (!bestSector) bestSector = m.associated_entity_sector_id ?? null;
            }
            for (const obj of m.objectives) {
              const label = obj.target_name || obj.text;
              if (!label && obj.target_x == null) continue;
              pushPoint({ label: label ?? `Step ${obj.step}`, x: obj.target_x, z: obj.target_z, zoneId: obj.target_zone_id });
              if (!bestSector && obj.target_sector_id) bestSector = obj.target_sector_id;
            }
            const hasCoords = points.some(p => p.x != null);
            const hasName = !!m.associated_entity_name;

            if (onShowOnMap && (hasCoords || bestSector)) {
              return (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onShowOnMap(bestSector, points); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                  title="Show on map"
                >
                  <MapPin className="w-3 h-3" />
                  {hasName ? m.associated_entity_name : `${points.length} location${points.length !== 1 ? "s" : ""}`}
                </button>
              );
            }
            if (hasName) {
              return (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {m.associated_entity_name}
                </span>
              );
            }
            return null;
          })()}
        </div>

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
            <span className="font-mono font-bold tabular-nums" style={{ color: "var(--gold)" }}>
              <span style={{ color: "var(--gold-dim)", marginRight: 2 }}>{"\u2B21"}</span>
              {m.reward_credits != null
                ? `${m.reward_credits.toLocaleString()} Cr`
                : m.rewardtext}
            </span>
            {m.reward_credits != null && m.rewardtext && (
              <span className="text-muted-foreground">· {m.rewardtext}</span>
            )}
          </div>
        )}

        {m.objectives.length > 0 &&
          (() => {
            const parsedObjectives = m.objectives.map(obj => {
              let text = obj.text;
              let target_name = obj.target_name;
              let progress_current = obj.progress_current;
              let progress_max = obj.progress_max;

              const parseProgress = (s: string | null) => {
                if (!s) return null;
                const match = s.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);
                if (match) {
                  return {
                    current: parseInt(match[1], 10),
                    max: parseInt(match[2], 10),
                    cleanText: s.replace(match[0], '').trim()
                  };
                }
                return null;
              };

              if (progress_current == null || progress_max == null) {
                let p = parseProgress(text);
                if (p) {
                  progress_current = p.current;
                  progress_max = p.max;
                  text = p.cleanText;
                } else {
                  p = parseProgress(target_name);
                  if (p) {
                    progress_current = p.current;
                    progress_max = p.max;
                    target_name = p.cleanText;
                  }
                }
              }
              return { ...obj, text, target_name, progress_current, progress_max };
            });

            const maxExplicitStep = Math.max(0, ...parsedObjectives.map(o => o.step ?? 0));
            parsedObjectives.forEach(o => {
              // Objectives from <mission> often omit the step attribute, defaulting to 0.
              // Push them after the explicit history steps from <briefing> so they sort correctly.
              if (o.step == null || o.step === 0) {
                o.step = maxExplicitStep > 0 ? maxExplicitStep + 1 : 1;
              }
            });

            const sorted = [...parsedObjectives].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
            
            // X4 flags one objective as active, but concurrent objectives share the same step.
            // If the game engine omits the flag, fallback to the latest step block.
            const activeStep = sorted.find(o => o.is_active)?.step || Math.max(0, ...sorted.map(o => o.step ?? 0));

            const isComplete = (o: MissionObjective) => {
              if (activeStep > 0 && o.step != null && o.step < activeStep) return true;
              return o.progress_current != null &&
                     o.progress_max != null &&
                     o.progress_max > 0 &&
                     o.progress_current >= o.progress_max;
            };

            const effectiveActive = (o: MissionObjective) =>
              o.is_active ||
              (!isComplete(o) && o.step === activeStep);

            // Deduplicate past steps that are just old versions of a current step (e.g. Data Vault 1/30, 2/30...)
            const normalizeText = (t: string | null) => {
              if (!t) return "";
              return t.replace(/\(?\s*\d+\s*\/\s*\d+\s*\)?/g, "").replace(/\s+/g, " ").trim().toLowerCase();
            };
            const signatures = new Map<string, number>();
            sorted.forEach((o, i) => {
              const sig = `${o.type}|${normalizeText(o.text)}|${normalizeText(o.target_name)}|${o.target_id || ''}`;
              signatures.set(sig, i);
            });
            const deduplicated = sorted.filter((o, i) => {
              const sig = `${o.type}|${normalizeText(o.text)}|${normalizeText(o.target_name)}|${o.target_id || ''}`;
              return signatures.get(sig) === i;
            });

            return (
              <div className="border-t border-border pt-3 space-y-1.5">
                {deduplicated.map((obj, i) => {
                  const step = obj.step ?? 0;
                  const complete = isComplete(obj);
                  const isActive = !complete && effectiveActive(obj);
                  const isUpcoming = !complete && !isActive && step > activeStep && activeStep > 0;
                  const hasProgress = obj.progress_current != null && obj.progress_max != null;
                  
                  return (
                    <div key={`${m.mission_id}-obj-${i}`} className="flex items-center gap-2 text-xs">
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: isActive ? "var(--accent-light)" : isUpcoming ? "var(--text-ghost)" : "var(--text-muted)",
                          flexShrink: 0,
                          boxShadow: isActive ? "0 0 6px var(--accent-glow)" : undefined,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <span
                          className={
                            isActive ? "text-foreground" : isUpcoming ? "text-muted-foreground/50" : "text-muted-foreground line-through"
                          }
                        >
                          {obj.type && (
                            <span className="text-muted-foreground mr-1 font-semibold">
                              {objTypeLabel(obj.type)}:
                            </span>
                          )}
                          {obj.text ?? `Step ${obj.step}`}
                        </span>
                        {obj.target_name && (
                          onShowOnMap && (obj.target_sector_id || obj.target_x != null) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onShowOnMap(obj.target_sector_id, [{
                                  label: obj.target_name!,
                                  x: obj.target_x,
                                  z: obj.target_z,
                                  zoneId: obj.target_zone_id,
                                }]);
                              }}
                              className="ml-1.5 text-[10px] text-muted-foreground/70 hover:text-foreground flex items-center gap-0.5 transition-colors cursor-pointer"
                              title="Show on map"
                            >
                              <MapPin className="w-2.5 h-2.5" />
                              {obj.target_name}
                            </button>
                          ) : (
                            <span className="ml-1.5 text-[10px] text-muted-foreground/70 flex items-center gap-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {obj.target_name}
                            </span>
                          )
                        )}
                        {hasProgress && (
                          <span className="ml-2 inline-flex items-center gap-1">
                            <StatBar value={obj.progress_current!} max={obj.progress_max!} height={4} className="w-12" />
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {obj.progress_current}/{obj.progress_max}
                            </span>
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
}

// ── Offer card (reusable for repeatable + one-shot) ──────────────────────────

function OfferCard({
  o,
  factionMap,
  compact,
  onShowOnMap,
}: {
  o: MissionOffer;
  factionMap: Map<string, FactionSummary>;
  compact?: boolean;
  onShowOnMap?: (sectorId: string | null, objectives: MapObjective[]) => void;
}) {
  const factionObj = o.faction ? factionMap.get(o.faction) : undefined;
  const oppObj = o.opposing_faction ? factionMap.get(o.opposing_faction) : undefined;
  const otypeColor = o.type ? typeColor(o.type) : undefined;
  const p = compact ? "p-3" : "p-4";
  return (
    <HUDCard
      className={`overflow-hidden opacity-80 hover:opacity-100 transition-opacity select-none ${compact ? "rounded-lg" : "rounded-lg"}`}
      accents={false}
    >
      <div className={p}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {typeIcon(o.type)}
            <div>
              <h3 className="font-medium text-sm truncate">{o.name}</h3>
              {compact && o.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{o.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {o.reward_credits != null && (
              <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--gold)" }}>
                <span style={{ color: "var(--gold-dim)", marginRight: 1 }}>{"\u2B21"}</span>
                {o.reward_credits.toLocaleString()} Cr
              </span>
            )}
            {levelBadge(o.level)}
            {o.is_repeatable && repeatableTag()}
          </div>
        </div>
        <div className={`flex items-center gap-2 flex-wrap ${compact ? "" : "mb-2"}`}>
          {factionObj && (
            <FactionBadge name={factionObj.name} color_hex={factionObj.color_hex} icon_url={factionObj.icon_url} faction_id={factionObj.faction_id} size="sm" />
          )}
          {!factionObj && o.faction && (
            <span className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">{o.faction}</span>
          )}
          {oppObj && (
            <>
              <span className="text-[10px] text-muted-foreground">vs</span>
              <FactionBadge name={oppObj.name} color_hex={oppObj.color_hex} icon_url={oppObj.icon_url} faction_id={oppObj.faction_id} size="sm" />
            </>
          )}
          {o.type && otypeColor && (
            <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: otypeColor }}>{o.type}</span>
          )}
          {o.reward_credits != null && !compact && (
            <span className="text-[10px] font-mono tabular-nums" style={{ color: "var(--gold)" }}>
              <span style={{ color: "var(--gold-dim)", marginRight: 1 }}>{"\u2B21"}</span>
              {o.reward_credits.toLocaleString()} Cr
            </span>
          )}
          {o.station_name &&
            (onShowOnMap && o.station_sector_id ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOnMap(o.station_sector_id!, [
                    {
                      label: o.station_name!,
                      x: o.station_x ?? null,
                      z: o.station_z ?? null,
                      zoneId: o.station_zone_id ?? null,
                    },
                  ]);
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                title="Show on map"
              >
                <MapPin className="w-3 h-3" />
                {o.station_name}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {o.station_name}
              </span>
            ))}
          {o.bbs_station_name &&
            (onShowOnMap && o.bbs_station_sector_id ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShowOnMap(o.bbs_station_sector_id!, [
                    {
                      label: `BBS: ${o.bbs_station_name}`,
                      x: o.bbs_station_x ?? null,
                      z: o.bbs_station_z ?? null,
                      zoneId: o.bbs_station_zone_id ?? null,
                    },
                  ]);
                }}
                className="text-xs text-muted-foreground/60 hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                title="Show on map"
              >
                <MapPin className="w-3 h-3 opacity-50" />
                BBS: {o.bbs_station_name}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                <MapPin className="w-3 h-3 opacity-50" />
                BBS: {o.bbs_station_name}
              </span>
            ))}
          {o.actor_name && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <User className="w-3 h-3" />
              {o.actor_name}
            </span>
          )}
        </div>
        {o.rewardtext && (
          <div className={`text-xs flex items-center gap-1.5 ${compact ? "mt-2" : ""}`}
            style={{ borderLeft: "3px solid var(--gold)", paddingLeft: 10, paddingTop: 4, paddingBottom: 4, background: "rgba(250,204,21,0.04)" }}>
            <span className="font-mono font-bold" style={{ color: "var(--gold)" }}>
              <span style={{ color: "var(--gold-dim)", marginRight: 2 }}>{"\u2B21"}</span>
              {o.rewardtext}
            </span>
          </div>
        )}
      </div>
    </HUDCard>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  const [difficultyFilter, setDifficultyFilter] = useState<Set<Difficulty>>(
    new Set(),
  );
  const [typeFilter, setTypeFilter] = useState<Set<MissionType>>(new Set());
  const [factionFilter, setFactionFilter] = useState<string>("all");
  const [storyOnly, setStoryOnly] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [mapModal, setMapModal] = useState<{
    sectorId: string | null;
    objectives: MapObjective[];
  } | null>(null);

  const { data: missions, isLoading: missionsLoading } = useQuery<Mission[]>({
    queryKey: ["missions"],
    queryFn: () => fetch("/api/v1/missions").then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: offers, isLoading: offersLoading } = useQuery<MissionOffer[]>({
    queryKey: ["mission-offers"],
    queryFn: () =>
      fetch("/api/v1/missions/offers?exclude_tutorials=true").then((r) =>
        r.json(),
      ),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<PlayerStat[]>({
    queryKey: ["player-stats"],
    queryFn: () => fetch("/api/v1/player/stats").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: playerMeta } = useQuery<PlayerMeta>({
    queryKey: ["player-meta"],
    queryFn: () =>
      fetch("/api/v1/player").then((r) =>
        r.ok ? r.json() : { in_game_time_sec: null },
      ),
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

  const filterMission = (m: Mission) => {
    if (
      difficultyFilter.size > 0 &&
      !difficultyFilter.has(m.level as Difficulty)
    )
      return false;
    if (typeFilter.size > 0 && m.type && !typeFilter.has(m.type)) return false;
    if (factionFilter !== "all" && m.faction !== factionFilter) return false;
    if (storyOnly && !m.is_story) return false;
    return true;
  };

  const filterOffer = (o: MissionOffer) => {
    if (storyOnly) return false;
    if (
      difficultyFilter.size > 0 &&
      !difficultyFilter.has(o.level as Difficulty)
    )
      return false;
    if (typeFilter.size > 0 && o.type && !typeFilter.has(o.type)) return false;
    if (factionFilter !== "all" && o.faction !== factionFilter) return false;
    return true;
  };

  const activeMissions = (missions ?? []).filter(
    (m) => m.is_active && filterMission(m),
  );
  const inactiveMissions = (missions ?? []).filter(
    (m) => !m.is_active && filterMission(m),
  );

  // Group missions by story group so alternate-path missions appear side-by-side
  // inside a shared container with a group header.
  type RenderItem =
    | { kind: "card"; mission: Mission }
    | { kind: "group"; groupId: string; groupName: string | null; missions: Mission[] };
  const activeRenderItems = useMemo((): RenderItem[] => {
    const all = [...activeMissions, ...inactiveMissions];
    const groupSize = new Map<string, number>();
    for (const m of all) {
      if (m.group_id) groupSize.set(m.group_id, (groupSize.get(m.group_id) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const items: RenderItem[] = [];
    for (const m of all) {
      if (seen.has(m.mission_id!)) continue;
      if (m.group_id && (groupSize.get(m.group_id) ?? 0) > 1) {
        // Collect all siblings for this group.
        const siblings = all.filter(
          (s) => s.group_id === m.group_id && !seen.has(s.mission_id!),
        );
        siblings.forEach((s) => seen.add(s.mission_id!));
        items.push({
          kind: "group",
          groupId: m.group_id,
          groupName: siblings[0]?.group_name ?? null,
          missions: siblings,
        });
      } else {
        seen.add(m.mission_id!);
        items.push({ kind: "card", mission: m });
      }
    }
    return items;
  }, [activeMissions, inactiveMissions]);

  if (missionsLoading || offersLoading) {
    return <PageLoaderPreset preset="missions" />;
  }

  const accepted =
    stats?.find((s) => s.stat_id === "missions_accepted")?.value ?? 0;
  const completed =
    stats?.find((s) => s.stat_id === "missions_completed")?.value ?? 0;

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

  const repeatableOffers = (offers ?? []).filter(
    (o) => o.is_repeatable && filterOffer(o),
  );
  const oneShotOffers = (offers ?? []).filter(
    (o) => !o.is_repeatable && filterOffer(o),
  );

  const hasFilters =
    difficultyFilter.size > 0 ||
    typeFilter.size > 0 ||
    factionFilter !== "all" ||
    storyOnly;

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

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect
            options={DIFFICULTY_KEYS.map((d) => ({
              label: DIFFICULTY_LABEL[d],
              value: d,
              node: (
                <span style={{ color: LEVEL_COLORS[d], fontWeight: 500 }}>
                  {DIFFICULTY_LABEL[d]}
                </span>
              ),
            }))}
            selected={difficultyFilter}
            onChange={(selected: Set<string>) =>
              setDifficultyFilter(selected as Set<Difficulty>)
            }
            placeholder="Difficulty"
            className="w-[160px]"
          />

          {availableTypes.length > 0 && (
            <MultiSelect
              options={availableTypes.map((t) => ({
                label: typeLabel(t),
                value: t,
                node: (
                  <span style={{ color: typeColor(t), fontWeight: 500 }}>
                    {typeLabel(t)}
                  </span>
                ),
              }))}
              selected={typeFilter}
              onChange={setTypeFilter}
              placeholder="Mission Type"
              className="w-[180px]"
            />
          )}

          {factionSummaries.length > 1 && (
            <FactionCombobox
              factions={factionSummaries}
              value={factionFilter}
              onChange={setFactionFilter}
              className="w-[180px]"
            />
          )}

          <div className="flex items-center gap-2 px-2">
            <Switch
              id="story-only"
              checked={storyOnly}
              onCheckedChange={setStoryOnly}
            />
            <label
              htmlFor="story-only"
              className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
            >
              Story Only
            </label>
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setDifficultyFilter(new Set());
                setTypeFilter(new Set());
                setFactionFilter("all");
                setStoryOnly(false);
              }}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[100rem]">
          {/* Active missions */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              Active Missions ({activeMissions.length + inactiveMissions.length}
              )
            </h2>

            {activeMissions.length === 0 && inactiveMissions.length === 0 && (
              <p className="text-sm text-muted-foreground py-8">
                No missions match the current filters.
              </p>
            )}

            {activeRenderItems.map((item) => {
              if (item.kind === "group") {
                return (
                  <div
                    key={item.groupId}
                    className="border border-[var(--gold-dim)]/20 rounded-lg overflow-hidden"
                  >
                    <button
                      className="px-3 py-1.5 flex items-center gap-2 w-full text-left cursor-pointer hover:brightness-125 transition-all"
                      style={{
                        background: "rgba(250,204,21,0.05)",
                        borderBottom: collapsedGroups.has(item.groupId) ? "none" : "1px solid rgba(250,204,21,0.10)",
                      }}
                      onClick={() => {
                        setCollapsedGroups((prev) => {
                          const next = new Set(prev);
                          if (next.has(item.groupId)) next.delete(item.groupId);
                          else next.add(item.groupId);
                          return next;
                        });
                      }}
                    >
                      <ChevronDown
                        className="w-3 h-3 transition-transform duration-150"
                        style={{
                          color: "var(--gold-dim)",
                          transform: collapsedGroups.has(item.groupId) ? "rotate(-90deg)" : "rotate(0deg)",
                        }}
                      />
                      <span className="text-[9px] uppercase tracking-[1px] font-bold" style={{ color: "var(--gold)" }}>
                        {item.groupName ?? item.groupId}
                      </span>
                      <span className="text-[8px]" style={{ color: "var(--gold-dim)" }}>
                        — alternate paths
                      </span>
                    </button>
                    {!collapsedGroups.has(item.groupId) &&
                      item.missions.map((m) => (
                        <MissionCard
                          key={m.mission_id}
                          m={m}
                          factionMap={factionMap}
                          nowSec={nowSec}
                          isGrouped
                          onShowOnMap={(sectorId, objectives) =>
                            setMapModal({ sectorId, objectives })
                          }
                        />
                      ))}
                  </div>
                );
              }
              return (
                <MissionCard
                  key={item.mission.mission_id}
                  m={item.mission}
                  factionMap={factionMap}
                  nowSec={nowSec}
                  onShowOnMap={(sectorId, objectives) =>
                    setMapModal({ sectorId, objectives })
                  }
                />
              );
            })}
          </div>

          {/* Mission offers board */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Swords className="w-4 h-4" />
              Guild & War Missions ({repeatableOffers.length})
            </h2>

            {repeatableOffers.length === 0 && (
              <p className="text-sm text-muted-foreground py-8">
                No guild or war missions available.
              </p>
            )}

            {(() => {
              // Group repeatable offers by group_id
              const groupSize = new Map<string, number>();
              for (const o of repeatableOffers) {
                if (o.group_id) groupSize.set(o.group_id, (groupSize.get(o.group_id) ?? 0) + 1);
              }
              const seen = new Set<string>();
              const items: Array<{ kind: "card"; offer: MissionOffer } | { kind: "group"; groupId: string; offers: MissionOffer[] }> = [];
              for (const o of repeatableOffers) {
                if (seen.has(o.offer_id!)) continue;
                if (o.group_id && (groupSize.get(o.group_id) ?? 0) > 1) {
                  const siblings = repeatableOffers.filter(s => s.group_id === o.group_id && !seen.has(s.offer_id!));
                  siblings.forEach(s => seen.add(s.offer_id!));
                  items.push({ kind: "group", groupId: o.group_id, offers: siblings });
                } else {
                  seen.add(o.offer_id!);
                  items.push({ kind: "card", offer: o });
                }
              }
              return items.map((item) => {
                if (item.kind === "group") {
                  // Resolve group name — reuse factionMap vs. lookup
                  const groupFactionObj = item.offers[0]?.faction ? factionMap.get(item.offers[0].faction) : undefined;
                  const groupLabel = groupFactionObj?.name
                    ? `${groupFactionObj.name} Missions`
                    : item.groupId.replace(/_/g, " ");
                  return (
                    <div key={item.groupId} className="border border-border/30 rounded-lg overflow-hidden">
                      <button
                        className="px-3 py-1.5 flex items-center gap-2 w-full text-left cursor-pointer hover:brightness-125 transition-all"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          borderBottom: collapsedGroups.has(item.groupId) ? "none" : "1px solid rgba(255,255,255,0.06)",
                        }}
                        onClick={() => {
                          setCollapsedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.groupId)) next.delete(item.groupId);
                            else next.add(item.groupId);
                            return next;
                          });
                        }}
                      >
                        <ChevronDown
                          className="w-3 h-3 transition-transform duration-150 text-muted-foreground"
                          style={{ transform: collapsedGroups.has(item.groupId) ? "rotate(-90deg)" : "rotate(0deg)" }}
                        />
                        <Swords className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[9px] uppercase tracking-[1px] font-bold text-muted-foreground">{groupLabel}</span>
                        <span className="text-[8px] text-muted-foreground/50">— {item.offers.length} missions</span>
                      </button>
                      {!collapsedGroups.has(item.groupId) &&
                        item.offers.map((o) => <OfferCard key={o.offer_id} o={o} factionMap={factionMap} onShowOnMap={(sectorId, objectives) => setMapModal({ sectorId, objectives })} />)}
                    </div>
                  );
                }
                return <OfferCard key={item.offer.offer_id} o={item.offer} factionMap={factionMap} onShowOnMap={(sectorId, objectives) => setMapModal({ sectorId, objectives })} />;
              });
            })()}
          </div>

          {/* Available Offers board */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Available Offers ({oneShotOffers.length})
            </h2>

            {oneShotOffers.length === 0 && (
              <p className="text-sm text-muted-foreground py-8">
                No available offers.
              </p>
            )}

            {oneShotOffers.slice(0, 10).map((o) => (
              <OfferCard key={o.offer_id} o={o} factionMap={factionMap} compact onShowOnMap={(sectorId, objectives) => setMapModal({ sectorId, objectives })} />
            ))}
          </div>
        </div>
      </div>

      <MissionMapModal
        open={!!mapModal}
        onClose={() => setMapModal(null)}
        sectorId={mapModal?.sectorId ?? ""}
        objectives={mapModal?.objectives ?? []}
      />
    </div>
  );
}
