import { Badge } from "./ui/badge";
import { StatBar } from "./StatBar";

export type DropEntry = {
  ware_id: string;
  ware_name: string | null;
  spawn_chance: number | null;
  item_chance: number | null;
  min_amount: number;
  max_amount: number;
  source_basket: string | null;
};

export type DropGroup = {
  key: string;
  spawn_chance: number | null;
  source_basket: string | null;
  entries: DropEntry[];
};

export function buildDropGroups(wares: DropEntry[]): DropGroup[] {
  const seen = new Map<string, DropGroup>();
  for (const entry of wares) {
    const key = `${entry.spawn_chance ?? "always"}::${entry.source_basket ?? "inline"}`;
    if (!seen.has(key)) {
      seen.set(key, { key, spawn_chance: entry.spawn_chance, source_basket: entry.source_basket, entries: [] });
    }
    seen.get(key)!.entries.push(entry);
  }
  // Sort by spawn_chance desc; within each group entries are already ordered by item_chance desc from API
  return Array.from(seen.values()).sort((a, b) => (b.spawn_chance ?? 101) - (a.spawn_chance ?? 101));
}

export function DropListContent({ groups }: { groups: DropGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 italic">No loot data available.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="flex items-end justify-between mb-1.5 pl-1">
            <StatBar 
              value={group.spawn_chance ?? 100} 
              max={100} 
              width={100} 
              labelLeft={group.spawn_chance != null ? `${group.spawn_chance}% chance` : "Always"}
              className="!w-auto shrink-0" 
            />
            <span className="text-xs text-muted-foreground opacity-60 whitespace-nowrap">
              pick 1 of {group.entries.length}
            </span>
          </div>
          <div className="rounded-lg border border-border overflow-hidden flex flex-col bg-muted/5">
            {group.entries.map((entry, i) => (
              <div key={i} className="flex justify-between items-center px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/20 group transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                  <span className="font-medium text-sm">
                    {entry.ware_name || entry.ware_id}
                  </span>
                  {entry.ware_id.startsWith("missile_") && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-muted-foreground/30 text-muted-foreground">missile</Badge>
                  )}
                  {entry.ware_id.startsWith("modpart_") && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-purple-500/30 text-purple-400">mod part</Badge>
                  )}
                  {entry.ware_id.startsWith("inv_") && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500/30 text-emerald-400">inventory</Badge>
                  )}
                </div>
                <div className="text-right text-muted-foreground text-sm tabular-nums flex items-center gap-4">
                  {entry.item_chance != null && (
                    <Badge variant="secondary" className="font-medium opacity-80">{entry.item_chance}%</Badge>
                  )}
                  <span className="font-mono text-xs w-12 text-right opacity-80">
                    {entry.min_amount === entry.max_amount
                      ? `×${entry.min_amount}`
                      : `×${entry.min_amount}–${entry.max_amount}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
