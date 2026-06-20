import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Users, Ship, Building2, X } from "lucide-react";
import { PageLoaderPreset } from "../components/PageLoader";
import { HUDCard } from "../components/HUDCard";
import { FilterBar } from "../components/FilterBar";
import { SearchInput } from "../components/ui/search-input";
import { DataTable } from "../components/DataTable";
import type { ColumnDef } from "../components/DataTable";
import type { FactionSummary } from "../lib/map/types";
import { useSort } from "../lib/useSort";
import { cn } from "../lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useColumnVisibility } from "../lib/useColumnVisibility";
import { MultiSelect } from "../components/ui/multi-select";

type RoleSkillWeight = {
  skill_ref: string;
  relevance: number;
};

type RoleMeta = {
  role_id: string;
  name: string;
  tag: string;
  skills: RoleSkillWeight[];
};

// ── Types ────────────────────────────────────────────────────────────────────

type NPCEntry = {
  id: string;
  name: string | null;
  code: string | null;
  macro: string | null;
  owner_faction: string | null;
  entity_type: string | null;
  entity_post: string | null;
  seed: string | null;
  connection: string | null;
  location_ship_id: string | null;
  location_station_id: string | null;
  location_ship_name: string | null;
  location_ship_code: string | null;
  location_ship_command: string | null;
  location_ship_command_name: string | null;
  location_ship_assignment: string | null;
  location_ship_assignment_name: string | null;
  location_ship_icon_url: string | null;
  location_station_name: string | null;
  location_station_code: string | null;
  location_sector_name: string | null;
  skill_piloting: number | null;
  skill_morale: number | null;
  skill_engineering: number | null;
  skill_management: number | null;
  skill_boarding: number | null;
  blackboard_json: string | null;
  employment: string;
  extra_json: string | null;
};

