import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { EntityIcon } from "../components/EntityIcon";
import { FactionBadge } from "../components/FactionBadge";
import { StatBar } from "../components/StatBar";
import { Currency } from "../components/Currency";
import { Badge } from "../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

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

type FactionSummary = { faction_id: string; name: string; color_hex: string | null };

type WareSummary = { ware_id: string; name: string; icon_url: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSeconds(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

const CATEGORY_VARIANT: Record<string, "default" | "secondary" | "muted" | "outline" | "destructive"> = {
  negotiation: "default",
  espionage: "secondary",
  interference: "destructive",
};

const RISK_VARIANT: Record<string, "default" | "secondary" | "muted" | "outline" | "destructive"> = {
  none: "muted",
  low: "outline",
  medium: "secondary",
  high: "destructive",
};

// ─── Actions tab ──────────────────────────────────────────────────────────────

function ActionRow({ action }: { action: DiploAction }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-3 py-2.5 w-6 text-muted-foreground">
          {action.bribe_wares.length > 0 || action.description
            ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
            : null}
        </td>
        <td className="px-3 py-2.5">
          <p className="font-medium text-sm">{action.name ?? action.action_id}</p>
        </td>
        <td className="px-3 py-2.5">
          <Badge variant={CATEGORY_VARIANT[action.category ?? ""] ?? "muted"} className="text-xs capitalize">
            {action.category}
          </Badge>
        </td>
        <td className="px-3 py-2.5 text-xs">
          <div className="flex flex-col gap-0.5">
            {action.cost_influence != null && action.cost_influence > 0 && (
              <span className="text-primary font-medium">{action.cost_influence} inf</span>
            )}
            {action.cost_money != null && action.cost_money > 0 && (
              <Currency value={action.cost_money} className="text-xs" />
            )}
            {(!action.cost_influence || action.cost_influence === 0) && (!action.cost_money || action.cost_money === 0) && (
              <span className="text-muted-foreground">Free</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5">
          {action.success_chance != null ? (
            <div className="flex items-center gap-2">
              <StatBar value={action.success_chance} max={100} width={56} />
              <span className="text-xs tabular-nums text-muted-foreground">{action.success_chance}%</span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtSeconds(action.duration_sec)}</td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums">{fmtSeconds(action.cooldown_sec)}</td>
        <td className="px-3 py-2.5">
          {action.risk && action.risk !== "none" && (
            <Badge variant={RISK_VARIANT[action.risk] ?? "muted"} className="text-xs capitalize">{action.risk}</Badge>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/10">
          <td colSpan={8} className="px-8 py-3">
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
          </td>
        </tr>
      )}
    </>
  );
}

function ActionsTab() {
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { data: actions = [], isLoading } = useQuery<DiploAction[]>({
    queryKey: ["diplo-actions"],
    queryFn: () => fetch("/api/v1/diplomacy/actions?include_hidden=true").then((r) => r.json()),
  });

  const filtered = actions.filter((a) =>
    selectedCategory === "all" || a.category === selectedCategory
  );

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="negotiation">Negotiation</SelectItem>
            <SelectItem value="espionage">Espionage</SelectItem>
            <SelectItem value="interference">Interference</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} actions</span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-xs text-muted-foreground font-medium">
                <th className="px-3 py-2 w-6" />
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Cost</th>
                <th className="px-3 py-2 text-left">Success</th>
                <th className="px-3 py-2 text-left">Duration</th>
                <th className="px-3 py-2 text-left">Cooldown</th>
                <th className="px-3 py-2 text-left">Risk</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => <ActionRow key={a.action_id} action={a} />)}
            </tbody>
          </table>
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

  if (giftsLoading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Preferred gift items per faction. Giving these wares via the bribe system yields a positive relation bonus.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {byFaction.map(([factionId, wareIds]) => {
          const faction = factionMap.get(factionId);
          return (
            <div key={factionId} className="rounded-md border border-border p-3">
              <div className="mb-2">
                {faction ? (
                  <FactionBadge name={faction.name} color_hex={faction.color_hex} size="md" faction_id={faction.faction_id} />
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
  );
}

// ─── Ranks tab ────────────────────────────────────────────────────────────────

function RanksTab() {
  const { data: ranks = [], isLoading } = useQuery<AgentRank[]>({
    queryKey: ["diplo-ranks"],
    queryFn: () => fetch("/api/v1/diplomacy/agent-ranks").then((r) => r.json()),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading…</p>;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Agent rank is determined by accumulated experience. Higher ranks improve diplomatic event outcomes via the event bonus multiplier.
      </p>
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-xs text-muted-foreground font-medium text-left">
              <th className="px-4 py-2">Rank</th>
              <th className="px-4 py-2">Min XP</th>
              <th className="px-4 py-2">Event Bonus</th>
            </tr>
          </thead>
          <tbody>
            {ranks.map((rank, i) => (
              <tr key={rank.min_value} className="border-t border-border hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{rank.name ?? `Rank ${i + 1}`}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{rank.min_value}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <StatBar value={(rank.event_bonus ?? 1) * 40} max={100} width={64} />
                    <span className="text-xs tabular-nums text-muted-foreground">×{rank.event_bonus?.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiplomacyPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-2xl font-bold">Diplomacy</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Agent actions, faction gifts, and rank progression
        </p>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">
        <Tabs defaultValue="actions">
          <TabsList className="mb-5">
            <TabsTrigger value="actions">Actions</TabsTrigger>
            <TabsTrigger value="gifts">Faction Gifts</TabsTrigger>
            <TabsTrigger value="ranks">Agent Ranks</TabsTrigger>
          </TabsList>
          <TabsContent value="actions"><ActionsTab /></TabsContent>
          <TabsContent value="gifts"><GiftsTab /></TabsContent>
          <TabsContent value="ranks"><RanksTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
