import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { EntityIcon } from "../../components/EntityIcon";
import { FactionBadge } from "../../components/FactionBadge";
import { StatBar } from "../../components/StatBar";
import { Currency } from "../../components/Currency";
import { fmtSeconds } from "../../lib/wareFormat";
import { Badge } from "../../components/ui/badge";
import { SortHeader } from "../../components/ui/sort-header";
import type { FactionSummary } from "../../lib/map/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { PageTabs, PageTab } from "../../components/ui/page-tabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type BribeWare = {
  ware_id: string | null;
  ware_tags: string | null;
  amount: number | null;
};

type DiploAction = {
  action_id: string;
  category: string | null;
  name: string | null;
  description: string | null;
  hidden: number;
  cost_influence: number | null;
  cost_money: number | null;
  success_chance: number | null;
  duration_sec: number | null;
  cooldown_sec: number | null;
  agent_type: string | null;
  agent_experience: number | null;
  risk: string | null;
  bribe_wares: BribeWare[];
};

type DiploGift = { ware_id: string; faction_id: string };

type AgentRank = {
  min_value: number;
  name: string | null;
  event_bonus: number | null;
  icon: string | null;
};

type WareSummary = { ware_id: string; name: string; icon_url: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskColors(risk: string | null) {
  switch (risk) {
    case "veryhigh": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "high": return "bg-destructive/20 text-destructive border-destructive/30";
    case "medium": return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    case "low": return "bg-green-500/20 text-green-500 border-green-500/30";
    case "none":
    default:
      return "bg-muted text-muted-foreground border-transparent";
  }
}

function formatRisk(risk: string | null) {
  if (risk === "veryhigh") return "Very high";
  if (!risk || risk === "none") return "None";
  return risk;
}

// ─── Actions tab ──────────────────────────────────────────────────────────────

function ActionRow({ action }: { action: DiploAction & { requiredRank?: AgentRank | null } }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <TableCell className="w-6 text-muted-foreground">
          {action.bribe_wares.length > 0 || action.description
            ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
            : null}
        </TableCell>
        <TableCell>
          <p className="font-medium text-sm">{action.name ?? action.action_id}</p>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2 capitalize">
            {action.category === "negotiation" && <img src="/static/icons/diplomacy/diplomacy_negotiation.png" className="w-5 h-5" alt="" />}
            {action.category === "espionage" && <img src="/static/icons/diplomacy/diplomacy_espionage.png" className="w-5 h-5" alt="" />}
            {action.category === "interference" && <img src="/static/icons/diplomacy/diplomacy_interference.png" className="w-5 h-5" alt="" />}
            {action.category}
          </div>
        </TableCell>
        <TableCell>
          {action.requiredRank ? (
            <div className="flex items-center gap-2">
              {action.requiredRank.icon && <img src={`/static/icons/diplomacy/${action.requiredRank.icon}.png`} className="w-5 h-5 rounded-sm" alt="" />}
              <span className="text-xs font-medium">{action.requiredRank.name ?? `Rank`}</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
        <TableCell>
          {action.risk && action.risk !== "none" && (
            <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-semibold capitalize whitespace-nowrap", getRiskColors(action.risk))}>
              {formatRisk(action.risk)}
            </span>
          )}
        </TableCell>
        <TableCell>
          {action.success_chance != null ? (
            <StatBar 
              value={action.success_chance} 
              max={100} 
              width={100} 
              height={6} 
              labelRight={`${action.success_chance}%`} 
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell>
          {action.cost_influence != null && action.cost_influence > 0 ? (
            <div className="flex items-center gap-1.5 text-primary font-medium">
              <span className="text-sm">{action.cost_influence}</span>
              <img src="/static/icons/diplomacy/diplomacy_influence.png" className="w-5 h-5" alt="Influence" title="Influence Cost" />
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
        <TableCell>
          {action.cost_money != null && action.cost_money > 0 ? (
            <Currency value={action.cost_money} className="text-sm" />
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtSeconds(action.duration_sec)}</TableCell>
        <TableCell className="text-xs text-muted-foreground tabular-nums">{fmtSeconds(action.cooldown_sec)}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={9} className="px-8 py-3">
            {action.description && (
              <p className="text-sm text-muted-foreground mb-2">{action.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-xs">
              {action.agent_experience != null && (
                <span className="text-muted-foreground">Agent XP required: <span className="font-medium text-foreground">{action.agent_experience}</span></span>
              )}
              {action.bribe_wares.length > 0 && (
                <div>
                  <span className="text-muted-foreground mr-1">Bribe wares:</span>
                  {action.bribe_wares.map((bw, i) => (
                    <span key={i} className="font-medium text-foreground">
                      {bw.ware_id
                        ? `${bw.ware_id.replace(/_/g, " ")}${bw.amount ? ` ×${bw.amount}` : ""}`
                        : `[${bw.ware_tags} tag]`}
                      {i < action.bribe_wares.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ActionsTab() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedRisk, setSelectedRisk] = useState("all");
  const [selectedRank, setSelectedRank] = useState("all");
  const [sortKey, setSortKey] = useState<keyof DiploAction>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: actions = [], isLoading: actionsLoading } = useQuery<DiploAction[]>({
    queryKey: ["diplo-actions"],
    queryFn: () => fetch("/api/v1/diplomacy/actions?include_hidden=true").then((r) => r.json()),
  });

  const { data: ranks = [], isLoading: ranksLoading } = useQuery<AgentRank[]>({
    queryKey: ["diplo-ranks"],
    queryFn: () => fetch("/api/v1/diplomacy/agent-ranks").then((r) => r.json()),
  });

  const isLoading = actionsLoading || ranksLoading;

  const actionsWithRanks = useMemo(() => {
    return actions.map(action => {
      let requiredRank = null;
      if (action.agent_experience != null && ranks.length > 0) {
        requiredRank = ranks[0];
        for (const r of ranks) {
          if (r.min_value <= action.agent_experience) {
            requiredRank = r;
          }
        }
      }
      return { ...action, requiredRank };
    });
  }, [actions, ranks]);

  const filtered = actionsWithRanks.filter((a) =>
    (selectedCategory === "all" || a.category === selectedCategory) &&
    (selectedRisk === "all" || (a.risk ?? "none") === selectedRisk) &&
    (selectedRank === "all" || (a.requiredRank ? a.requiredRank.min_value.toString() : "none") === selectedRank)
  );

  const sorted = [...filtered].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];
    
    // Risk sorting logic (custom mapping)
    if (sortKey === "risk") {
      const riskOrder: Record<string, number> = { "none": 0, "low": 1, "medium": 2, "high": 3, "veryhigh": 4 };
      valA = riskOrder[a.risk ?? "none"] as any;
      valB = riskOrder[b.risk ?? "none"] as any;
    }

    if (valA === valB) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    const cmp = valA < valB ? -1 : 1;
    return sortDir === "asc" ? cmp : -cmp;
  });

  function handleSort(key: keyof DiploAction) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border/50 bg-muted/5">
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">All categories</div>
            </SelectItem>
            <SelectItem value="negotiation">
              <div className="flex items-center gap-2">
                <img src="/static/icons/diplomacy/diplomacy_negotiation.png" className="w-4 h-4" alt="" />
                Negotiation
              </div>
            </SelectItem>
            <SelectItem value="espionage">
              <div className="flex items-center gap-2">
                <img src="/static/icons/diplomacy/diplomacy_espionage.png" className="w-4 h-4" alt="" />
                Espionage
              </div>
            </SelectItem>
            <SelectItem value="interference">
              <div className="flex items-center gap-2">
                <img src="/static/icons/diplomacy/diplomacy_interference.png" className="w-4 h-4" alt="" />
                Interference
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedRisk} onValueChange={setSelectedRisk}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All risks" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="py-0.5">All risks</div>
            </SelectItem>
            <SelectItem value="none">
              <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-semibold capitalize whitespace-nowrap", getRiskColors("none"))}>None</span>
            </SelectItem>
            <SelectItem value="low">
              <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-semibold capitalize whitespace-nowrap", getRiskColors("low"))}>Low</span>
            </SelectItem>
            <SelectItem value="medium">
              <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-semibold capitalize whitespace-nowrap", getRiskColors("medium"))}>Medium</span>
            </SelectItem>
            <SelectItem value="high">
              <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-semibold capitalize whitespace-nowrap", getRiskColors("high"))}>High</span>
            </SelectItem>
            <SelectItem value="veryhigh">
              <span className={cn("inline-flex items-center border px-2 py-0.5 text-xs font-semibold capitalize whitespace-nowrap", getRiskColors("veryhigh"))}>Very high</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedRank} onValueChange={setSelectedRank}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All ranks" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all"><div className="py-0.5">All ranks</div></SelectItem>
            <SelectItem value="none"><div className="py-0.5 text-muted-foreground">No rank required</div></SelectItem>
            {ranks.map((r, i) => (
              <SelectItem key={r.min_value} value={r.min_value.toString()}>
                <div className="flex items-center gap-2">
                  {r.icon && <img src={`/static/icons/diplomacy/${r.icon}.png`} className="w-4 h-4 rounded-sm" alt="" />}
                  {r.name ?? `Rank ${i + 1}`}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{sorted.length} actions</span>
      </div>

      {isLoading ? (
        <PageLoaderPreset preset="factions" />
      ) : (
        <div className="flex-1 overflow-auto p-4">
          <Table className="text-xs">
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-6" />
                <SortHeader label="Action" className="min-w-[200px]" active={sortKey === "name"} dir={sortDir} onClick={() => handleSort("name")} />
                <SortHeader label="Category" className="w-36" active={sortKey === "category"} dir={sortDir} onClick={() => handleSort("category")} />
                <SortHeader label="Rank" className="w-40" active={sortKey === "agent_experience"} dir={sortDir} onClick={() => handleSort("agent_experience")} />
                <SortHeader label="Risk" className="w-36" active={sortKey === "risk"} dir={sortDir} onClick={() => handleSort("risk")} />
                <SortHeader label="Success" className="w-36" active={sortKey === "success_chance"} dir={sortDir} onClick={() => handleSort("success_chance")} />
                <SortHeader label="Influence" className="w-32" active={sortKey === "cost_influence"} dir={sortDir} onClick={() => handleSort("cost_influence")} />
                <SortHeader label="Credits" className="w-36" active={sortKey === "cost_money"} dir={sortDir} onClick={() => handleSort("cost_money")} />
                <SortHeader label="Duration" className="w-32" active={sortKey === "duration_sec"} dir={sortDir} onClick={() => handleSort("duration_sec")} />
                <SortHeader label="Cooldown" className="w-32" active={sortKey === "cooldown_sec"} dir={sortDir} onClick={() => handleSort("cooldown_sec")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((a) => <ActionRow key={a.action_id} action={a} />)}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Gifts tab ────────────────────────────────────────────────────────────────

function GiftsTab() {
  const { data: gifts = [], isLoading: giftsLoading } = useQuery<DiploGift[]>({
    queryKey: ["diplo-gifts"],
    queryFn: () => fetch("/api/v1/diplomacy/gifts").then((r) => r.json()),
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  const { data: wares = [] } = useQuery<WareSummary[]>({
    queryKey: ["wares"],
    queryFn: () => fetch("/api/v1/wares?limit=2000").then((r) => r.json()),
  });

  const factionMap = useMemo(() => new Map(factions.map((f) => [f.faction_id, f])), [factions]);
  const wareMap = useMemo(() => new Map(wares.map((w) => [w.ware_id, w])), [wares]);

  // Group gifts by faction
  const byFaction = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of gifts) {
      if (!map.has(g.faction_id)) map.set(g.faction_id, []);
      map.get(g.faction_id)!.push(g.ware_id);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const nameA = factionMap.get(a)?.name ?? a;
      const nameB = factionMap.get(b)?.name ?? b;
      return nameA.localeCompare(nameB);
    });
  }, [gifts, factionMap]);

  if (giftsLoading) return <PageLoaderPreset preset="factions" />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-muted/5">
        <p className="text-sm text-muted-foreground">
          Preferred gift items per faction. Giving these wares via the bribe system yields a positive relation bonus.
        </p>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {byFaction.map(([factionId, wareIds]) => {
            const faction = factionMap.get(factionId);
            return (
              <div key={factionId} className="rounded-md border border-border p-3">
                <div className="mb-2">
                  {faction ? (
                  <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} size="md" faction_id={faction.faction_id} />
                ) : (
                  <span className="text-sm font-medium">{factionId}</span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {wareIds.map((wareId) => {
                  const ware = wareMap.get(wareId);
                  return (
                    <div key={wareId} className="flex items-center gap-2">
                      <EntityIcon src={ware?.icon_url ?? null} alt={wareId} size={18} />
                      <span className="text-sm">{ware?.name ?? wareId.replace(/^inv_/, "").replace(/_/g, " ")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ─── Ranks tab ────────────────────────────────────────────────────────────────

function RanksTab() {
  const { data: ranks = [], isLoading } = useQuery<AgentRank[]>({
    queryKey: ["diplo-ranks"],
    queryFn: () => fetch("/api/v1/diplomacy/agent-ranks").then((r) => r.json()),
  });

  if (isLoading) return <PageLoaderPreset preset="factions" />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-border/50 bg-muted/5">
        <p className="text-sm text-muted-foreground">
          Agent rank is determined by accumulated experience. Higher ranks improve diplomatic event outcomes via the event bonus multiplier.
        </p>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <Table className="text-xs">
          <TableHeader className="bg-muted/40">
            <TableRow className="hover:bg-transparent">
              <TableHead>Rank</TableHead>
              <TableHead>Min XP</TableHead>
              <TableHead className="w-32">Event Bonus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranks.map((rank, i) => (
              <TableRow key={rank.min_value}>
                <TableCell className="font-medium">
                  {rank.icon ? (
                    <div className="flex items-center gap-2">
                      <img src={`/static/icons/diplomacy/${rank.icon}.png`} className="w-8 h-8 rounded" alt="" />
                      <span>{rank.name ?? `Rank ${i + 1}`}</span>
                    </div>
                  ) : (
                    rank.name ?? `Rank ${i + 1}`
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{rank.min_value}</TableCell>
                <TableCell>
                  <StatBar 
                    value={(rank.event_bonus ?? 1) * 40} 
                    max={100} 
                    width={100} 
                    height={6} 
                    labelRight={`×${rank.event_bonus?.toFixed(1)}`} 
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiplomacyPage() {
  const [activeTab, setActiveTab] = useState<"actions" | "gifts" | "ranks">("actions");

  const TABS = [
    { id: "actions", label: "Actions" },
    { id: "gifts", label: "Faction Gifts" },
    { id: "ranks", label: "Agent Ranks" }
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5">
        <h1 className="text-2xl font-bold tracking-tight">Diplomacy</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          Agent actions, faction gifts, and rank progression
        </p>
        <PageTabs>
          {TABS.map((t) => (
            <PageTab
              key={t.id}
              active={t.id === activeTab}
              onClick={() => setActiveTab(t.id as any)}
            >
              {t.label}
            </PageTab>
          ))}
        </PageTabs>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-4 flex flex-col">
        <HUDCard className="h-full overflow-hidden">
          {activeTab === "actions" && <ActionsTab />}
          {activeTab === "gifts" && <GiftsTab />}
          {activeTab === "ranks" && <RanksTab />}
        </HUDCard>
      </div>
    </div>
  );
}
