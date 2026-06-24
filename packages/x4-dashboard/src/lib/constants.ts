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

export function getWareGroupColor(groupId: string | null | undefined): string {
  if (!groupId) return "bg-muted text-muted-foreground border-border";
  const id = groupId.toLowerCase();
  
  // Base raw materials / liquids / gases
  if (id === 'energy') return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  if (id === 'water') return "bg-sky-500/10 text-sky-500 border-sky-500/20";
  if (id === 'ice') return "bg-cyan-500/10 text-cyan-500 border-cyan-500/20";
  if (id === 'minerals') return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  if (id === 'gases') return "bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/20";
  
  // Biological / Food
  if (id === 'agricultural') return "bg-lime-500/10 text-lime-500 border-lime-500/20";
  if (id === 'food') return "bg-green-500/10 text-green-500 border-green-500/20";
  if (id === 'pharmaceutical') return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  
  // Intermediate / Tech
  if (id === 'refined') return "bg-orange-500/10 text-orange-500 border-orange-500/20";
  if (id === 'hightech') return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  if (id === 'shiptech') return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
  
  // Equipment / Weapons
  if (id === 'weapons') return "bg-red-500/10 text-red-500 border-red-500/20";
  if (id === 'turrets') return "bg-rose-600/10 text-rose-600 border-rose-600/20";
  if (id === 'missiles') return "bg-pink-500/10 text-pink-500 border-pink-500/20";
  if (id === 'shields') return "bg-violet-500/10 text-violet-500 border-violet-500/20";
  if (id === 'engines') return "bg-purple-500/10 text-purple-500 border-purple-500/20";
  if (id === 'thrusters') return "bg-fuchsia-600/10 text-fuchsia-600 border-fuchsia-600/20";
  if (id === 'drones') return "bg-rose-400/10 text-rose-400 border-rose-400/20";
  if (id === 'countermeasures') return "bg-slate-400/10 text-slate-400 border-slate-400/20";
  if (id === 'software') return "bg-cyan-600/10 text-cyan-600 border-cyan-600/20";
  
  // Inventory / Other
  if (id === 'contraband') return "bg-rose-900/30 text-rose-400 border-rose-900/50";
  if (id === 'curiosity') return "bg-teal-500/10 text-teal-500 border-teal-500/20";
  if (id === 'generalitem') return "bg-stone-500/10 text-stone-400 border-stone-500/20";
  if (id === 'hardware') return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  if (id === 'luxuryitem') return "bg-amber-600/10 text-amber-600 border-amber-600/20";
  
  // Fallback for anything else (like shipmods/paintmods if they surface)
  return "bg-slate-500/10 text-slate-400 border-slate-500/20";
}

export function getTierColor(tier: number | null | undefined): string {
  if (tier == null) return "bg-muted text-muted-foreground border-border";
  switch (tier) {
    case 1: return "bg-slate-500/10 text-slate-300 border-slate-500/20";
    case 2: return "bg-green-500/10 text-green-400 border-green-500/20";
    case 3: return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    case 4: return "bg-purple-500/10 text-purple-400 border-purple-500/20";
    case 5: return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    default: return "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
  }
}

export function getTierName(tier: number | null | undefined): string {
  if (tier == null) return "Unknown Tier";
  switch (tier) {
    case 1: return "Tier 1: Basic resources or raw materials";
    case 2: return "Tier 2: First-level refined goods";
    case 3: return "Tier 3: Intermediate components";
    case 4: return "Tier 4: High-tech components or advanced products";
    case 5: return "Tier 5: End-stage products (e.g. ship tech, drones)";
    default: return `Tier ${tier}: Exotic or special items`;
  }
}

export function getTierLabel(tier: number | null | undefined): string {
  if (tier == null) return "Unknown";
  switch (tier) {
    case 1: return "Tier 1";
    case 2: return "Tier 2";
    case 3: return "Tier 3";
    case 4: return "Tier 4";
    case 5: return "Tier 5";
    default: return `Tier ${tier}`;
  }
}
