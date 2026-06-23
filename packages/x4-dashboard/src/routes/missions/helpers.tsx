import {
  Shield,
  Target,
  Building2,
  ScrollText,
  Swords,
  RefreshCw,
} from "lucide-react";
import {
  DIFFICULTY_LABEL,
  LEVEL_COLORS,
  TYPE_COLORS,
  type Difficulty,
  type MissionType,
} from "./types";

// ── Labels ────────────────────────────────────────────────────────────────────

export function levelLabel(level: string | null): string | null {
  if (!level) return null;
  return DIFFICULTY_LABEL[level as Difficulty] ?? level;
}

export function typeColor(t: MissionType): string {
  return TYPE_COLORS[t] ?? "#94a3b8";
}

export function typeLabel(t: MissionType): string {
  return t
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

// ── Objective type labels ─────────────────────────────────────────────────────

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

export function objTypeLabel(t: string | null): string {
  if (!t) return "";
  return (
    OBJ_TYPE_LABEL[t] ??
    t.replace(/_/g, " ").replace(/^[a-z]/, (c) => c.toUpperCase())
  );
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function fmtTime(
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

export function fmtItemRef(
  encyclopediaItem: string | null | undefined,
): string | null {
  if (!encyclopediaItem) return null;
  return encyclopediaItem
    .replace(/^inv_/, "")
    .replace(/^ship_/, "")
    .replace(/_/g, " ")
    .replace(/[0-9]+$/, "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fmtCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M Cr`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k Cr`;
  return `${n.toLocaleString()} Cr`;
}

// ── Tag / badge components ────────────────────────────────────────────────────

export function LevelBadge({ level }: { level: string | null }) {
  const label = levelLabel(level);
  if (!label) return null;
  const color = LEVEL_COLORS[level as Difficulty] ?? "var(--text-muted)";
  return (
    <span
      style={{
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        background: `${color}18`,
        color,
        borderRadius: "5px",
      }}
    >
      {label}
    </span>
  );
}

export function StoryTag() {
  return (
    <span
      style={{
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        background: "rgba(200,121,224,0.14)",
        color: "#d79be8",
        borderRadius: "5px",
      }}
    >
      ✦ STORY
    </span>
  );
}

export function RepeatableTag() {
  return (
    <span
      className="flex items-center gap-1"
      style={{
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: "9px",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        background: "transparent",
        color: "#7dd3fc",
        border: "1px solid rgba(125,211,252,0.35)",
        borderRadius: "5px",
      }}
    >
      <RefreshCw className="w-3 h-3" />
      Repeatable
    </span>
  );
}

export function TypeIcon({ type }: { type: string | null }) {
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
