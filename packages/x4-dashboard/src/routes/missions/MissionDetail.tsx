import { useMemo, useState } from "react";
import {
  MapPin,
  Target,
} from "lucide-react";
import { FactionBadge } from "../../components/FactionBadge";
import { StatBar } from "../../components/StatBar";
import type { FactionSummary } from "../../lib/map/types";
import type { MapObjective } from "../../components/MissionMapModal";
import type { Mission, MissionObjective } from "./types";
import {
  typeColor,
  typeLabel,
  LevelBadge,
  StoryTag,
} from "./helpers";
import { EmbeddedMap } from "./EmbeddedMap";

type Props = {
  m: Mission;
  factionMap: Map<string, FactionSummary>;
  onShowOnMap: (sectorId: string | null, objectives: MapObjective[]) => void;
};

// ── Objective helpers ─────────────────────────────────────────────────────────

type ProcessedObjective = {
  step: number;
  text: string | null;
  target_name: string | null;
  target_sector_id: string | null;
  status: "done" | "current" | "next";
  progress_current: number | null;
  progress_max: number | null;
  type: string | null;
};

function processObjectives(objectives: MissionObjective[]): {
  steps: ProcessedObjective[];
  activeStep: number;
} {
  const parsed = objectives.map((obj) => {
    let text = obj.text;
    let progress_current = obj.progress_current;
    let progress_max = obj.progress_max;

    // Try to parse progress from text fields
    if (progress_current == null || progress_max == null) {
      const p = parseProgress(text);
      if (p) {
        progress_current = p.current;
        progress_max = p.max;
        text = p.cleanText;
      }
    }

    return { ...obj, text, progress_current, progress_max };
  });

  // Normalize step numbers
  const maxStep = Math.max(0, ...parsed.map((o) => o.step ?? 0));
  parsed.forEach((o) => {
    if (o.step == null || o.step === 0) {
      o.step = maxStep > 0 ? maxStep + 1 : 1;
    }
  });

  const sorted = [...parsed].sort((a, b) => (a.step ?? 0) - (b.step ?? 0));

  // Determine active step
  const activeStep =
    sorted.find((o) => o.is_active)?.step ??
    Math.max(0, ...sorted.map((o) => o.step ?? 0));

  // Deduplicate
  const seen = new Map<string, number>();
  sorted.forEach((o, i) => {
    const sig = `${o.type}|${(o.text ?? "").toLowerCase()}|${(o.target_name ?? "").toLowerCase()}`;
    seen.set(sig, i);
  });
  const deduped = sorted.filter((o, i) => {
    const sig = `${o.type}|${(o.text ?? "").toLowerCase()}|${(o.target_name ?? "").toLowerCase()}`;
    return seen.get(sig) === i;
  });

  const steps: ProcessedObjective[] = deduped.map((o) => {
    const step = o.step ?? 0;
    const isComplete =
      (activeStep > 0 && step < activeStep) ||
      (o.progress_current != null &&
        o.progress_max != null &&
        o.progress_max > 0 &&
        o.progress_current >= o.progress_max);
    const isActive = !isComplete && o.is_active;
    const status: ProcessedObjective["status"] = isComplete
      ? "done"
      : isActive
        ? "current"
        : "next";

    return {
      step,
      text: o.text,
      target_name: o.target_name,
      target_sector_id: o.target_sector_id,
      status,
      progress_current: o.progress_current,
      progress_max: o.progress_max,
      type: o.type,
    };
  });

  return { steps, activeStep };
}

function parseProgress(s: string | null): {
  current: number;
  max: number;
  cleanText: string;
} | null {
  if (!s) return null;
  const match = s.match(/\(\s*(\d+)\s*\/\s*(\d+)\s*\)/);
  if (match) {
    return {
      current: parseInt(match[1], 10),
      max: parseInt(match[2], 10),
      cleanText: s.replace(match[0], "").trim(),
    };
  }
  return null;
}

// ── Status dot style maps ─────────────────────────────────────────────────────

const STATUS_STYLES = {
  done: {
    icon: "✓",
    dotBorder: "#34d399",
    dotBg: "rgba(52,211,153,0.16)",
    dotFg: "#34d399",
    titleColor: "#7a8499",
    rowBg: "rgba(255,255,255,0.015)",
    rowBorder: "rgba(255,255,255,0.05)",
  },
  current: {
    icon: "●",
    dotBorder: "#5cc8ec",
    dotBg: "rgba(92,200,236,0.16)",
    dotFg: "#5cc8ec",
    titleColor: "#eef2f8",
    rowBg: "rgba(92,200,236,0.05)",
    rowBorder: "rgba(92,200,236,0.18)",
  },
  next: {
    icon: "",
    dotBorder: "rgba(255,255,255,0.18)",
    dotBg: "transparent",
    dotFg: "#5a6680",
    titleColor: "#cdd5e3",
    rowBg: "rgba(255,255,255,0.015)",
    rowBorder: "rgba(255,255,255,0.05)",
  },
} as const;

