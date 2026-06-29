// ── Types ──────────────────────────────────────────────────────────────────────

export type MissionObjective = {
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

export type Mission = {
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

export type MissionOffer = {
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

export type PlayerMeta = { in_game_time_sec: number | null };

export type PlayerStat = { stat_id: string; value: number; display: string };

// ── Difficulty ────────────────────────────────────────────────────────────────

export const DIFFICULTY_KEYS = [
  "trivial",
  "veryeasy",
  "easy",
  "medium",
  "hard",
  "veryhard",
] as const;
export type Difficulty = (typeof DIFFICULTY_KEYS)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  trivial: "Trivial",
  veryeasy: "Very Easy",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  veryhard: "Very Hard",
};

export const LEVEL_COLORS: Record<Difficulty, string> = {
  trivial: "#22d3ee",
  veryeasy: "#4ade80",
  easy: "#a3e635",
  medium: "#facc15",
  hard: "#f97316",
  veryhard: "#ef4444",
};

// ── Mission type colours ──────────────────────────────────────────────────────

export type MissionType = string;

export const TYPE_COLORS: Record<MissionType, string> = {
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

// ── Buckets ───────────────────────────────────────────────────────────────────

export type Bucket = "active" | "offer" | "guild";

// ── Selection state ───────────────────────────────────────────────────────────

export type SelectionKind = "mission" | "choice" | "all";

// ── Render items for master list ──────────────────────────────────────────────

export type RenderItem =
  | { kind: "card"; mission: Mission }
  | { kind: "card-offer"; offer: MissionOffer }
  | { kind: "group"; groupId: string; groupName: string | null; missions: Mission[] }
  | { kind: "group-offer"; groupId: string; offers: MissionOffer[] };
