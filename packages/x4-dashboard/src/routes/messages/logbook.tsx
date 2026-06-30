import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { BookOpen, Loader2, Search, X, MessageCircle, Info, Star, Newspaper, Wrench, ChevronDown, AlertTriangle, Shield, Ribbon, Handshake, Settings, UserCheck, Crosshair, Flame } from "lucide-react";
import { PageLoaderPreset } from "../../components/PageLoader";
import { Currency } from "../../components/Currency";
import { MultiSelect } from "../../components/ui/multi-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { cn } from "../../lib/utils";
import type { SaveSummary } from "../../components/SaveSelector";
import { getReputationColor, formatTimeAgo, cleanText } from "../../lib/formatters";
import { useSettings, type EventPriority } from "../../lib/settingsStore";

type LogEntry = {
  id: number;
  time: number;
  title: string;
  text: string;
  category: string;
  subcategory: string;
  faction: string | null;
  faction_name: string | null;
  faction_color: string | null;
  extra_json: string | null;
};

type CategoryInfo = {
  key: string;
  label: string;
  subcategories: { key: string; label: string }[];
};

const CATEGORY_META: Record<string, { label: string; icon: typeof BookOpen; dotColor: string; activeClasses: string; textClass: string }> = {
  combat: { label: "Combat", icon: Crosshair, dotColor: "bg-red-500", activeClasses: "text-red-500 border-red-500/30 bg-red-500/10", textClass: "text-red-500" },
  personnel: { label: "Personnel", icon: UserCheck, dotColor: "bg-teal-500", activeClasses: "text-teal-500 border-teal-500/30 bg-teal-500/10", textClass: "text-teal-500" },
  economy: { label: "Economy", icon: Wrench, dotColor: "bg-emerald-500", activeClasses: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10", textClass: "text-emerald-500" },
  reputation: { label: "Reputation", icon: Handshake, dotColor: "bg-blue-400", activeClasses: "text-blue-400 border-blue-400/30 bg-blue-400/10", textClass: "text-blue-400" },
  missions: { label: "Missions", icon: Star, dotColor: "bg-amber-500", activeClasses: "text-amber-500 border-amber-500/30 bg-amber-500/10", textClass: "text-amber-500" },
  alerts: { label: "Alerts", icon: AlertTriangle, dotColor: "bg-yellow-500", activeClasses: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10", textClass: "text-yellow-500" },
  boarding: { label: "Boarding", icon: Flame, dotColor: "bg-orange-500", activeClasses: "text-orange-500 border-orange-500/30 bg-orange-500/10", textClass: "text-orange-500" },
  construction: { label: "Construction", icon: Wrench, dotColor: "bg-purple-500", activeClasses: "text-purple-500 border-purple-500/30 bg-purple-500/10", textClass: "text-purple-500" },
  looting: { label: "Looting", icon: Info, dotColor: "bg-cyan-500", activeClasses: "text-cyan-500 border-cyan-500/30 bg-cyan-500/10", textClass: "text-cyan-500" },
  hacking: { label: "Hacking", icon: Shield, dotColor: "bg-indigo-500", activeClasses: "text-indigo-500 border-indigo-500/30 bg-indigo-500/10", textClass: "text-indigo-500" },
  research: { label: "Research", icon: Star, dotColor: "bg-sky-500", activeClasses: "text-sky-500 border-sky-500/30 bg-sky-500/10", textClass: "text-sky-500" },
  rewards: { label: "Rewards", icon: Ribbon, dotColor: "bg-amber-600", activeClasses: "text-amber-600 border-amber-600/30 bg-amber-600/10", textClass: "text-amber-600" },
  news: { label: "News", icon: Newspaper, dotColor: "bg-pink-500", activeClasses: "text-pink-500 border-pink-500/30 bg-pink-500/10", textClass: "text-pink-500" },
  tips: { label: "Tips", icon: Info, dotColor: "bg-emerald-600", activeClasses: "text-emerald-600 border-emerald-600/30 bg-emerald-600/10", textClass: "text-emerald-600" },
  ventures: { label: "Ventures", icon: Star, dotColor: "bg-violet-500", activeClasses: "text-violet-500 border-violet-500/30 bg-violet-500/10", textClass: "text-violet-500" },
  other: { label: "Other", icon: MessageCircle, dotColor: "bg-slate-500", activeClasses: "text-slate-500 border-slate-500/30 bg-slate-500/10", textClass: "text-slate-500" },
};
const DEFAULT_META = { label: "Event", icon: MessageCircle, dotColor: "bg-muted-foreground/40", activeClasses: "text-primary border-primary/30 bg-primary/10", textClass: "text-muted-foreground" };

function CategoryIcon({ catKey, size = 14 }: { catKey: string; size?: number }) {
  const meta = CATEGORY_META[catKey] ?? DEFAULT_META;
  const Icon = meta.icon;
  return (
    <div className={cn("rounded-full flex items-center justify-center shrink-0", meta.dotColor)} style={{ width: size + 4, height: size + 4 }}>
      <Icon className="text-white" style={{ width: size - 2, height: size - 2 }} />
    </div>
  );
}

const PAGE_SIZE = 200;

function FormattedReputationTitle({ title }: { title: string }) {
  const match = title.match(/^(.*?)(\+|-)(\d+)$/);
  if (match) {
    const isPositive = match[2] === '+';
    return (
      <span>
        {match[1]}
        <span className={isPositive ? "text-green-500" : "text-red-500"}>
          {match[2]}{match[3]}
        </span>
      </span>
    );
  }
  return <span>{title}</span>;
}

function FormattedReputationBody({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith("Current reputation:")) {
          const match = line.match(/Current reputation:\s*(-?\d+)/);
          if (match) {
            const val = parseInt(match[1], 10);
            return (
              <span key={i} className="block">
                Current reputation: <span className={getReputationColor(val)}>{val}</span>
              </span>
            );
          }
        }
        return <span key={i} className="block">{line}</span>;
      })}
    </>
  );
}

