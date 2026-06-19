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
