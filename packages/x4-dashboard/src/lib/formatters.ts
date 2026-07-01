import { getEntityCategory, CATEGORY_COLORS } from './constants';

export function getReputationScore(relation: number): number {
  // Per EGOSOFT wiki: displayed = 10 * log10(actual * 1000)
  // Floor matches the in-game HUD: you're "at" a reputation tier as soon as
  // you cross the threshold — floor(22.75) = 22, -floor(8.80) = -8.
  // The wiki formula breaks down below 0.001 (log10 < 1 → negative result
  // that gets sign-flipped). Values in (-0.0032, +0.0032) display as 0.
  const NEUTRAL = 0.0032;
  if (Math.abs(relation) < NEUTRAL) return 0;
  const score = 10 * Math.log10(Math.abs(relation) * 1000);
  return relation > 0 ? Math.floor(score) : -Math.floor(score);
}

export function getReputationColor(repScore: number): string {
  if (repScore >= 20) return "text-emerald-400"; // Deep ally
  if (repScore >= 10) return "text-green-500";   // Friend
  if (repScore <= -20) return "text-red-600";    // Deep enemy
  if (repScore <= -10) return "text-red-400";    // Hostile
  return "text-muted-foreground";                // Neutral
}

export function getTypeColor(tag: string | null | undefined): string {
  const category = getEntityCategory(tag);
  return CATEGORY_COLORS[category].badgeClass;
}

export function classShort(class_id: string) {
  return class_id.replace("ship_", "").toUpperCase();
}

export function classFull(class_id: string) {
  const short = classShort(class_id);
  switch (short) {
    case "XS": return "Extra Small";
    case "S": return "Small";
    case "M": return "Medium";
    case "L": return "Large";
    case "XL": return "Extra Large";
    default: return short;
  }
}

export function getClassColor(class_id: string): string {
  const cls = classShort(class_id);
  switch (cls) {
    case "XS": return "bg-zinc-400/10 text-zinc-300 border-zinc-400/20";
    case "S": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "M": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "L": return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "XL": return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function getMkColor(mk: number | null | undefined): string {
  switch (mk) {
    case 1: return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    case 2: return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case 3: return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case 4: return "bg-purple-500/10 text-purple-500 border-purple-500/20";
    case 5: return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function getMkGradientClass(mk: number | null | undefined): string {
  switch (mk) {
    case 1: return "bg-gradient-to-br from-gray-500/20 to-transparent border-gray-500/30";
    case 2: return "bg-gradient-to-br from-emerald-500/20 to-transparent border-emerald-500/30";
    case 3: return "bg-gradient-to-br from-blue-500/20 to-transparent border-blue-500/30";
    case 4: return "bg-gradient-to-br from-purple-500/20 to-transparent border-purple-500/30";
    case 5: return "bg-gradient-to-br from-orange-500/20 to-transparent border-orange-500/30";
    default: return "bg-muted/20 border-border/50";
  }
}

export function formatLicence(raw: string | null): string {
  if (!raw) return "";
  // Handle "faction_licence_type" pattern, e.g. "arg_licence_military"
  const m = raw.match(/^([a-z]+)_licence_(.+)$/);
  if (m) {
    const faction = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    const type = m[2].replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return `${faction} ${type}`;
  }
  // Handle simple compound words, e.g. "militaryship", "capitalship"
  return raw
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-z])(ship|licence|equipment)/gi, "$1 $2")
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const getWeaponType = (name: string) => {
  return name
    .replace(/^(ARG|TEL|PAR|SPL|TER|BOR|PIO|VIG|RIP|XEN|KHA|ATF)\s+/i, '')
    .replace(/^(S|M|L|XL)\s+/i, '')
    .replace(/\s+Mk\d+$/i, '')
    .trim() || "Other";
};

/**
 * Abbreviate a number with k/M/(B) suffixes, e.g. 1_500_000 -> "1.5M".
 * Tier thresholds are decided off `Math.abs(value)`; the sign stays on `value`
 * itself so callers get correctly-signed output without special-casing.
 */
export function formatCompactNumber(
  value: number,
  opts: {
    /** k-tier decimal places (default 1). */
    decimals?: number;
    /** M-tier decimal places (default 1). */
    mDecimals?: number;
    /** B-tier decimal places (default 1, only used when `billions` is set). */
    bDecimals?: number;
    /** Enable the 1e9 "B" tier. */
    billions?: boolean;
    /** Strip trailing zeros, e.g. "1.50M" -> "1.5M". */
    trim?: boolean;
    /** Formatter for |value| < 1000. Defaults to the raw value. */
    base?: (v: number) => string;
  } = {}
): string {
  const { decimals = 1, mDecimals = 1, bDecimals = 1, billions = false, trim = false, base } = opts;
  const abs = Math.abs(value);
  const fixed = (n: number, d: number, unit: string) => {
    let s = n.toFixed(d);
    if (trim) s = String(parseFloat(s));
    return `${s}${unit}`;
  };
  if (billions && abs >= 1_000_000_000) return fixed(value / 1_000_000_000, bDecimals, "B");
  if (abs >= 1_000_000) return fixed(value / 1_000_000, mDecimals, "M");
  if (abs >= 1_000) return fixed(value / 1_000, decimals, "k");
  return base ? base(value) : `${value}`;
}

/**
 * Ship/equipment stat display: abbreviated above 1000, otherwise a small-value
 * heuristic (one decimal for non-integers under 10, whole numbers otherwise) —
 * shared by the ship builder's stat rows and the ship detail panel.
 */
export function formatStatValue(value: number): string {
  return formatCompactNumber(value, { base: (v) => v.toFixed(v < 10 && v % 1 !== 0 ? 1 : 0) });
}

/** Largest whole s/m/h/d unit fitting a duration — the shared core of every
 *  "time since" display (formatAge, formatTimeAgo, RefreshIndicator's clock). */
export function bucketSeconds(seconds: number): { n: number; unit: "s" | "m" | "h" | "d" } {
  if (seconds < 60) return { n: Math.floor(seconds), unit: "s" };
  const m = Math.floor(seconds / 60);
  if (m < 60) return { n: m, unit: "m" };
  const h = Math.floor(m / 60);
  if (h < 24) return { n: h, unit: "h" };
  return { n: Math.floor(h / 24), unit: "d" };
}

export function formatAge(seconds: number): string {
  const { n, unit } = bucketSeconds(seconds);
  return `${n}${unit}`;
}

export function formatTimeAgo(timeSec: number, currentTimeSec: number): string {
  if (!timeSec) return "";
  const { n, unit } = bucketSeconds(Math.max(0, currentTimeSec - timeSec));
  return `${n}${unit} ago`;
}

/** In-game play time as "Xh Ym" (e.g. save summaries, player stats). */
export function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

export function cleanText(text: string): string {
  return text
    .replace(/\[\\?\d+\]#[A-Fa-f0-9]{6,8}#/g, "")
    .replace(/\[\\?\d+\]X?/g, (m: string) => (m.includes("033") ? "" : "\n"))
    .replace(/#[A-Fa-f0-9]{6,8}#/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
