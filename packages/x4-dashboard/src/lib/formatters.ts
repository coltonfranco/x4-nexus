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
  if (!tag) return "bg-muted text-muted-foreground border-border";
  
  const t = tag.toLowerCase();
  if (['fight', 'weapon', 'turret', 'missile', 'combat', 'interceptor', 'fighter', 'heavyfighter', 'bomber', 'corvette', 'frigate', 'destroyer', 'carrier', 'battleship'].some(x => t.includes(x))) {
    return "bg-red-500/10 text-red-500 border-red-500/20";
  }
  if (['trade', 'freighter', 'transporter', 'courier', 'container'].some(x => t.includes(x))) {
    return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  }
  if (['mine', 'miner', 'gasminer', 'mineralminer', 'solid', 'liquid', 'salvage', 'dismantling'].some(x => t.includes(x))) {
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  }
  if (['build', 'builder', 'station', 'module'].some(x => t.includes(x))) {
    return "bg-purple-500/10 text-purple-500 border-purple-500/20";
  }
  if (['auxiliary', 'resupplier', 'equipment', 'software', 'consumable'].some(x => t.includes(x))) {
    return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
  }
  if (['explore', 'scout', 'explorer'].some(x => t.includes(x))) {
    return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  }
  if (['police', 'customs'].some(x => t.includes(x))) {
    return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
  }
  return "bg-muted text-muted-foreground border-border";
}
