import { getEntityCategory, CATEGORY_COLORS } from './constants';

export function getReputationScore(relation: number): number {
  if (relation >= -0.0032 && relation <= 0.0032) {
    return 0; // Linear interpolation area near zero
  }
  const isNegative = relation < 0;
  const absRel = Math.abs(relation);
  const score = 10 * Math.log10(absRel * 1000);
  return isNegative ? -score : score;
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
    case "XS": return "bg-gray-500/10 text-gray-500 border-gray-500/20";
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
