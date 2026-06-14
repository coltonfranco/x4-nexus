import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSettings } from "../../lib/settingsStore";
import { ArrowLeft, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../components/ui/tooltip";
import { EntityIcon } from "../../components/EntityIcon";
import { Badge } from "../../components/ui/badge";
import { getReputationScore } from "../../lib/formatters";
import type { FactionSummary } from '../../lib/map/types';
import { Reputation } from "../../components/GameValues";
import { Currency } from "../../components/Currency";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { PageTabs, PageTab } from "../../components/ui/page-tabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type AllFactionRelation = {
  faction_id: string;
  other_faction_id: string;
  initial_relation: number;
};

type FactionDetail = FactionSummary & {
  primary_race: string | null;
  description: string | null;
  tags: string | null;
};

type FactionRelation = {
  other_faction_id: string;
  initial_relation: number;
};

type MapSummary = {
  name: string | null;
};

type FactionLicence = {
  licence_type: string;
  faction_id: string;
  name: string | null;
  description: string | null;
  icon: string | null;
  precursor: string | null;
  price: number | null;
  min_relation: number | null;
};

type MetricKey = "military_score" | "economic_score" | "diplomatic_score" | "territory_score";

type FactionStrength = {
  faction_id: string;
  name: string;
  color_hex: string | null;
  military_score: number;
  economic_score: number;
  diplomatic_score: number;
  territory_score: number;
  fight_ship_count: number;
  trade_ship_count: number;
  mine_ship_count: number;
  military_station_count: number;
  economic_station_count: number;
  sector_count: number;
  cluster_count: number;
  avg_relation: number;  // game-scale -30..30
};

// ─── Metric definitions ───────────────────────────────────────────────────────

const METRICS: {
  key: MetricKey;
  label: string;
  color: string;
  detail: (f: FactionStrength) => string;
}[] = [
  {
    key: "military_score",
    label: "Military",
    color: "var(--destructive)",
    detail: (f) =>
      `${f.fight_ship_count} combat ships · ${f.military_station_count} military stations`,
  },
  {
    key: "economic_score",
    label: "Economic",
    color: "var(--success)",
    detail: (f) =>
      `${f.economic_station_count} stations · ${f.trade_ship_count} traders · ${f.mine_ship_count} miners`,
  },
  {
    key: "diplomatic_score",
    label: "Diplomatic",
    color: "var(--info)",
    detail: (f) => `avg relation ${f.avg_relation.toFixed(1)} / 30`,
  },
  {
    key: "territory_score",
    label: "Territory",
    color: "hsl(38 92% 50%)",
    detail: (f) => `${f.sector_count} sectors · ${f.cluster_count} clusters`,
  },
];

// ─── StandingsView ────────────────────────────────────────────────────────────