function FormattedAssignmentBody({ title, componentName }: { title: string, componentName?: string }) {
  const cleanTitle = title.replace(/\.$/, "");
  const match = cleanTitle.match(/^Assigned (.*?) to (.*)$/i);
  if (match) {
    return (
      <div className="flex flex-col gap-0.5 mt-1.5">
        <span className="text-[13px] text-muted-foreground/80">
          Person: <span className="text-foreground">{match[1]}</span>
        </span>
        <span className="text-[13px] text-muted-foreground/80">
          Location: <span className="text-foreground">{componentName || match[2]}</span>
        </span>
      </div>
    );
  }
  return null;
}

function PrioritySelect({ value, onChange }: { value: EventPriority; onChange: (v: EventPriority) => void }) {
  const PRIORITY_COLORS: Record<string, string> = {
    critical: "text-red-500 bg-red-500/10 border-red-500/30",
    high: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    normal: "text-foreground bg-background border-border",
    low: "text-muted-foreground bg-muted/20 border-border/50",
    hidden: "text-muted-foreground/50 bg-transparent border-dashed",
  };
  return (
    <select 
      value={value} 
      onChange={e => onChange(e.target.value as EventPriority)}
      className={cn(
        "rounded px-2 py-0.5 text-xs outline-none focus:ring-1 border transition-colors shrink-0", 
        PRIORITY_COLORS[value]
      )}
    >
      <option className="text-red-500 bg-background" value="critical">Critical</option>
      <option className="text-amber-500 bg-background" value="high">High</option>
      <option className="text-foreground bg-background" value="normal">Normal</option>
      <option className="text-muted-foreground bg-background" value="low">Low</option>
      <option className="text-muted-foreground/50 bg-background" value="hidden">Hidden</option>
    </select>
  );
}

