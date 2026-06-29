import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, Search, X, MessageCircle, Info, Star, Newspaper, Wrench, ChevronDown } from "lucide-react";
import { PageLoaderPreset } from "../../components/PageLoader";
import { Currency } from "../../components/Currency";
import { cn } from "../../lib/utils";

type LogEntry = {
  id: number;
  time: number;
  title: string;
  text: string;
  category: string | null;
  faction: string | null;
  faction_name: string | null;
  faction_color: string | null;
  extra_json: string | null;
};

const CATEGORY_META: Record<string, { label: string; icon: typeof BookOpen; dotColor: string }> = {
  missions: { label: "Missions", icon: Star, dotColor: "bg-amber-500" },
  news: { label: "News", icon: Newspaper, dotColor: "bg-sky-500" },
  tips: { label: "Tips", icon: Info, dotColor: "bg-emerald-500" },
  upkeep: { label: "Upkeep", icon: Wrench, dotColor: "bg-violet-500" },
};
const DEFAULT_META = { label: "Event", icon: MessageCircle, dotColor: "bg-muted-foreground/40" };

const PAGE_SIZE = 200;

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m`;
  if (mins > 0) return `${mins}m`;
  return `${Math.floor(seconds)}s`;
}

function cleanText(text: string): string {
  return text
    .replace(/\[\\?\d+\]#[A-Fa-f0-9]{6,8}#/g, "")
    .replace(/\[\\?\d+\]X?/g, (m) => (m.includes("033") ? "" : "\n"))
    .replace(/#[A-Fa-f0-9]{6,8}#/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function LogbookPage() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["logbook-categories"],
    queryFn: () => fetch("/api/v1/logbook/categories").then((r) => r.json()),
  });

  const { data: page, isLoading } = useQuery<{ entries: LogEntry[]; total: number }>({
    queryKey: ["logbook", categoryFilter, search, visibleCount],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (search) params.set("q", search);
      params.set("limit", String(visibleCount));
      params.set("offset", "0");
      return fetch(`/api/v1/logbook?${params}`).then((r) => r.json());
    },
  });

  // Reset visible count when filters change
  const handleFilterChange = (cat: string | null) => {
    setCategoryFilter(cat);
    setVisibleCount(PAGE_SIZE);
  };
  const handleSearchChange = (q: string) => {
    setSearch(q);
    setVisibleCount(PAGE_SIZE);
  };

  if (isLoading) return <PageLoaderPreset preset="logbook" />;

  const entries = page?.entries ?? [];
  const total = page?.total ?? 0;
  const hasMore = visibleCount < total;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
          <BookOpen className="h-6 w-6 text-primary" /> Logbook
        </h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {total > 0 ? (
            <>Showing {entries.length} of {total.toLocaleString()} event{total !== 1 ? "s" : ""}</>
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

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleFilterChange(null)}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium transition-colors border",
              !categoryFilter
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
            )}
          >
            All
          </button>
          {categories.map((cat) => {
            const meta = CATEGORY_META[cat] ?? DEFAULT_META;
            return (
              <button
                key={cat}
                onClick={() => handleFilterChange(cat === categoryFilter ? null : cat)}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-colors border",
                  cat === categoryFilter
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-hidden px-6 pb-6 pt-3">
        <div className="h-full overflow-auto">
          <div className="max-w-3xl mx-auto">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <BookOpen className="h-10 w-10 opacity-30" />
                <p className="text-sm">No log entries found.</p>
              </div>
            ) : (
              <>
                <div className="relative pl-10">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border/60" />

                  {entries.map((entry) => {
                    const body = cleanText(entry.text);
                    const meta = entry.category ? CATEGORY_META[entry.category] ?? DEFAULT_META : DEFAULT_META;
                    const Icon = meta.icon;
                    const extra = entry.extra_json ? JSON.parse(entry.extra_json) as Record<string, string> : null;
                    const money = extra?.money ? parseInt(extra.money, 10) : null;

                    return (
                      <div key={entry.id} className="relative pb-4 last:pb-0">
                        {/* Timeline dot */}
                        <div className="absolute left-[-28px] top-1.5 flex flex-col items-center">
                          <div
                            className={cn(
                              "w-[19px] h-[19px] rounded-full flex items-center justify-center shadow-md ring-2 ring-background z-10",
                              meta.dotColor
                            )}
                          >
                            <Icon className="h-[10px] w-[10px] text-white" />
                          </div>
                        </div>

                        {/* Content */}
                        <div className="group">
                          <div className="flex items-baseline gap-3 flex-wrap">
                            <span className="text-xs text-muted-foreground tabular-nums font-mono">
                              {formatTime(entry.time)}
                            </span>
                            <span className="text-sm font-semibold">{entry.title}</span>
                            {entry.faction_name && (
                              <span
                                className="text-[10px] font-semibold"
                                style={{ color: entry.faction_color ?? undefined }}
                              >
                                {entry.faction_name}
                              </span>
                            )}
                            <span className={cn("text-[10px] font-semibold uppercase tracking-wide opacity-70", meta.dotColor.replace("bg-", "text-"))}>
                              {meta.label}
                            </span>
                          </div>
                          {body && (
                            <p className="text-xs text-muted-foreground/70 mt-1 leading-relaxed whitespace-pre-wrap">
                              {body}
                            </p>
                          )}
                          {money != null && (
                            <div className="mt-1">
                              <Currency value={money} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Load more */}
                {hasMore && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-muted/30 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                    >
                      <ChevronDown className="h-4 w-4" />
                      Load more ({total - entries.length} remaining)
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