/** Enriched NPC with pre-computed display fields so COLUMNS renders are pure reads. */
type EnrichedNPC = NPCEntry & {
  factionSummary?: FactionSummary;
  factionDisplay: string;
  factionId: string | null;
  gender: string | null;
  locationType: "Ship" | "Station" | "None";
  roleSkill: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_META: Record<string, { label: string; color: string }> = {
  aipilot:  { label: "Captain",  color: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  defence:  { label: "Defence",  color: "bg-red-500/15 text-red-400 border-red-500/30" },
  engineer: { label: "Engineer", color: "bg-slate-500/5 text-slate-500/70 border-slate-500/10" },
  manager:  { label: "Manager",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  trader:   { label: "Trader",   color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  marine:   { label: "Marine",   color: "bg-orange-500/5 text-orange-600/50 border-orange-500/10" },
};

function getRoleSkill(npc: NPCEntry, rolesMap: Map<string, RoleMeta>): number | null {
  const role = rolesMap.get(npc.entity_post || "");
  if (!role || !role.skills.length) return null;

  let totalWeight = 0;
  let weightedSum = 0;

  for (const s of role.skills) {
    let stat = 0;
    if (s.skill_ref === "piloting") stat = npc.skill_piloting || 0;
    else if (s.skill_ref === "morale") stat = npc.skill_morale || 0;
    else if (s.skill_ref === "engineering") stat = npc.skill_engineering || 0;
    else if (s.skill_ref === "management") stat = npc.skill_management || 0;
    else if (s.skill_ref === "boarding") stat = npc.skill_boarding || 0;
    
    weightedSum += stat * s.relevance;
    totalWeight += s.relevance;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}





function roleBadge(post: string | null, rolesMap: Map<string, RoleMeta>) {
  if (!post) return null;
  const known = ROLE_META[post];
  const dynamic = rolesMap.get(post);
  const label = dynamic?.name || known?.label || post;
  const color = known?.color ?? "bg-muted/50 text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border",
        color
      )}
    >
      {label}
    </span>
  );
}

function resolveFaction(
  ownerFaction: string | null,
  factionNames: Record<string, string>,
): string {
  if (!ownerFaction) return "Unknown";
  if (ownerFaction === "player") return "Player";
  return factionNames[ownerFaction] || ownerFaction.charAt(0).toUpperCase() + ownerFaction.slice(1);
}

function resolveGender(macro: string | null): string | null {
  if (!macro) return null;
  const m = macro.match(/character_\w+_(male|female)/i);
  if (!m) return null;
  const g = m[1].toLowerCase();
  return g === "male" ? "M" : g === "female" ? "F" : null;
}

function resolveLocationType(npc: NPCEntry): "Ship" | "Station" | "None" {
  if (npc.location_ship_id) return "Ship";
  if (npc.location_station_id) return "Station";
  return "None";
}

function locationLabel(npc: EnrichedNPC): string {
  const sName = npc.location_ship_name;
  const sCode = npc.location_ship_code;
  const stName = npc.location_station_name;
  const stCode = npc.location_station_code;
  if (sName && sCode) return `${sName} (${sCode})`;
  if (sName) return sName;
  if (npc.location_ship_id) return "Ship";
  if (stName && stCode) return `${stName} (${stCode})`;
  if (stName) return stName;
  if (npc.location_station_id) return "Station";
  return "—";
}

function formatMacro(macro: string | null): string {
  if (!macro) return "Unknown Crew";
  let m = macro.replace(/^character_/, "").replace(/_macro$/, "");
  m = m.replace(/_\d+$/, ""); // remove _01, _02
  m = m.replace(/_(cau|asi|afr|latin)/g, ""); // remove race variants
  return m.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Star rendering ────────────────────────────────────────────────────────────

/** Render 0–5 stars from a 0–15 skill value (3 points per star). */
function SkillStars({ value }: { value: number | null }) {
  if (value == null) value = 0;
  // Floor to nearest 1/3 star (X4 game standard)
  const stars = Math.floor((value / 3) * 3) / 3; 
  const els: React.ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const fill = Math.min(1, Math.max(0, stars - i));
    
    // Visually map the fill to CSS widths that look correct for the ★ character
    let visualWidth = 0;
    if (fill >= 1) visualWidth = 100;
    else if (fill >= 0.66) visualWidth = 48; // Leaves right half noticeably empty
    else if (fill >= 0.33) visualWidth = 28; // Leaves most of the star empty

    els.push(
      <span key={i} className="relative inline-block w-[11px] text-center text-[11px] leading-none" style={{ color: "rgba(255,255,255,0.12)" }}>
        ★
        {visualWidth > 0 && (
          <span
            className="absolute inset-0 overflow-hidden text-[11px] leading-none"
            style={{ color: "#f59e0b", width: `${visualWidth}%` }}
          >
            ★
          </span>
        )}
      </span>,
    );
  }
  return <span className="inline-flex gap-px" title={`${value.toFixed(1)}/15 — ${(value/3).toFixed(2)} stars`}>{els}</span>;
}

// ── Column definitions (module‑scoped; render fns read from EnrichedNPC) ──────

type ColumnMeta = {
  key: string;
  label: string;
  sortKey?: string;
  groupId: string;
  defaultVisible: boolean;
  align?: "left" | "right";
};

const ALL_COLUMNS: ColumnMeta[] = [
  // Identity
  { key: "name", label: "Name", sortKey: "name", groupId: "identity", defaultVisible: true, align: "left" },
  { key: "role", label: "Role", sortKey: "role", groupId: "identity", defaultVisible: true, align: "left" },
  
  // Current Role
  { key: "command", label: "Command", sortKey: "command", groupId: "current-role", defaultVisible: true, align: "left" },
  { key: "role_skill", label: "Role Skill", sortKey: "role_skill", groupId: "current-role", defaultVisible: true, align: "left" },

  // Skills
  { key: "skill_piloting", label: "Piloting", sortKey: "skill_piloting", groupId: "skills", defaultVisible: false, align: "left" },
  { key: "skill_morale", label: "Morale", sortKey: "skill_morale", groupId: "skills", defaultVisible: false, align: "left" },
  { key: "skill_engineering", label: "Engineering", sortKey: "skill_engineering", groupId: "skills", defaultVisible: false, align: "left" },
  { key: "skill_management", label: "Management", sortKey: "skill_management", groupId: "skills", defaultVisible: false, align: "left" },
  { key: "skill_boarding", label: "Boarding", sortKey: "skill_boarding", groupId: "skills", defaultVisible: false, align: "left" },

  // Location
  { key: "workplace", label: "Workplace", sortKey: "workplace", groupId: "location", defaultVisible: true, align: "left" },
  { key: "sector", label: "Sector", sortKey: "sector", groupId: "location", defaultVisible: true, align: "left" },
];

const DEFAULT_VISIBLE = new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key));
const STORAGE_KEY = "crew-table-columns";