function LogbookSettingsModal({ open, onClose, catInfos }: { open: boolean; onClose: () => void; catInfos: CategoryInfo[] }) {
  const { settings, updateSettings } = useSettings();
  const priorities = settings.logbookPriorities;
  
  const updatePriority = (key: string, value: EventPriority) => {
    updateSettings({ logbookPriorities: { ...priorities, [key]: value } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Logbook Event Priorities
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
          {catInfos.map((c) => (
            <div key={c.key} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
              {/* Header — icon + label only, no priority */}
              <div className="flex items-center gap-2 pb-1 border-b border-border/40">
                <CategoryIcon catKey={c.key} size={16} />
                <span className="text-sm font-semibold truncate">{c.label}</span>
              </div>
              {/* Subcategory rows */}
              {c.subcategories.map((s) => {
                const subKey = `${c.key}.${s.key}`;
                return (
                  <div key={subKey} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">{s.label}</span>
                    <PrioritySelect
                      value={priorities[subKey] ?? "normal"}
                      onChange={(v) => updatePriority(subKey, v)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          {/* General fallback */}
          <div className="rounded-lg border border-dashed border-border/50 bg-card/50 p-3 flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">General (unmatched)</span>
            <PrioritySelect
              value={priorities["general"] ?? "normal"}
              onChange={(v) => updatePriority("general", v)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PRIORITY_LEVELS = ["critical", "high", "normal", "low"] as const;

const PRIORITY_TAG: Record<string, { label: string; classes: string }> = {
  critical: { label: "Critical", classes: "text-red-400 border-red-500/40 bg-red-500/10 hover:bg-red-500/20" },
  high: { label: "High", classes: "text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20" },
  normal: { label: "Normal", classes: "text-foreground border-border bg-muted/30 hover:bg-muted/50" },
  low: { label: "Low", classes: "text-slate-400 border-slate-500/30 bg-slate-500/10 hover:bg-slate-500/20" },
};

const TIME_PRESETS = [
  { label: "15m", sec: 15 * 60 },
  { label: "30m", sec: 30 * 60 },
  { label: "1h", sec: 60 * 60 },
  { label: "2h", sec: 2 * 60 * 60 },
  { label: "6h", sec: 6 * 60 * 60 },
  { label: "12h", sec: 12 * 60 * 60 },
  { label: "24h", sec: 24 * 60 * 60 },
  { label: "All", sec: null },
];

export default function LogbookPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryKeys, setCategoryKeys] = useState<Set<string>>(new Set());
  const [subcategoryKeys, setSubcategoryKeys] = useState<Set<string>>(new Set());
  // Default: show everything except hidden
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set(["critical", "high", "normal", "low"]));
  const [timePreset, setTimePreset] = useState<number | null>(2 * 60 * 60); // default 2h
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showSettings, setShowSettings] = useState(false);
  const { settings } = useSettings();

  // Debounce search to avoid refetch + focus loss on every keystroke
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const { data: catInfos = [] } = useQuery<CategoryInfo[]>({
    queryKey: ["logbook-categories"],
    queryFn: () => fetch("/api/v1/logbook/categories").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Build dropdown options with colored icons
  const categoryOptions = useMemo(
    () => catInfos.map((c) => ({
      label: c.label,
      value: c.key,
      node: (
        <span className="flex items-center gap-2">
          <CategoryIcon catKey={c.key} size={14} />
          {c.label}
        </span>
      ),
    })),
    [catInfos]
  );

  // Subcategory options — grouped by parent, only for selected categories that have subs
  const subcategoryOptions = useMemo(() => {
    if (categoryKeys.size === 0) return [];
    return catInfos
      .filter((c) => categoryKeys.has(c.key) && c.subcategories.length > 0)
      .flatMap((c) =>
        c.subcategories.map((s) => ({
          label: s.label,
          value: `${c.key}.${s.key}`,
          group: c.label,
        }))
      );
  }, [catInfos, categoryKeys]);

  const hasSubcategories = subcategoryOptions.length > 0;

  // Build API filter params — exclude a parent category when any of its
  // subcategories are selected, so subcategory filtering is a narrowing.
  const categoryFilter = useMemo(() => {
    const parts: string[] = [];
    const subParents = new Set<string>();
    for (const sk of subcategoryKeys) {
      parts.push(sk);
      subParents.add(sk.split(".")[0]);
    }
    for (const ck of categoryKeys) {
      if (!subParents.has(ck)) parts.push(ck);
    }
    return parts.length > 0 ? parts : null;
  }, [categoryKeys, subcategoryKeys]);

  const { data: saves = [] } = useQuery<SaveSummary[]>({ queryKey: ["saves"] });
  const activeSave = saves.find(s => s.is_active);
  const currentTime = activeSave?.in_game_time_sec ?? 0;

  // Min time for API — relative to save's in-game time, not wall clock
  const minTime = timePreset != null && currentTime > 0 ? currentTime - timePreset : undefined;

  const { data: page, isLoading, isFetching } = useQuery<{ entries: LogEntry[]; total: number }>({
    queryKey: ["logbook", categoryFilter, debouncedSearch, visibleCount, minTime],
    placeholderData: (prev) => prev,  // keep stale data visible during refetch
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryFilter) {
        for (const cat of categoryFilter) params.append("category", cat);
      }
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (minTime != null) params.set("min_time", String(minTime));
      params.set("limit", String(visibleCount));
      params.set("offset", "0");
      return fetch(`/api/v1/logbook?${params}`).then((r) => r.json());
    },
  });

  const handleSearchChange = (q: string) => {
    setSearch(q);
    setVisibleCount(PAGE_SIZE);
  };

  const clearAllFilters = () => {
    setCategoryKeys(new Set());
    setSubcategoryKeys(new Set());
    setPriorityFilter(new Set(["critical", "high", "normal", "low"]));
    setTimePreset(2 * 60 * 60);
    setSearch("");
    setVisibleCount(PAGE_SIZE);
  };

  const hasAnyFilter = categoryKeys.size > 0 || subcategoryKeys.size > 0 || !["critical", "high", "normal", "low"].every((l) => priorityFilter.has(l)) || timePreset !== 2 * 60 * 60 || search.length > 0;

  // Client-side priority filter
  const priorityFiltered = useMemo(() => {
    const entries = page?.entries ?? [];
    if (priorityFilter.size === 0) return entries;
    return entries.filter((e) => {
      const key = `${e.category}.${e.subcategory}`;
      const prio = settings.logbookPriorities[key] ?? settings.logbookPriorities["general"] ?? "normal";
      return priorityFilter.has(prio);
    });
  }, [page?.entries, priorityFilter, settings.logbookPriorities]);

  if (isLoading && !page) return <PageLoaderPreset preset="logbook" />;

  const total = page?.total ?? 0;
  const hasMore = visibleCount < total;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
          <BookOpen className="h-6 w-6 text-primary" /> Logbook
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />}
        </h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {total > 0 ? (
            <>Showing {priorityFiltered.length} of {total.toLocaleString()} event{total !== 1 ? "s" : ""}</>
          ) : (
            <>No events</>
          )}
        </p>
      </div>

      {/* Filters */}
      <div className="px-6 pt-4 shrink-0 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search entries…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button onClick={() => handleSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Priority filter tags */}
        <div className="flex items-center gap-1">
          {PRIORITY_LEVELS.map((level) => {
            const tag = PRIORITY_TAG[level];
            const isActive = priorityFilter.has(level);
            return (
              <button
                key={level}
                onClick={() => {
                  const next = new Set(priorityFilter);
                  if (isActive) next.delete(level); else next.add(level);
                  setPriorityFilter(next);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={cn(
                  "px-2 py-1 rounded text-[11px] font-medium border transition-colors",
                  tag.classes,
                  !isActive && "opacity-40 hover:opacity-70"
                )}
              >
                {tag.label}
              </button>
            );
          })}
        </div>

        <MultiSelect
          options={categoryOptions}
          selected={categoryKeys}
          onChange={(sel) => { setCategoryKeys(sel); setSubcategoryKeys(new Set()); setVisibleCount(PAGE_SIZE); }}
          placeholder="All categories"
          className="w-44"
          closeOnSelect={false}
        />

        {hasSubcategories && (
          <MultiSelect
            options={subcategoryOptions}
            selected={subcategoryKeys}
            onChange={(sel) => { setSubcategoryKeys(sel); setVisibleCount(PAGE_SIZE); }}
            placeholder="Subcategory"
            className="w-44"
            searchable
            closeOnSelect={false}
          />
        )}

        {/* Time range selector — pill buttons */}
        <div className="flex items-center gap-0.5">
          {TIME_PRESETS.map((tp) => {
            const isActive = timePreset === tp.sec;
            return (
              <button
                key={tp.label}
                onClick={() => {
                  setTimePreset(tp.sec);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={cn(
                  "px-2 py-1 rounded text-[11px] font-medium border transition-colors shrink-0",
                  isActive
                    ? "text-primary border-primary/40 bg-primary/10"
                    : "text-muted-foreground border-border/50 bg-transparent hover:bg-muted/30 hover:text-foreground"
                )}
              >
                {tp.label}
              </button>
            );
          })}
        </div>

        {hasAnyFilter && (
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setShowSettings(!showSettings)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded border transition-colors shrink-0 text-xs font-medium",
            showSettings ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50 hover:text-foreground"
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Priorities
        </button>
      </div>

      <LogbookSettingsModal open={showSettings} onClose={() => setShowSettings(false)} catInfos={catInfos} />

      {/* List */}
      <div className="flex-1 overflow-hidden px-6 pb-6 pt-3">
        <div className="h-full overflow-auto">
          <div className="flex flex-col gap-3">
            {priorityFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <BookOpen className="h-10 w-10 opacity-30" />
                <p className="text-sm">No log entries found.</p>
              </div>
            ) : (
              <>
                {priorityFiltered.map((entry) => {
                  const cat = entry.category || "other";
                  const textStr = entry.text || "";

                  const body = cleanText(textStr);
                  const meta = CATEGORY_META[cat] ?? DEFAULT_META;
                  let Icon = meta.icon;
                  const extra = entry.extra_json ? JSON.parse(entry.extra_json) as Record<string, string> : null;
                  const money = extra?.money ? parseInt(extra.money, 10) : null;
                  const componentName = extra?.component_name;

                  // Priority lookup — "category.subcategory" → "general"
                  const subKey = `${cat}.${entry.subcategory || "other"}`;
                  const priority = settings.logbookPriorities[subKey]
                    ?? settings.logbookPriorities["general"]
                    ?? "normal";
                  const isCritical = priority === "critical";
                  const isHigh = priority === "high";
                  const isLow = priority === "low";

                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex gap-4 p-4 rounded-lg border transition-all",
                        isCritical ? "border-red-500/50 bg-red-500/5 hover:bg-red-500/10" :
                        isHigh ? "border-amber-500/50 bg-amber-500/5 hover:bg-amber-500/10" :
                        isLow ? "opacity-40 border-transparent bg-transparent hover:bg-muted/10 grayscale" :
                        "border-border bg-card hover:bg-muted/30"
                      )}
                    >
                      {/* Left Column: Icon and Time */}
                      <div className="flex flex-col items-center gap-2 w-16 shrink-0 pt-0.5">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center shadow-sm",
                            meta.dotColor
                          )}
                        >
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular-nums font-mono text-center">
                          {formatTimeAgo(entry.time, currentTime)}
                        </span>
                      </div>

                      {/* Right Column: Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-3 flex-wrap">
                          <span className={cn(
                            "text-sm font-semibold flex items-center gap-1.5", 
                            isCritical && "text-red-500",
                            isHigh && "text-amber-500"
                          )}>
                            {(isCritical || isHigh) && <AlertTriangle className="h-4 w-4" />}
                            {cat === "reputation" ? <FormattedReputationTitle title={entry.title} /> : 
                             cat === "assignments" ? "Assignment" : entry.title}
                          </span>
                          {entry.faction_name && (
                            <span
                              className="text-[11px] font-semibold"
                              style={{ color: entry.faction_color ?? undefined }}
                            >
                              {entry.faction_name}
                            </span>
                          )}
                          <span
                            className={cn(
                              "text-[10px] font-semibold uppercase tracking-wide opacity-70",
                              meta.textClass
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>
                        {cat === "assignments" && <FormattedAssignmentBody title={entry.title} componentName={componentName} />}
                        {componentName && cat !== "assignments" && (
                          <span className="block text-[13px] text-muted-foreground/80 mt-1.5">
                            Location: <span className="text-foreground">{componentName}</span>
                          </span>
                        )}
                        {body && (
                          <p className="text-[13px] text-muted-foreground/80 mt-1.5 leading-relaxed whitespace-pre-wrap max-w-5xl">
                            {cat === "reputation" ? <FormattedReputationBody text={body} /> : body}
                          </p>
                        )}
                        {money != null && (
                          <div className="mt-2 inline-flex rounded-md bg-muted/40 px-2 py-1">
                            <Currency value={money} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <ChevronDown className="h-4 w-4" />
                      Load more ({total - (page?.entries?.length ?? 0)} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
