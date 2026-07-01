import {
  Shield,
  Target,
  Building2,
  ScrollText,
  Swords,
  RefreshCw,
} from "lucide-react";
import { formatTimeAgo, formatCompactNumber } from "../../lib/formatters";
import { Pill } from "../../components/ui/pill";
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
  if (isNaN(t) || nowSec <= t) return null;
  return formatTimeAgo(t, nowSec) || null;
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
  const compact = formatCompactNumber(n, {
    mDecimals: 2,
    decimals: 1,
    trim: true,
    base: (v) => v.toLocaleString(),
  });
  return `${compact} Cr`;
}

// ── Tag / badge components ────────────────────────────────────────────────────

export function LevelBadge({ level }: { level: string | null }) {
  const label = levelLabel(level);
  if (!label) return null;
  const color = LEVEL_COLORS[level as Difficulty] ?? "var(--text-muted)";
  return <Pill label={label} color={color} bg={`${color}18`} />;
}

export function StoryTag() {
  return <Pill label="✦ STORY" color="#d79be8" bg="rgba(200,121,224,0.14)" />;
}

export function RepeatableTag() {
  return (
    <Pill
      label="Repeatable"
      color="#7dd3fc"
      border="1px solid rgba(125,211,252,0.35)"
      icon={<RefreshCw className="w-3 h-3" />}
    />
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
