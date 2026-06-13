import { useQuery } from "@tanstack/react-query";
import { Package, Rocket, Box, Diamond, Gem, Map as MapIcon, RadioTower, HelpCircle } from "lucide-react";
import { useState } from "react";

import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { DropListContent, buildDropGroups, DropEntry } from "../components/DropListContent";
import { PageLoaderPreset } from "../components/PageLoader";

// ─── Types ────────────────────────────────────────────────────────────────────

type DropList = { list_id: string; category: string | null };

type DropListDetail = DropList & { wares: DropEntry[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function prettify(id: string): string {
  return id.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const CATEGORY_LABELS: Record<string, string> = {
  ship: "Ship",
  lockbox: "Lockbox",
  asteroid: "Asteroid",
  crystal: "Crystal",
  story: "Mission",
  masstraffic: "Traffic",
  other: "Other",
};

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS);

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  ship: Rocket,
  lockbox: Box,
  asteroid: Diamond,
  crystal: Gem,
  story: MapIcon,
  masstraffic: RadioTower,
  other: HelpCircle,
};

const CATEGORY_ACTIVE: Record<string, string> = {
  ship: "bg-blue-500/20 border-blue-500/50 text-blue-400",
  lockbox: "bg-amber-500/20 border-amber-500/50 text-amber-400",
  asteroid: "bg-orange-500/20 border-orange-500/50 text-orange-400",
  crystal: "bg-emerald-500/20 border-emerald-500/50 text-emerald-400",
  story: "bg-purple-500/20 border-purple-500/50 text-purple-400",
  masstraffic: "bg-zinc-500/20 border-zinc-500/50 text-zinc-400",
  other: "bg-primary/20 border-primary/50 text-primary",
};

const CATEGORY_BG_HOVER: Record<string, string> = {
  ship: "hover:bg-blue-500/10 hover:border-blue-500/40",
  lockbox: "hover:bg-amber-500/10 hover:border-amber-500/40",
  asteroid: "hover:bg-orange-500/10 hover:border-orange-500/40",
  crystal: "hover:bg-emerald-500/10 hover:border-emerald-500/40",
  story: "hover:bg-purple-500/10 hover:border-purple-500/40",
  masstraffic: "hover:bg-zinc-500/10 hover:border-zinc-500/40",
  other: "hover:bg-primary/10 hover:border-primary/40",
};

const CATEGORY_ICON_COLOR: Record<string, string> = {
  ship: "text-blue-400/80 group-hover:text-blue-400",
  lockbox: "text-amber-400/80 group-hover:text-amber-400",
  asteroid: "text-orange-400/80 group-hover:text-orange-400",
  crystal: "text-emerald-400/80 group-hover:text-emerald-400",
  story: "text-purple-400/80 group-hover:text-purple-400",
  masstraffic: "text-zinc-400/80 group-hover:text-zinc-400",
  other: "text-primary/80 group-hover:text-primary",
};



// ─── DropDetailDialog ─────────────────────────────────────────────────────────

function DropDetailDialog({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<DropListDetail>({
    queryKey: ["drops", "list", listId],
    queryFn: () => fetch(`/api/v1/drops/lists/${listId}`).then((r) => r.json()),
  });

  // Group entries by (spawn_chance, source_basket) — each group is one independent drop event
  const groups = data ? buildDropGroups(data.wares) : [];

  const totalWares = data?.wares.length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pb-4 border-b border-border/40">
          <div className="flex flex-col gap-3">
            <DialogTitle className="flex items-center gap-2.5 text-xl tracking-tight">
              <Package className="h-5 w-5 text-muted-foreground" />
              {prettify(listId)}
            </DialogTitle>
            {data && (
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-foreground bg-background flex items-center gap-1.5 border-border/80 px-2.5 py-0.5">
                  {(() => {
                    const cat = data.category ?? "other";
                    const Icon = CATEGORY_ICONS[cat] ?? Package;
                    const iconColor = CATEGORY_ICON_COLOR[cat] ?? CATEGORY_ICON_COLOR.other;
                    return <Icon className={`h-3.5 w-3.5 ${iconColor}`} />;
                  })()}
                  {CATEGORY_LABELS[data.category ?? ""] ?? data.category}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {totalWares} possible {totalWares === 1 ? "item" : "items"} across {groups.length} drop {groups.length === 1 ? "event" : "events"}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="px-6 pb-6 pt-2">
          {isLoading && <p className="text-sm text-muted-foreground py-4"><PageLoaderPreset preset="default" /></p>}
          {!isLoading && <DropListContent groups={groups} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DropsPage() {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleFilterCategory = (cat: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(cat)) return prev.filter(c => c !== cat);
      return [...prev, cat];
    });
  };

  const { data: lists = [], isLoading } = useQuery<DropList[]>({
    queryKey: ["drops", "lists"],
    queryFn: () => fetch("/api/v1/drops/lists").then((r) => r.json()),
  });

  const filtered = lists.filter((l) => {
    const effectiveCategory = (!l.category || !ALL_CATEGORIES.includes(l.category)) ? "other" : l.category;
    if (selectedCategories.length > 0 && !selectedCategories.includes(effectiveCategory)) return false;
    if (search && !l.list_id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by category for display
  const byCategory = ALL_CATEGORIES.reduce<Record<string, DropList[]>>((acc, cat) => {
    const items = filtered.filter((l) => l.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});
  if (filtered.some((l) => !l.category || !ALL_CATEGORIES.includes(l.category))) {
    byCategory["other"] = filtered.filter((l) => !l.category || !ALL_CATEGORIES.includes(l.category));
  }

  const categoriesToShow = selectedCategories.length === 0 ? Object.keys(byCategory) : selectedCategories.filter(c => byCategory[c]?.length > 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-2xl font-bold">Drop Tables</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {lists.length} drop tables · click any entry to see its loot
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b border-border bg-muted/10">
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search tables…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 bg-background"
          />
          {search && (
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mr-1">Types:</span>
          {ALL_CATEGORIES.map((c) => {
            const isActive = selectedCategories.includes(c);
            const activeStyle = CATEGORY_ACTIVE[c] ?? CATEGORY_ACTIVE.other;
            const Icon = CATEGORY_ICONS[c] ?? Package;
            
            return (
              <button
                key={c}
                onClick={() => {
                  if (selectedCategories.length === 1 && selectedCategories.includes(c)) {
                    setSelectedCategories([]);
                  } else if (selectedCategories.length === 0) {
                    setSelectedCategories([c]);
                  } else {
                    toggleFilterCategory(c);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? activeStyle
                    : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:border-border"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {CATEGORY_LABELS[c]}
              </button>
            );
          })}
          {selectedCategories.length > 0 && (
            <button className="text-xs text-muted-foreground hover:text-foreground ml-2" onClick={() => setSelectedCategories([])}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-8 text-center"><PageLoaderPreset preset="default" /></p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">No drop tables match your filters.</p>
        ) : (
          <div className="space-y-6">
            {categoriesToShow.filter((c) => byCategory[c]?.length).map((cat) => {
              const Icon = CATEGORY_ICONS[cat] ?? Package;
              const bgHover = CATEGORY_BG_HOVER[cat] ?? CATEGORY_BG_HOVER.other;
              const iconColor = CATEGORY_ICON_COLOR[cat] ?? CATEGORY_ICON_COLOR.other;
              
              return (
                <div key={cat} className="space-y-4">
                  <button 
                    onClick={() => toggleCategory(cat)}
                    className="flex items-center gap-4 w-full group outline-none"
                  >
                    <Badge variant="outline" className="px-2.5 py-0.5 rounded-sm shadow-sm group-hover:scale-105 transition-transform duration-300 flex items-center gap-1.5 text-foreground bg-background border-border/80">
                      <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                      {CATEGORY_LABELS[cat] ?? cat} <span className="opacity-60 ml-1 font-normal">({byCategory[cat].length})</span>
                    </Badge>
                    <div className="h-px flex-1 bg-border/50 group-hover:bg-border transition-colors duration-300" />
                  </button>
                  
                  {!collapsedCategories.has(cat) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {byCategory[cat].map((list) => (
                        <button
                          key={list.list_id}
                          onClick={() => setOpenListId(list.list_id)}
                          className={`flex items-center gap-3 rounded-lg border border-border/50 bg-card/40 px-3.5 py-3 text-left transition-all duration-300 group hover:shadow-md hover:-translate-y-[1px] ${bgHover}`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 transition-transform duration-300 group-hover:scale-110 ${iconColor}`} />
                          <span className="text-sm font-medium truncate transition-transform duration-300 group-hover:translate-x-0.5">{prettify(list.list_id)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openListId && <DropDetailDialog listId={openListId} onClose={() => setOpenListId(null)} />}
    </div>
  );
}