// ── Bucket metadata ───────────────────────────────────────────────────────────

const BUCKET_META: Record<string, { label: string; color: string }> = {
  active: { label: "ACTIVE MISSION", color: "#34d399" },
  guild: { label: "GUILD & WAR", color: "#f5a524" },
  offer: { label: "AVAILABLE OFFER", color: "#7fb9d6" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function MissionDetail({ m, factionMap, onShowOnMap }: Props) {
  const [mapExpanded, setMapExpanded] = useState(false);

  const factionObj = m.faction ? factionMap.get(m.faction) : undefined;
  const opposingObj = m.opposing_faction ? factionMap.get(m.opposing_faction) : undefined;
  const mtypeColor = m.type ? typeColor(m.type) : undefined;
  const mtLabel = m.type ? typeLabel(m.type) : null;
  const bucket = m.is_active ? "active" : "offer";
  const bucketMeta = BUCKET_META[bucket] ?? BUCKET_META.offer;

  // Process objectives
  const { steps } = processObjectives(m.objectives);
  const currentStep = steps.find((s) => s.status === "current");
  const hasObjectives = steps.length > 0;

  // Gather map data: find target sector from objectives or associated entity
  const mapSectorId =
    currentStep?.target_sector_id ??
    m.associated_entity_sector_id ??
    null;

  // Gather map objectives for "Show on Map"
  const allMapObjectives = useMemo((): MapObjective[] => {
    const points: MapObjective[] = [];
    for (const obj of m.objectives) {
      if (obj.target_name || obj.target_x != null) {
        points.push({
          label: obj.target_name ?? obj.text ?? `Step ${obj.step}`,
          x: obj.target_x,
          z: obj.target_z,
          zoneId: obj.target_zone_id,
        });
      }
    }
    if (m.associated_entity_name && m.associated_entity_x != null) {
      points.push({
        label: m.associated_entity_name,
        x: m.associated_entity_x,
        z: m.associated_entity_z,
        zoneId: m.associated_entity_zone_id,
      });
    }
    return points;
  }, [m]);

  if (mapExpanded) {
    return (
      <EmbeddedMap
        targetSectorId={mapSectorId}
        fullscreen
        onBack={() => setMapExpanded(false)}
      />
    );
  }

  return (
    <div className="p-6 max-w-[760px] animate-in fade-in slide-in-from-right-2 duration-150">
      {/* Bucket label */}
      <div
        className="text-[10px] tracking-[2px] font-mono uppercase mb-2"
        style={{ color: bucketMeta.color }}
      >
        {bucketMeta.label}
      </div>

      {/* Title */}
      <h2 className="text-[26px] font-semibold leading-tight">{m.name}</h2>

      {/* Badges */}
      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
        {mtLabel && mtypeColor && (
          <span
            className="text-[9.5px] font-semibold uppercase tracking-[0.4px] px-2.5 py-1 rounded-md"
            style={{ background: `${mtypeColor}18`, color: mtypeColor }}
          >
            {mtLabel}
          </span>
        )}
        <LevelBadge level={m.level} />
        {m.is_story && <StoryTag />}
        {factionObj && (
          <FactionBadge
            name={factionObj.name}
            color_hex={factionObj.color_hex}
            icon_url={factionObj.icon_url}
            faction_id={factionObj.faction_id}
            size="md"
          />
        )}
        {!factionObj && m.faction && (
          <span className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
            ◈ {m.faction}
          </span>
        )}
        {opposingObj && (
          <>
            <span className="text-[11px] text-muted-foreground">vs</span>
            <span className="font-semibold" style={{ color: opposingObj.color_hex ?? "#f87171" }}>
              {opposingObj.name}
            </span>
          </>
        )}
      </div>

      {/* Giver */}
      {m.caption && (
        <div className="text-[12px] text-muted-foreground mt-2.5">
          ⌖ Offered by <span className="text-foreground/70">{m.caption}</span>
        </div>
      )}

      {/* DO THIS NEXT (active only) */}
      {bucket === "active" && currentStep && (
        <div
          className="flex items-center gap-3 mt-4 p-3.5 rounded-xl border"
          style={{
            background: "rgba(92,200,236,0.08)",
            borderColor: "rgba(92,200,236,0.22)",
          }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[15px] shrink-0"
            style={{ background: "rgba(92,200,236,0.16)", color: "#5cc8ec" }}
          >
            ➤
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-[9.5px] tracking-[1.5px] font-mono uppercase"
              style={{ color: "#7fb9d6" }}
            >
              DO THIS NEXT
            </div>
            <div className="text-sm font-semibold text-foreground mt-1">
              {currentStep.text ?? `Step ${currentStep.step}`}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-[13px] font-semibold" style={{ color: "#5cc8ec" }}>
              {currentStep.target_name ?? "—"}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {mapSectorId ? "on site" : "on site"}
            </div>
          </div>
        </div>
      )}

      {/* Reward + Briefing */}
      <div className="flex gap-3.5 mt-4">
        {/* Reward card */}
        <div
          className="w-[178px] shrink-0 p-3.5 rounded-xl border"
          style={{
            background: "rgba(240,217,138,0.06)",
            borderColor: "rgba(240,217,138,0.18)",
          }}
        >
          <div
            className="text-[9.5px] tracking-[1.5px] font-mono uppercase"
            style={{ color: "#a9966a" }}
          >
            REWARD
          </div>
          <div
            className="font-mono text-[21px] font-semibold mt-1.5 leading-tight"
            style={{ color: "#f0d98a" }}
          >
            {m.reward_credits != null
              ? m.reward_credits.toLocaleString()
              : m.rewardtext ?? "—"}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "#8a8161" }}>
            {m.reward_credits != null ? "credits" : m.rewardtext ? "reward item" : "reputation & standing"}
          </div>
        </div>

        {/* Briefing card */}
        <div
          className="flex-1 min-w-0 p-3.5 rounded-xl border"
          style={{
            background: "rgba(255,255,255,0.02)",
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <div
            className="text-[9.5px] tracking-[1.5px] font-mono uppercase"
            style={{ color: "#7a8499" }}
          >
            BRIEFING
          </div>
          <div
            className="text-[12.5px] mt-1.5 leading-relaxed"
            style={{ color: "#aab4c6" }}
          >
            {m.description || "No briefing available."}
          </div>
        </div>
      </div>

      {/* Objectives */}
      {hasObjectives && (
        <>
          <div className="flex items-center gap-2.5 mt-6 mb-3">
            <span
              className="text-[11px] tracking-[1.5px] font-mono uppercase"
              style={{ color: "#7a8499" }}
            >
              ▸ OBJECTIVES
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              · {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
            <div className="flex-1 h-px bg-border/40" />
          </div>

          <div className="flex flex-col gap-0.5">
            {steps.map((step, i) => {
              const style = STATUS_STYLES[step.status];
              const hasProgress =
                step.progress_current != null && step.progress_max != null;

              return (
                <div
                  key={`step-${i}`}
                  className="flex items-start gap-3 p-3 rounded-[10px]"
                  style={{
                    background: style.rowBg,
                    border: `1px solid ${style.rowBorder}`,
                  }}
                >
                  {/* Status dot */}
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5"
                    style={{
                      border: `1.5px solid ${style.dotBorder}`,
                      background: style.dotBg,
                      color: style.dotFg,
                    }}
                  >
                    {style.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[13.5px] font-medium"
                      style={{
                        color: style.titleColor,
                        textDecoration:
                          step.status === "done" ? "line-through" : "none",
                      }}
                    >
                      {step.text ?? `Step ${step.step}`}
                    </div>
                    {step.target_name && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground/60" />
                        <span className="text-[11px] text-muted-foreground">
                          {step.target_name}
                        </span>
                      </div>
                    )}
                    {hasProgress && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatBar
                          value={step.progress_current!}
                          max={step.progress_max!}
                          height={4}
                          className="w-16"
                        />
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {step.progress_current}/{step.progress_max}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Route map */}
      {mapSectorId && (
        <>
          <div className="flex items-center gap-2.5 mt-6 mb-3">
            <span
              className="text-[11px] tracking-[1.5px] font-mono uppercase"
              style={{ color: "#7a8499" }}
            >
              ▸ ROUTE
            </span>
            <span className="text-[10.5px] text-muted-foreground">
              Target: {mapSectorId}
            </span>
            <div className="flex-1 h-px bg-border/40" />
            <button
              onClick={() => setMapExpanded(true)}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors hover:brightness-125"
              style={{
                color: "#7fb9d6",
                borderColor: "rgba(92,200,236,0.22)",
                background: "rgba(92,200,236,0.06)",
              }}
            >
              <MaximizeIcon />
              Expand
            </button>
          </div>

          <EmbeddedMap
            targetSectorId={mapSectorId}
            onExpand={() => setMapExpanded(true)}
            height={220}
          />
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2.5 mt-5">
        {mapSectorId && (
          <button
            onClick={() => onShowOnMap(mapSectorId, allMapObjectives)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors hover:brightness-125"
            style={{
              background: "rgba(92,200,236,0.12)",
              border: "1px solid rgba(92,200,236,0.3)",
              color: "#7fb9d6",
            }}
          >
            <Target className="w-4 h-4" />
            Show on Map
          </button>
        )}
      </div>
    </div>
  );
}

function MaximizeIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}
