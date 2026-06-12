export type EntityCategory = 'combat' | 'trade' | 'mine' | 'build' | 'auxiliary' | 'explore' | 'police' | 'default';

export const CATEGORY_COLORS: Record<EntityCategory, {
  badgeClass: string;
  rgb: string;
}> = {
  combat: {
    badgeClass: "bg-red-500/10 text-red-500 border-red-500/20",
    rgb: "239, 68, 68", // red-500
  },
  trade: {
    badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    rgb: "59, 130, 246", // blue-500
  },
  mine: {
    badgeClass: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    rgb: "16, 185, 129", // emerald-500
  },
  build: {
    badgeClass: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    rgb: "168, 85, 247", // purple-500
  },
  auxiliary: {
    badgeClass: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
    rgb: "6, 182, 212", // cyan-500
  },
  explore: {
    badgeClass: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    rgb: "245, 158, 11", // amber-500
  },
  police: {
    badgeClass: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    rgb: "99, 102, 241", // indigo-500
  },
  default: {
    badgeClass: "bg-muted text-muted-foreground border-border",
    rgb: "255, 255, 255",
  }
};

export function getEntityCategory(tag: string | null | undefined): EntityCategory {
  if (!tag) return 'default';
  const t = tag.toLowerCase();
  
  if (['fight', 'weapon', 'turret', 'missile', 'combat', 'interceptor', 'fighter', 'heavyfighter', 'bomber', 'corvette', 'frigate', 'destroyer', 'carrier', 'battleship'].some(x => t.includes(x))) {
    return 'combat';
  }
  if (['trade', 'freighter', 'transporter', 'courier', 'container'].some(x => t.includes(x))) {
    return 'trade';
  }
  if (['mine', 'miner', 'gasminer', 'mineralminer', 'solid', 'liquid', 'salvage', 'dismantling'].some(x => t.includes(x))) {
    return 'mine';
  }
  if (['build', 'builder', 'station', 'module'].some(x => t.includes(x))) {
    return 'build';
  }
  if (['auxiliary', 'resupplier', 'equipment', 'software', 'consumable'].some(x => t.includes(x))) {
    return 'auxiliary';
  }
  if (['explore', 'scout', 'explorer'].some(x => t.includes(x))) {
    return 'explore';
  }
  if (['police', 'customs'].some(x => t.includes(x))) {
    return 'police';
  }
  
  return 'default';
}