const COLUMN_GROUPS = [
  { id: "identity", label: "Identity" },
  { id: "current-role", label: "Current Role" },
  { id: "skills", label: "Skills Breakout" },
  { id: "location", label: "Location" },
];
// Dynamic columns generated inside the component based on ALL_COLUMNS and visibleColumns

// ── Page component ────────────────────────────────────────────────────────────

const GROUP_BY_OPTIONS = [
  { key: "none", label: "None" },
  { key: "role", label: "Role" },
  { key: "workplace", label: "Workplace" },
  { key: "sector", label: "Sector" },
] as const;

type GroupByKey = (typeof GROUP_BY_OPTIONS)[number]["key"];

export default function CrewPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");
  const [visibleColumns, setVisibleColumns] = useColumnVisibility(STORAGE_KEY, DEFAULT_VISIBLE);

  const { data: npcs = [], isLoading } = useQuery<NPCEntry[]>({
    queryKey: ["npcs", "player"],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("owner", "player");
      params.set("limit", "2000");
      return fetch(`/api/v1/npcs?${params}`).then((r) => r.json());
    },
  });

  // Static lookup tables — fetched once, cached indefinitely.
  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => fetch("/api/v1/factions").then((r) => r.json()),
    staleTime: Infinity,
  });

  // Build lookup maps from the static reference data.
  const { factionNames, factionMap } = useMemo(() => {
    const factionNames: Record<string, string> = {};
    const factionMap = new Map<string, FactionSummary>();
    for (const f of factions) {
      factionNames[f.faction_id] = f.name || f.faction_id;
      factionMap.set(f.faction_id, f);
    }
    return { factionNames, factionMap };
  }, [factions]);

  const { data: rolesList = [] } = useQuery<RoleMeta[]>({
    queryKey: ["roles"],
    queryFn: () => fetch("/api/v1/roles").then((r) => r.json()),
    staleTime: Infinity,
  });

  const rolesMap = useMemo(() => {
    const m = new Map<string, RoleMeta>();
    for (const r of rolesList) {
      m.set(r.role_id, r);
    }
    return m;
  }, [rolesList]);

  // Enrich NPCs with pre-computed display fields (faction, gender, location type).
  // This is a stable derivation — the COLUMNS render functions just read fields.
  const enrichedNpcs = useMemo<EnrichedNPC[]>(
    () =>
      npcs.map((npc) => ({
        ...npc,
        factionSummary: npc.owner_faction ? factionMap.get(npc.owner_faction) : undefined,
        factionDisplay: resolveFaction(npc.owner_faction, factionNames),
        factionId: npc.owner_faction,
        gender: resolveGender(npc.macro),
        locationType: resolveLocationType(npc),
        roleSkill: getRoleSkill(npc, rolesMap),
      })),
    [npcs, factionNames, factionMap, rolesMap],
  );

  let filtered = enrichedNpcs.filter(n => n.entity_type !== "crowd");
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((n) =>
      n.name?.toLowerCase().includes(q) ||
      n.code?.toLowerCase().includes(q)
    );
  }
  if (roleFilter !== "all") {
    filtered = filtered.filter((n) => n.entity_post === roleFilter);
  }

  const { sorted, key, dir, toggle } = useSort(
    filtered,
    {
      name:             (n) => n.name ?? n.code ?? "",
      role:             (n) => n.entity_post ?? "",
      faction:          (n) => n.factionDisplay,
      gender:           (n) => n.gender ?? "",
      skill_piloting:   (n) => n.skill_piloting ?? -1,
      skill_morale:     (n) => n.skill_morale ?? -1,
      skill_engineering:(n) => n.skill_engineering ?? -1,
      skill_management: (n) => n.skill_management ?? -1,
      skill_boarding:   (n) => n.skill_boarding ?? -1,
      role_skill:       (n) => n.roleSkill ?? -1,
      code:             (n) => n.code ?? "",
      seed:             (n) => n.seed ?? "",
      workplace:        (n) => locationLabel(n),
      command:          (n) => n.location_ship_assignment_name ?? n.location_ship_command_name ?? n.location_ship_command ?? "",
      sector:           (n) => n.location_sector_name ?? "",
    },
    { key: "name", dir: "asc" },
  );

  // ── Group-by ──────────────────────────────────────────────────────────────

  const rowGroups = useMemo(() => {
    if (groupBy === "none") return undefined;

    const groups: Record<string, EnrichedNPC[]> = {};
    for (const npc of sorted) {
      let key = "";
      if (groupBy === "role") {
        key = npc.entity_post
          ? (rolesMap.get(npc.entity_post)?.name ?? ROLE_META[npc.entity_post]?.label ?? npc.entity_post)
          : "No Role";
      } else if (groupBy === "workplace") {
        key = locationLabel(npc);
      } else if (groupBy === "sector") {
        key = npc.location_sector_name || "Unknown Sector";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(npc);
    }

    const orderedKeys = Object.keys(groups).sort((a, b) => {
      // Put "No Role", "Unknown", "None" last
      const aLow = a === "No Role" || a === "Unknown" || a === "None";
      const bLow = b === "No Role" || b === "Unknown" || b === "None";
      if (aLow && !bLow) return 1;
      if (!aLow && bLow) return -1;
      return a.localeCompare(b);
    });

    return orderedKeys.map((k) => ({
      key: k,
      label: (
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {k}
        </span>
      ),
      rows: groups[k],
    }));
  }, [sorted, groupBy]);

  // ── Column Implementation ───────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<EnrichedNPC>[]>(() => {
    return [
      {
        key: "name",
        label: "Name",
        sortKey: "name",
        align: "left",
        render: (npc) => {
          const displayName = npc.name || formatMacro(npc.macro);
          return (
            <div className="flex items-center gap-1.5 font-medium">
              {displayName}
              {npc.employment === "owned" && (
                <span className="shrink-0 px-1 py-0 rounded text-[9px] font-semibold uppercase bg-primary/10 text-primary">
                  Own
                </span>
              )}
            </div>
          );
        },
      },
      {
        key: "role",
        label: "Role",
        sortKey: "role",
        align: "left",
        render: (npc) => roleBadge(npc.entity_post, rolesMap),
      },
      {
        key: "command",
        label: "Command",
        sortKey: "command",
        align: "left",
        render: (npc) => (
          <span className="text-muted-foreground capitalize text-xs">
            {npc.location_ship_assignment_name || npc.location_ship_command_name || npc.location_ship_command || "—"}
          </span>
        ),
      },
      {
        key: "role_skill",
        label: "Role Skill",
        sortKey: "role_skill",
        align: "left",
        render: (npc) => <SkillStars value={npc.roleSkill} />,
      },
      {
        key: "skill_piloting",
        label: "Piloting",
        sortKey: "skill_piloting",
        align: "left",
        render: (npc) => <SkillStars value={npc.skill_piloting} />,
      },
      {
        key: "skill_morale",
        label: "Morale",
        sortKey: "skill_morale",
        align: "left",
        render: (npc) => <SkillStars value={npc.skill_morale} />,
      },
      {
        key: "skill_engineering",
        label: "Engineering",
        sortKey: "skill_engineering",
        align: "left",
        render: (npc) => <SkillStars value={npc.skill_engineering} />,
      },
      {
        key: "skill_management",
        label: "Management",
        sortKey: "skill_management",
        align: "left",
        render: (npc) => <SkillStars value={npc.skill_management} />,
      },
      {
        key: "skill_boarding",
        label: "Boarding",
        sortKey: "skill_boarding",
        align: "left",
        render: (npc) => <SkillStars value={npc.skill_boarding} />,
      },
      {
        key: "workplace",
        label: "Workplace",
        sortKey: "workplace",
        align: "left",
        render: (npc) => {
          const sName = npc.location_ship_name;
          const sCode = npc.location_ship_code;
          const shipIcon = npc.location_ship_icon_url;
          const stName = npc.location_station_name;
          const stCode = npc.location_station_code;
          
          let display = "—";
          if (sName && sCode) display = `${sName} (${sCode})`;
          else if (sName) display = sName;
          else if (npc.location_ship_id) display = "Ship";
          else if (stName && stCode) display = `${stName} (${stCode})`;
          else if (stName) display = stName;
          else if (npc.location_station_id) display = "Station";

          return (
            <span className="text-muted-foreground flex items-center gap-1.5">
              {npc.location_ship_id ? (
                <>
                  {shipIcon ? (
                    <span
                      className="shrink-0"
                      style={{
                        width: 14,
                        height: 14,
                        backgroundColor: "currentColor",
                        maskImage: `url(${shipIcon})`,
                        WebkitMaskImage: `url(${shipIcon})`,
                        maskSize: "contain",
                        WebkitMaskSize: "contain",
                        maskRepeat: "no-repeat",
                        WebkitMaskRepeat: "no-repeat",
                        maskPosition: "center",
                        WebkitMaskPosition: "center",
                      }}
                    />
                  ) : (
                    <Ship className="h-3.5 w-3.5" />
                  )}
                  <span className="truncate max-w-[160px]" title={display}>
                    {display}
                  </span>
                </>
              ) : npc.location_station_id ? (
                <>
                  <Building2 className="h-3.5 w-3.5" />
                  <span className="truncate max-w-[160px]" title={display}>
                    {display}
                  </span>
                </>
              ) : (
                "—"
              )}
            </span>
          );
        },
      },
      {
        key: "sector",
        label: "Sector",
        sortKey: "sector",
        align: "left",
        render: (npc) => (
          <span className="text-muted-foreground truncate max-w-[140px]" title={npc.location_sector_name || "Unknown Sector"}>
            {npc.location_sector_name || "—"}
          </span>
        ),
      },
    ].filter(c => visibleColumns.has(c.key));
  }, [visibleColumns]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) return <PageLoaderPreset preset="crew" />;

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-5 shrink-0">
        <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
          <Users className="h-6 w-6 text-primary" /> Crew
        </h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {filtered.length} personnel
        </p>
      </div>

      <FilterBar>
        <SearchInput
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="flex-1 min-w-[200px] max-w-sm"
        />
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
            Role
          </span>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[140px] h-7 text-xs rounded-[4px]">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border bg-muted text-muted-foreground border-border">
                  All Roles
                </span>
              </SelectItem>
              {Object.entries(ROLE_META).map(([key, meta]) => (
                <SelectItem key={key} value={key}>
                  <span className={cn("px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold border", meta.color)}>
                    {meta.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(search !== "" || roleFilter !== "all" || groupBy !== "none") && (
          <button
            onClick={() => {
              setSearch("");
              setRoleFilter("all");
              setGroupBy("none");
            }}
            className="ml-2 text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1.5 rounded-[4px] bg-muted/30 hover:bg-muted/50 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}

        <div className="ml-auto flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
              Group By
            </span>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByKey)}>
              <SelectTrigger className="w-[140px] h-7 text-xs rounded-[4px]">
                <SelectValue placeholder="No Grouping" />
              </SelectTrigger>
              <SelectContent>
                {GROUP_BY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.key} value={opt.key}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <MultiSelect
            title="Columns"
            options={ALL_COLUMNS.map((c) => ({
              value: c.key,
              label: c.label,
              group: COLUMN_GROUPS.find((g) => g.id === c.groupId)?.label || c.groupId,
            }))}
            selected={visibleColumns}
            onChange={setVisibleColumns}
          />
        </div>
      </FilterBar>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-2 min-h-0">
        <HUDCard className="h-full flex flex-col">
          <div className="flex-1 overflow-auto">
            <DataTable
              key={groupBy}
              columns={columns}
              columnGroups={COLUMN_GROUPS}
              rows={rowGroups ? undefined : sorted}
              rowGroups={rowGroups}
              getRowKey={(n) => n.id}
              sortKey={key}
              sortDir={dir}
              onSortChange={(k) => toggle(k, "asc")}
              emptyState={
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Users className="h-10 w-10 opacity-30" />
                  <p className="text-sm">No crew found.</p>
                  <p className="text-xs">
                    Activate a save and re-ingest to populate crew data.
                  </p>
                </div>
              }
            />
          </div>
        </HUDCard>
      </div>
    </div>
  );
}