function StandingsView({ onSelectFaction }: { onSelectFaction: (id: string) => void }) {
  const { data: strength = [], isLoading } = useQuery<FactionStrength[]>({
    queryKey: ["factions-strength"],
    queryFn: () => fetch("/api/v1/factions/strength").then((r) => r.json()),
    staleTime: 30_000,
  });

  const byMetric = useMemo(
    () =>
      METRICS.map((m) => ({
        ...m,
        ranked: [...strength]
          .sort((a, b) => b[m.key] - a[m.key])
          .filter((f) => f[m.key] > 0)
          .slice(0, 8),
      })),
    [strength]
  );

  if (isLoading) return <div className="h-full flex flex-col justify-center text-sm text-muted-foreground"><PageLoaderPreset preset="factions" /></div>;

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-2 gap-4">
        {byMetric.map((m) => (
          <div key={m.key} className="rounded-md border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/20 border-b border-border flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
              <span className="text-sm font-semibold" style={{ color: m.color }}>
                {m.label}
              </span>
            </div>
            <div className="divide-y divide-border/40">
              {m.ranked.map((f, i) => (
                <div
                  key={f.faction_id}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 cursor-pointer transition-colors"
                  onClick={() => onSelectFaction(f.faction_id)}
                >
                  <span className="text-xs text-muted-foreground w-4 tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: f.color_hex ?? "#888" }}
                  />
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-sm truncate flex-1 min-w-0 text-left">{f.name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {m.detail(f)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${f[m.key]}%`, backgroundColor: m.color }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-6 text-right">
                      {f[m.key].toFixed(0)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── FactionDetailPanel ───────────────────────────────────────────────────────

function FactionDetailPanel({ factionId, onClose }: { factionId: string; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<"overview" | "diplomacy" | "licences">("overview");

  const { data: faction, isLoading: factionLoading } = useQuery<FactionDetail>({
    queryKey: ["faction", factionId],
    queryFn: () => fetch(`/api/v1/factions/${factionId}`).then((r) => r.json()),
  });

  const { data: licences = [], isLoading: licencesLoading } = useQuery<FactionLicence[]>({
    queryKey: ["faction-licences", factionId],
    queryFn: () => fetch(`/api/v1/licences?faction_id=${factionId}`).then((r) => r.json()),
  });

  const { data: allFactions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  const { data: relations = [] } = useQuery<FactionRelation[]>({
    queryKey: ["faction-relations", factionId],
    queryFn: () => fetch(`/api/v1/factions/${factionId}/relations`).then((r) => r.json()),
  });

  const { data: sectors = [] } = useQuery<MapSummary[]>({
    queryKey: ["faction-sectors", factionId],
    queryFn: () => fetch(`/api/v1/map/sectors?owner_faction=${factionId}`).then((r) => r.json()),
  });

  const { data: clusters = [] } = useQuery<MapSummary[]>({
    queryKey: ["faction-clusters", factionId],
    queryFn: () => fetch(`/api/v1/map/clusters?owner_faction=${factionId}`).then((r) => r.json()),
  });

  const { data: strengthData = [] } = useQuery<FactionStrength[]>({
    queryKey: ["factions-strength"],
    queryFn: () => fetch("/api/v1/factions/strength").then((r) => r.json()),
    staleTime: 30_000,
  });

  const strengthEntry = strengthData.find((f) => f.faction_id === factionId);

  const ranks = useMemo(() => {
    const result = {} as Record<MetricKey, number | null>;
    for (const m of METRICS) {
      const score = strengthData.find((f) => f.faction_id === factionId)?.[m.key] ?? 0;
      if (score === 0) { result[m.key] = null; continue; }
      const sorted = [...strengthData].filter((f) => f[m.key] > 0).sort((a, b) => b[m.key] - a[m.key]);
      const idx = sorted.findIndex((f) => f.faction_id === factionId);
      result[m.key] = idx >= 0 ? idx + 1 : null;
    }
    return result;
  }, [strengthData, factionId]);

  const allies = useMemo(() => {
    return relations
      .filter((r) => getReputationScore(r.initial_relation) >= 10)
      .map((r) => ({ rel: r, f: allFactions.find((x) => x.faction_id === r.other_faction_id) }))
      .sort((a, b) => b.rel.initial_relation - a.rel.initial_relation);
  }, [relations, allFactions]);

  const enemies = useMemo(() => {
    return relations
      .filter((r) => getReputationScore(r.initial_relation) <= -10)
      .map((r) => ({ rel: r, f: allFactions.find((x) => x.faction_id === r.other_faction_id) }))
      .sort((a, b) => a.rel.initial_relation - b.rel.initial_relation);
  }, [relations, allFactions]);

  if (factionLoading || licencesLoading) {
    return <div className="p-6 text-muted-foreground text-sm"><PageLoaderPreset preset="factions" /></div>;
  }
  if (!faction) return null;

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="px-6 pt-5 pb-0 shrink-0 border-b border-border/50">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex items-center gap-4">
          {faction.icon_url ? (
            <span
              style={{
                width: 56,
                height: 56,
                flexShrink: 0,
                backgroundColor: faction.color_hex ?? "var(--foreground)",
                WebkitMaskImage: `url(${faction.icon_url})`,
                WebkitMaskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskImage: `url(${faction.icon_url})`,
                maskSize: "contain",
                maskRepeat: "no-repeat",
                maskPosition: "center",
              }}
            />
          ) : (
            <EntityIcon src={null} alt={faction.name} size={56} />
          )}
          <div>
            <h2 className="text-xl font-bold" style={{ color: faction.color_hex ?? "inherit" }}>
              {faction.name}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {faction.short_name && <Badge variant="secondary">{faction.short_name}</Badge>}
              {faction.primary_race && (
                <Badge variant="outline" className="capitalize flex items-center gap-1.5">
                  <img
                    src={`/static/icons/races/race_${faction.primary_race}.png`}
                    alt={faction.primary_race}
                    className="w-4 h-4 object-contain"
                    onError={(e) => (e.currentTarget.style.display = "none")}
                  />
                  {faction.primary_race}
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <PageTabs className="mt-6 gap-2 mb-[-1px]">
          <PageTab active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
            Overview
          </PageTab>
          <PageTab active={activeTab === "diplomacy"} onClick={() => setActiveTab("diplomacy")}>
            Diplomacy
          </PageTab>
          {licences.length > 0 && (
            <PageTab active={activeTab === "licences"} onClick={() => setActiveTab("licences")}>
              Licences <span className="text-xs text-muted-foreground ml-1">{licences.length}</span>
            </PageTab>
          )}
        </PageTabs>
      </div>

      <div className="flex flex-col flex-1 min-h-0 pt-4">
        {activeTab === "overview" && (
          <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
            <div className="max-w-4xl space-y-6">
              {strengthEntry && (
                <div className="grid grid-cols-4 gap-3">
                  {METRICS.map((m) => {
                    const rank = ranks[m.key];
                    const score = strengthEntry[m.key];
                    const medal =
                      rank === 1 ? "#FFD700" : rank === 2 ? "#C0C0C0" : rank === 3 ? "#CD7F32" : null;
                    return (
                      <div
                        key={m.key}
                        className="rounded-md border border-border bg-muted/10 p-3 flex flex-col gap-2"
                      >
                        <p className="text-xs text-muted-foreground">{m.label}</p>
                        <div className="flex items-baseline gap-2">
                          <p
                            className="text-2xl font-bold tabular-nums leading-none"
                            style={{ color: rank != null ? (medal ?? m.color) : undefined }}
                          >
                            {rank != null ? `#${rank}` : "—"}
                          </p>
                          {rank != null && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {score.toFixed(0)}/100
                            </span>
                          )}
                        </div>
                        <div className="h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${score}%`, backgroundColor: score > 0 ? m.color : undefined }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">{m.detail(strengthEntry)}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {faction.description && (
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {faction.description.replace(/\\n/g, "\n")}
                </p>
              )}

              {(clusters.length > 0 || sectors.length > 0) && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Territory Owned
                  </p>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-semibold">{clusters.length}</span> Clusters
                    </p>
                    <p>
                      <span className="font-semibold">{sectors.length}</span> Sectors
                    </p>
                    {sectors.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sectors.map((s, i) => (
                          <Badge key={i} variant="secondary">
                            {s.name || "Unknown Sector"}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "diplomacy" && (
          <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
            {allies.length > 0 || enemies.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 max-w-3xl">
                {allies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Friendly (+10 to +30)
                    </p>
                    <div className="space-y-2">
                      {allies.map(({ rel, f }) => (
                        <div
                          key={rel.other_faction_id}
                          className="flex items-center justify-between text-sm bg-muted/20 p-2 rounded"
                        >
                          <div className="flex items-center gap-2">
                            {f?.color_hex && (
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: f.color_hex }}
                              />
                            )}
                            <span className="truncate">{f?.name || rel.other_faction_id}</span>
                          </div>
                          <Reputation value={getReputationScore(rel.initial_relation)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {enemies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                      Hostile (-10 to -30)
                    </p>
                    <div className="space-y-2">
                      {enemies.map(({ rel, f }) => (
                        <div
                          key={rel.other_faction_id}
                          className="flex items-center justify-between text-sm bg-muted/20 p-2 rounded"
                        >
                          <div className="flex items-center gap-2">
                            {f?.color_hex && (
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: f.color_hex }}
                              />
                            )}
                            <span className="truncate">{f?.name || rel.other_faction_id}</span>
                          </div>
                          <Reputation value={getReputationScore(rel.initial_relation)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No extreme relations found for this faction.</p>
            )}
          </div>
        )}

        {licences.length > 0 && activeTab === "licences" && (
          <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
            <div className="flex flex-col text-sm border-t border-b border-border/50 max-w-4xl">
              {licences.map((l, i) => {
                const displayName =
                  l.name ||
                  l.licence_type
                    .replace(/([A-Z])/g, " $1")
                    .replace(/_/g, " ")
                    .trim()
                    .replace(/\b\w/g, (c) => c.toUpperCase());

                return (
                  <div
                    key={l.licence_type}
                    className={`flex items-center px-6 py-3 ${i % 2 === 0 ? "bg-muted/5" : "bg-transparent"} border-b border-border/50 gap-4 last:border-b-0`}
                  >
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-medium text-foreground">{displayName}</span>
                      {l.description && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">
                              <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs text-sm leading-relaxed p-3">
                              {l.description}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    <div className="text-right w-28 shrink-0">
                      {l.price != null && <Currency value={l.price} />}
                    </div>

                    <div className="text-right w-20 shrink-0">
                      {l.min_relation != null && (
                        <span title="Required Relation" className="text-xs text-muted-foreground whitespace-nowrap">
                          Rep: <Reputation value={getReputationScore(l.min_relation)} />
                        </span>
                      )}
                    </div>

                    <div className="text-left w-48 shrink-0">
                      {l.precursor && (
                        <span title="Required Precursor Licence" className="text-xs text-muted-foreground whitespace-nowrap">
                          Requires: {l.precursor.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MatrixView ───────────────────────────────────────────────────────────────

function MatrixView({
  factions,
  relations,
  onSelectFaction,
}: {
  factions: FactionSummary[];
  relations: AllFactionRelation[];
  onSelectFaction: (id: string) => void;
}) {
  const relMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of relations) {
      m.set(`${r.faction_id}::${r.other_faction_id}`, r.initial_relation);
    }
    return m;
  }, [relations]);

  return (
    <div className="overflow-auto h-full p-4">
      <table
        style={{
          borderCollapse: "collapse",
          fontSize: 11,
          whiteSpace: "nowrap",
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                width: 140,
                minWidth: 140,
                padding: "4px 8px",
                textAlign: "left",
                position: "sticky",
                left: 0,
                top: 0,
                background: "rgba(16, 20, 34, 0.95)",
                backdropFilter: "blur(4px)",
                zIndex: 3,
                borderBottom: "1px solid var(--border)",
                borderRight: "1px solid var(--border)",
                fontWeight: 600,
                color: "var(--muted-foreground)",
              }}
            >
              From \ To
            </th>
            {factions.map((f) => (
              <th
                key={f.faction_id}
                title={f.name}
                onClick={() => onSelectFaction(f.faction_id)}
                style={{
                  padding: "6px 0",
                  height: 140,
                  width: 44,
                  minWidth: 44,
                  maxWidth: 44,
                  color: f.color_hex ?? "var(--foreground)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--border)",
                  verticalAlign: "bottom",
                  cursor: "pointer",
                  position: "sticky",
                  top: 0,
                  background: "rgba(16, 20, 34, 0.95)",
                  backdropFilter: "blur(4px)",
                  zIndex: 2,
                }}
                className="hover:bg-muted/50"
              >
                <div className="flex flex-col items-center justify-end h-full gap-2 pb-1">
                  <span
                    style={{
                      writingMode: "vertical-lr",
                      transform: "rotate(180deg)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxHeight: "100px",
                    }}
                  >
                    {f.name}
                  </span>
                  {f.icon_url && (
                    <div style={{
                      width: '18px', height: '18px', flexShrink: 0,
                      backgroundColor: f.color_hex ?? 'var(--foreground)',
                      WebkitMaskImage: `url(${f.icon_url})`,
                      WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
                    }} />
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factions.map((from) => (
            <tr key={from.faction_id}>
              <td
                onClick={() => onSelectFaction(from.faction_id)}
                style={{
                  padding: "4px 8px",
                  fontWeight: 600,
                  color: from.color_hex ?? "var(--foreground)",
                  position: "sticky",
                  left: 0,
                  background: "rgba(16, 20, 34, 0.95)",
                  backdropFilter: "blur(4px)",
                  zIndex: 1,
                  borderRight: "1px solid var(--border)",
                  borderBottom: "1px solid var(--border)",
                  maxWidth: 160,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
                className="hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  {from.icon_url && (
                    <div style={{
                      width: '18px', height: '18px', flexShrink: 0,
                      backgroundColor: from.color_hex ?? 'var(--foreground)',
                      WebkitMaskImage: `url(${from.icon_url})`,
                      WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center',
                    }} />
                  )}
                  <span className="truncate">{from.name}</span>
                </div>
              </td>
              {factions.map((to) => {
                if (from.faction_id === to.faction_id) {
                  return (
                    <td
                      key={to.faction_id}
                      style={{
                        padding: "6px 4px",
                        textAlign: "center",
                        background: "var(--muted)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      —
                    </td>
                  );
                }
                const rawVal = relMap.get(`${from.faction_id}::${to.faction_id}`);
                const val = rawVal != null ? getReputationScore(rawVal) : null;

                let cellClass = "bg-transparent text-muted-foreground";
                if (val != null) {
                  if (val >= 20) cellClass = "bg-emerald-600 text-white font-bold";
                  else if (val >= 10) cellClass = "bg-emerald-800/80 text-emerald-100 font-medium";
                  else if (val <= -20) cellClass = "bg-red-700 text-white font-bold";
                  else if (val <= -10) cellClass = "bg-red-900/80 text-red-100 font-medium";
                  else if (val !== 0) cellClass = "bg-muted/30 text-muted-foreground";
                }

                return (
                  <td
                    key={to.faction_id}
                    title={val != null ? `${from.name} → ${to.name}: ${val.toFixed(1)}` : undefined}
                    className={cellClass}
                    style={{
                      padding: "6px 4px",
                      textAlign: "center",
                      borderBottom: "1px solid var(--border)",
                      width: 44,
                      minWidth: 44,
                      cursor: "help",
                    }}
                  >
                    {val != null ? val.toFixed(0) : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FactionsPage() {
  const search = useSearch({ strict: false }) as { faction?: string };
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(search.faction ?? null);
  const [view, setView] = useState<"standings" | "matrix">("standings");
  const { settings } = useSettings();

  // Deep-link: ?faction=argon preselects (e.g. from the Empire reputation list).
  useEffect(() => {
    if (search.faction) setSelectedFactionId(search.faction);
  }, [search.faction]);

  const { data: knownFactions = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["factions-known"],
    queryFn: () => fetch("/api/v1/factions/known").then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: factions = [], isLoading: factionsLoading } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
  });

  const visibleFactions = useMemo(() => {
    if (!settings.fogOfWar) return factions;
    return factions.filter((f) => knownFactions[f.faction_id] !== false);
  }, [factions, knownFactions, settings.fogOfWar]);

  const { data: relations = [], isLoading: relationsLoading } = useQuery<AllFactionRelation[]>({
    queryKey: ["faction-relations"],
    queryFn: () => fetch("/api/v1/faction-relations").then((r) => r.json()),
  });

  const loading = factionsLoading || relationsLoading;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Factions</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {visibleFactions.length} factions · {relations.length} relation pairs
        </p>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-4 flex flex-col">
        <HUDCard className="h-full">
          <div className="flex flex-1 min-h-0 relative z-10">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 border-r border-border/50 overflow-y-auto bg-black/20">
          <p className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b border-border">
            Factions
          </p>
          <ul className="py-2">
            {visibleFactions.map((f) => {
              const isActive = selectedFactionId === f.faction_id;
              return (
                <li
                  key={f.faction_id}
                  className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                  onClick={() => setSelectedFactionId(f.faction_id)}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      backgroundColor: f.color_hex ?? "#888",
                      flexShrink: 0,
                    }}
                  />
                  <span className="truncate">{f.name}</span>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              <PageLoaderPreset preset="factions" />
            </div>
          ) : selectedFactionId ? (
            <FactionDetailPanel
              factionId={selectedFactionId}
              onClose={() => setSelectedFactionId(null)}
            />
          ) : (
            <>
              {/* View toggle */}
              <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/10 shrink-0">
                {(["standings", "matrix"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`text-xs px-3 py-1.5 rounded transition-colors ${
                      view === v
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                  >
                    {v === "standings" ? "Standings" : "Relation Matrix"}
                  </button>
                ))}
              </div>

              {view === "standings" ? (
                <StandingsView onSelectFaction={setSelectedFactionId} />
              ) : (
                <MatrixView
                  factions={visibleFactions}
                  relations={relations}
                  onSelectFaction={setSelectedFactionId}
                />
              )}
            </>
          )}
        </div>
          </div>
        </HUDCard>
      </div>
    </div>
  );
}
