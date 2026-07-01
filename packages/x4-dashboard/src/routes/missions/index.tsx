import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
// (no lucide icons needed directly — used in sub-components)
import { MultiSelect } from "../../components/ui/multi-select";
import { FactionCombobox } from "../../components/FactionCombobox";
import { PageLoaderPreset } from "../../components/PageLoader";
import { MissionMapModal } from "../../components/MissionMapModal";
import type { MapObjective } from "../../components/MissionMapModal";
import type { FactionSummary } from "../../lib/map/types";
import { useSaveTime } from "../../lib/useSaveTime";

import type {
  Mission,
  MissionOffer,
  PlayerStat,
  Difficulty,
  MissionType,
  Bucket,
} from "./types";
import {
  DIFFICULTY_KEYS,
  DIFFICULTY_LABEL,
  LEVEL_COLORS,
} from "./types";
import {
  typeColor,
  typeLabel,
} from "./helpers";
import { MissionCard } from "./MissionCard";
import { OfferCard } from "./OfferCard";
import { GroupCard, deriveGroupKind } from "./GroupCard";
import { MissionDetail } from "./MissionDetail";
import { ChoiceGroupDetail } from "./ChoiceGroupDetail";
import type { PathOption } from "./ChoiceGroupDetail";
import { AllRequiredGroupDetail } from "./AllRequiredGroupDetail";
import type { SubStage } from "./AllRequiredGroupDetail";
import { RunPlanner } from "./RunPlanner";
import { apiGet } from "../../lib/api";

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MissionsPage() {
  // Tab state: "board" or "run"
  const [tab, setTab] = useState<"board" | "run">("board");
  // Bucket: active / offer / guild
  const [bucket, setBucket] = useState<Bucket>("active");
  // Selection
  const [selectedKind, setSelectedKind] = useState<"mission" | "choice" | "all">("mission");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Run planner
  const [runIds, setRunIds] = useState<string[]>([]);
  // Map modal
  const [mapModal, setMapModal] = useState<{
    sectorId: string | null;
    objectives: MapObjective[];
    title?: string;
  } | null>(null);

  // Filters
  const [difficultyFilter, setDifficultyFilter] = useState<Set<Difficulty>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<MissionType>>(new Set());
  const [factionFilter, setFactionFilter] = useState<string>("all");
  const [storyOnly, setStoryOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Data ─────────────────────────────────────────────────────────────────

  const { data: missions, isLoading: missionsLoading } = useQuery<Mission[]>({
    queryKey: ["missions"],
    queryFn: () => apiGet<Mission[]>("/api/v1/missions"),
    staleTime: 30_000,
  });

  const { data: offers, isLoading: offersLoading } = useQuery<MissionOffer[]>({
    queryKey: ["mission-offers"],
    queryFn: () => apiGet<MissionOffer[]>("/api/v1/missions/offers?exclude_tutorials=true"),
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<PlayerStat[]>({
    queryKey: ["player-stats"],
    queryFn: () => apiGet<PlayerStat[]>("/api/v1/player/stats"),
    staleTime: 60_000,
  });

  const { data: factions } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => apiGet<FactionSummary[]>("/api/v1/factions"),
    staleTime: 300_000,
  });

  const factionMap = useMemo(() => {
    const map = new Map<string, FactionSummary>();
    for (const f of factions ?? []) map.set(f.faction_id, f);
    return map;
  }, [factions]);

  const saveTime = useSaveTime();
  const nowSec = saveTime > 0 ? saveTime : null;

  // ── Filters ──────────────────────────────────────────────────────────────

  const nameMatch = (name: string | null) => {
    if (!searchQuery.trim()) return true;
    return (name ?? "").toLowerCase().includes(searchQuery.toLowerCase());
  };

  const filterMission = (m: Mission) => {
    if (!nameMatch(m.name)) return false;
    if (difficultyFilter.size > 0 && !difficultyFilter.has(m.level as Difficulty)) return false;
    if (typeFilter.size > 0 && m.type && !typeFilter.has(m.type)) return false;
    if (factionFilter !== "all" && m.faction !== factionFilter) return false;
    if (storyOnly && !m.is_story) return false;
    return true;
  };

  const filterOffer = (o: MissionOffer) => {
    if (!nameMatch(o.name)) return false;
    if (storyOnly) return false;
    if (difficultyFilter.size > 0 && !difficultyFilter.has(o.level as Difficulty)) return false;
    if (typeFilter.size > 0 && o.type && !typeFilter.has(o.type)) return false;
    if (factionFilter !== "all" && o.faction !== factionFilter) return false;
    return true;
  };

  // ── Derived lists ────────────────────────────────────────────────────────

  const activeMissions = (missions ?? []).filter((m) => m.is_active && filterMission(m));
  const inactiveMissions = (missions ?? []).filter((m) => !m.is_active && filterMission(m));
  const repeatableOffers = (offers ?? []).filter((o) => o.is_repeatable && filterOffer(o));
  const oneShotOffers = (offers ?? []).filter((o) => !o.is_repeatable && filterOffer(o));

  // Group missions with same group_id
  const activeRenderItems = useMemo(() => {
    const all = [...activeMissions, ...inactiveMissions];
    const groupSize = new Map<string, number>();
    for (const m of all) {
      if (m.group_id) groupSize.set(m.group_id, (groupSize.get(m.group_id) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const items: Array<
      | { kind: "card"; mission: Mission }
      | { kind: "group"; groupId: string; groupName: string | null; missions: Mission[] }
    > = [];
    for (const m of all) {
      if (seen.has(m.mission_id!)) continue;
      if (m.group_id && (groupSize.get(m.group_id) ?? 0) > 1) {
        const siblings = all.filter(
          (s) => s.group_id === m.group_id && !seen.has(s.mission_id!),
        );
        siblings.forEach((s) => seen.add(s.mission_id!));
        items.push({
          kind: "group",
          groupId: m.group_id,
          groupName: siblings[0]?.group_name ?? null,
          missions: siblings,
        });
      } else {
        seen.add(m.mission_id!);
        items.push({ kind: "card", mission: m });
      }
    }
    return items;
  }, [activeMissions, inactiveMissions]);

  // Build items for current bucket
  const bucketItems = useMemo(() => {
    if (bucket === "active") return activeRenderItems;
    if (bucket === "guild") {
      // Guild offers as individual cards
      return repeatableOffers.map((o) => ({ kind: "offer" as const, offer: o }));
    }
    // One-shot offers
    return oneShotOffers.map((o) => ({ kind: "offer" as const, offer: o }));
  }, [bucket, activeRenderItems, repeatableOffers, oneShotOffers]);

  // ── Stats ────────────────────────────────────────────────────────────────

  const accepted = stats?.find((s) => s.stat_id === "missions_accepted")?.value ?? 0;
  const completed = stats?.find((s) => s.stat_id === "missions_completed")?.value ?? 0;

  const availableFactionIds = [
    ...new Set([
      ...(missions ?? []).map((m) => m.faction).filter(Boolean),
      ...(offers ?? []).map((o) => o.faction).filter(Boolean),
    ]),
  ].sort() as string[];

  const availableTypes = [
    ...new Set([
      ...(missions ?? []).map((m) => m.type).filter(Boolean),
      ...(offers ?? []).map((o) => o.type).filter(Boolean),
    ]),
  ].sort() as string[];

  const factionSummaries: FactionSummary[] = (factions ?? [])
    .filter((f) => availableFactionIds.includes(f.faction_id))
    .map((f) => ({ ...f }));

  // ── Selected detail ──────────────────────────────────────────────────────

  // Look up selected item — could be a mission or an offer.
  // Map offers to a Mission-like shape so MissionDetail can render them.
  const selectedMission = useMemo(() => {
    if (!selectedId) return null;
    const m = (missions ?? []).find((x) => x.mission_id === selectedId);
    if (m) return m;
    const o = (offers ?? []).find((x) => x.offer_id === selectedId);
    if (!o) return null;
    // Map offer fields to a Mission shape
    return {
      mission_id: o.offer_id,
      name: o.name,
      description: o.description,
      faction: o.faction,
      type: o.type,
      level: o.level,
      is_active: false,
      priority: null,
      abortable: null,
      associated_entity: o.station_id,
      associated_entity_name: o.station_name ?? o.actor_name,
      associated_entity_kind: "station" as const,
      associated_entity_sector_id: o.station_sector_id,
      associated_entity_zone_id: o.station_zone_id,
      associated_entity_x: o.station_x,
      associated_entity_y: null as number | null,
      associated_entity_z: o.station_z,
      group_id: o.group_id,
      group_name: null,
      is_story: false,
      rewardtext: o.rewardtext,
      reward_credits: o.reward_credits,
      opposing_faction: o.opposing_faction,
      caption: o.actor_name,
      icon: null,
      time: null,
      objectives: [],
    } satisfies Mission;
  }, [selectedId, missions, offers]);

  const selectedGroup = selectedId
    ? (() => {
        const siblings = (missions ?? []).filter((m) => m.group_id === selectedId);
        if (siblings.length <= 1) return null;
        return {
          groupId: selectedId,
          groupName: siblings[0]?.group_name ?? null,
          missions: siblings,
        };
      })()
    : null;

  // ── Loading ──────────────────────────────────────────────────────────────

  if (missionsLoading || offersLoading) {
    return <PageLoaderPreset preset="missions" />;
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  const bucketCounts = {
    active: activeRenderItems.length,
    guild: repeatableOffers.length,
    offer: oneShotOffers.length,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="h-[50px] shrink-0 border-b border-border flex items-center gap-2 px-6 bg-background/60">
        <button
          onClick={() => setTab("board")}
          className="flex items-center gap-2 text-[13px] px-3.5 py-2 rounded-lg transition-colors"
          style={{
            background: tab === "board" ? "rgba(92,200,236,0.14)" : "transparent",
            color: tab === "board" ? "#cfe6f7" : "#7a8499",
          }}
        >
          <span className="text-sm">◎</span> Mission Board
        </button>
        <button
          onClick={() => setTab("run")}
          className="flex items-center gap-2 text-[13px] px-3.5 py-2 rounded-lg transition-colors"
          style={{
            background: tab === "run" ? "rgba(92,200,236,0.14)" : "transparent",
            color: tab === "run" ? "#cfe6f7" : "#7a8499",
          }}
        >
          <span className="text-sm">⛓</span> Run Planner
          {runIds.length > 0 && (
            <span
              className="font-mono text-[11px] font-semibold min-w-[18px] h-[18px] px-1.5 rounded-full inline-flex items-center justify-center"
              style={{
                background: tab === "run" ? "#5cc8ec" : "rgba(255,255,255,0.1)",
                color: tab === "run" ? "#06121c" : "#8a95ab",
              }}
            >
              {runIds.length}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-2.5 font-mono text-[11px] tracking-[1px] text-muted-foreground">
          <span
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: "#34d399" }}
          />
          {completed}/{accepted} completed
        </div>
      </div>

      {/* Master + Detail */}
      <div className="flex-1 min-h-0 flex">
        {/* ===== MASTER LIST ===== */}
        <div className="w-[438px] shrink-0 border-r border-border flex flex-col bg-background/40">
          {/* Header */}
          <div className="shrink-0 px-5 pt-4 pb-3">
            <h1 className="text-[22px] font-semibold tracking-[0.3px]">Missions</h1>
            <p className="text-[10.5px] tracking-[1.5px] text-muted-foreground mt-1 font-mono uppercase">
              MISSION BOARD · {completed}/{accepted} COMPLETED
            </p>

            {/* Bucket tabs */}
            <div className="flex gap-[3px] bg-[#0c1322] border border-border/40 rounded-lg p-[3px] mt-3.5">
              {([
                ["active", "Active"],
                ["offer", "Offers"],
                ["guild", "Guild & War"],
              ] as const).map(([k, label]) => {
                const active = bucket === k;
                return (
                  <button
                    key={k}
                    onClick={() => { setBucket(k as Bucket); setSelectedId(null); }}
                    className="flex-1 text-center py-1.5 rounded-md text-xs font-medium transition-colors"
                    style={{
                      background: active ? "#1d4f8a" : "transparent",
                      color: active ? "#fff" : "#8a95ab",
                    }}
                  >
                    {label}{" "}
                    <span className="font-mono text-[11px] opacity-80">
                      {bucketCounts[k]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filter row */}
            <div className="flex items-center gap-2.5 mt-2.5">
              <input
                type="text"
                placeholder="Filter missions…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#0c1322] border border-border/40 rounded-lg px-3 py-2 text-foreground text-[12.5px] placeholder:text-muted-foreground/50 outline-none focus:border-[#3b9ae1]/50 transition-colors"
              />
              <div
                onClick={() => setStoryOnly(!storyOnly)}
                className="flex items-center gap-1.5 bg-[#0c1322] border border-border/40 rounded-lg px-3 py-2 cursor-pointer select-none hover:border-[#3b9ae1]/30 transition-colors"
              >
                <div
                  className="w-[30px] h-[16px] rounded-full relative shrink-0"
                  style={{ background: storyOnly ? "#3b9ae1" : "#1d2740" }}
                >
                  <div
                    className="absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-all"
                    style={{ left: storyOnly ? "16px" : "2px" }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">Story</span>
              </div>
            </div>

            {/* Advanced filters (collapsible) */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <MultiSelect
                options={DIFFICULTY_KEYS.map((d) => ({
                  label: DIFFICULTY_LABEL[d],
                  value: d,
                  node: (
                    <span style={{ color: LEVEL_COLORS[d], fontWeight: 500 }}>
                      {DIFFICULTY_LABEL[d]}
                    </span>
                  ),
                }))}
                selected={difficultyFilter}
                onChange={(s: Set<string>) => setDifficultyFilter(s as Set<Difficulty>)}
                placeholder="Difficulty"
                className="w-[130px]"
              />
              {availableTypes.length > 0 && (
                <MultiSelect
                  options={availableTypes.map((t) => ({
                    label: typeLabel(t),
                    value: t,
                    node: (
                      <span style={{ color: typeColor(t), fontWeight: 500 }}>
                        {typeLabel(t)}
                      </span>
                    ),
                  }))}
                  selected={typeFilter}
                  onChange={setTypeFilter}
                  placeholder="Type"
                  className="w-[130px]"
                />
              )}
              {factionSummaries.length > 1 && (
                <FactionCombobox
                  factions={factionSummaries}
                  value={factionFilter}
                  onChange={setFactionFilter}
                  className="w-[150px]"
                />
              )}
            </div>
          </div>

          {/* Scrollable card list */}
          <div className="flex-1 min-h-0 overflow-auto px-3.5 pb-4">
            {bucketItems.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No missions in this bucket.
              </p>
            )}

            {bucketItems.map((item) => {
              if (item.kind === "offer") {
                const isSel = selectedKind === "mission" && selectedId === item.offer.offer_id;
                const inRun = runIds.includes(item.offer.offer_id!);
                return (
                  <OfferCard
                    key={item.offer.offer_id}
                    o={item.offer}
                    factionMap={factionMap}
                    isSelected={isSel}
                    isInRun={inRun}
                    onClick={() => {
                      setSelectedKind("mission");
                      setSelectedId(item.offer.offer_id!);
                      setTab("board");
                    }}
                    onToggleRun={() => {
                      setRunIds((prev) =>
                        prev.includes(item.offer.offer_id!)
                          ? prev.filter((id) => id !== item.offer.offer_id)
                          : [...prev, item.offer.offer_id!],
                      );
                    }}
                  />
                );
              }
              if (item.kind === "card") {
                const isSel = selectedKind === "mission" && selectedId === item.mission.mission_id;
                const inRun = runIds.includes(item.mission.mission_id!);
                return (
                  <MissionCard
                    key={item.mission.mission_id}
                    m={item.mission}
                    factionMap={factionMap}
                    nowSec={nowSec}
                    isSelected={isSel}
                    isInRun={inRun}
                    onClick={() => {
                      setSelectedKind("mission");
                      setSelectedId(item.mission.mission_id!);
                      setTab("board");
                    }}
                    onToggleRun={() => {
                      setRunIds((prev) =>
                        prev.includes(item.mission.mission_id!)
                          ? prev.filter((id) => id !== item.mission.mission_id)
                          : [...prev, item.mission.mission_id!],
                      );
                    }}
                  />
                );
              }
              // Group
              const kind = deriveGroupKind(item.missions);
              const isSel =
                (kind === "choice" && selectedKind === "choice" && selectedId === item.groupId) ||
                (kind === "all" && selectedKind === "all" && selectedId === item.groupId);
              return (
                <GroupCard
                  key={item.groupId}
                  kind={kind}
                  groupId={item.groupId}
                  groupName={item.groupName}
                  missions={item.missions}
                  factionMap={factionMap}
                  isSelected={isSel}
                  onClick={() => {
                    setSelectedKind(kind);
                    setSelectedId(item.groupId);
                    setTab("board");
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* ===== DETAIL ===== */}
        <div className="flex-1 min-w-0 overflow-auto">
          {tab === "run" ? (
            <RunPlanner
              missions={missions ?? []}
              offers={offers ?? []}
              runIds={runIds}
              onRemoveFromRun={(id) => setRunIds((prev) => prev.filter((x) => x !== id))}
            />
          ) : selectedKind === "choice" && selectedGroup ? (
            <ChoiceGroupDetail
              groupName={selectedGroup.groupName}
              groupId={selectedGroup.groupId}
              paths={selectedGroup.missions.map((m): PathOption => ({
                mission: m,
                consequence: "Check mission details for consequences.",
              }))}
              factionMap={factionMap}
            />
          ) : selectedKind === "all" && selectedGroup ? (
            <AllRequiredGroupDetail
              groupName={selectedGroup.groupName}
              groupId={selectedGroup.groupId}
              subStages={selectedGroup.missions.map((m): SubStage => ({
                mission: m,
                status: m.is_active ? "current" : "next",
                typeLabel: m.type ? typeLabel(m.type) : "Mission",
                destName: m.associated_entity_name ?? "—",
              }))}
              factionMap={factionMap}
            />
          ) : selectedMission ? (
            <MissionDetail
              m={selectedMission}
              factionMap={factionMap}
              onShowOnMap={(sectorId, objectives) =>
                setMapModal({ sectorId, objectives })
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Select a mission to view details
            </div>
          )}
        </div>
      </div>

      {/* Map modal */}
      <MissionMapModal
        open={!!mapModal}
        onClose={() => setMapModal(null)}
        sectorId={mapModal?.sectorId ?? ""}
        objectives={mapModal?.objectives ?? []}
      />
    </div>
  );
}
