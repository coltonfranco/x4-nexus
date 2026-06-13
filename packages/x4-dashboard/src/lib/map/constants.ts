// Shared constants for the universe map feature.

export const DLC_LABELS: Record<string, string> = {
  boron:     "Kingdom End",
  terran:    "Cradle of Humanity",
  split:     "Split Vendetta",
  pirate:    "Tides of Avarice",
  timelines: "Timelines",
  "4":       "Hyperion Pack",
  "5":       "Boron Pack",
  odyssey:   "Odyssey of the Ancients",
};

export const RESOURCE_COLORS: Record<string, string> = {
  energy: "#fde047",
  ore: "#fca5a5",
  silicon: "#93c5fd",
  ice: "#bfdbfe",
  nividium: "#d8b4fe",
  rawscrap: "#d1d5db",
  methane: "#fdba74",
  helium: "#fcd34d",
  hydrogen: "#f472b6",
};

export const RESOURCE_ORDER = ["ore", "silicon", "ice", "nividium", "hydrogen", "helium", "methane", "rawscrap"];

export const MAP_THEME = {
  bg: "#06060e",
  hexFill: "#64748b66",
  hexStroke: "#64748b40",
  hexHover: "#64748b2e",
  hexLabel: "#94a3b8",
  gate: "#64748b",
  accelerator: "#fcd34d",
  superhighway: "#4aaeff",
  localhighway: "#6366f1",
  linkDefault: "#64748b",
  linkActive: "#4aaeff",
  station: "#94a3b8",
  stationPlayer: "#fcd34d",
  gridLine: "rgba(255,255,255,0.05)",
  buildGrid: "rgba(120,180,255,0.12)",
  navHighlight: "#2dd4bf",
  factionGlow: "rgba(255,255,255,0.05)",
  fogBg: "#0b1220",
  sectorFallback: "#2d3748",
  labelBg: "rgba(15,23,42,",   // prefix — alpha appended
  labelText: "rgba(255,255,255,0.9)",
} as const;

export const STATUS_COLORS = {
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  neutral: "#4b5563",
  gold: "#FFD700",
  silver: "#C0C0C0",
  bronze: "#CD7F32",
} as const;

export const MAP_W = 3000;
export const MAP_H = 2200;
export const SQRT3 = Math.sqrt(3);
