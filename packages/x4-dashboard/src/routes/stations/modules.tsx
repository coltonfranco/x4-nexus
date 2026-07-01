import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { StatBar } from "../../components/StatBar";
import { Currency } from "../../components/Currency";
import { EntityIcon } from "../../components/EntityIcon";
import { FactionBadge } from "../../components/FactionBadge";
import { SizeBadge } from "../../components/ShipBadges";
import { MultiSelect } from "../../components/ui/multi-select";
import { Switch } from "../../components/ui/switch";
import { cn } from "../../lib/utils";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { FilterBar } from "../../components/FilterBar";
import { SearchInput } from "../../components/ui/search-input";
import { DataTable } from "../../components/DataTable";
import type { ColumnDef, ColumnGroup, RowGroup } from "../../components/DataTable";
import { useColumnVisibility } from "../../lib/useColumnVisibility";
import { apiGet } from "../../lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import type { FactionSummary } from "../../lib/map/types";
import { ProductionChain } from "../../components/trade/ProductionChain";

// ── Types ────────────────────────────────────────────────────────────────────

export type ModuleSummary = {
  module_id: string;
  name: string;
  dlc: string | null;
  kind: string | null;
  size: string | null;
  makerrace: string | null;
  description: string | null;
  shortname: string | null;
  produces_ware_id: string | null;
  storage_capacity: number | null;
  storage_type: string | null;
  drone_capacity: number | null;
  workforce_capacity: number | null;
  workforce_race: string | null;
  workforce_growthrate: number | null;
  build_sets: string | null;
  blueprint_price_min: number | null;
  blueprint_price_avg: number | null;
  blueprint_price_max: number | null;
  restriction_licence: string | null;
  has_blueprint: boolean;
  hull: number | null;
  hull_integrated?: boolean | null;
  explosiondamage: number | null;
  explosion_shield_damage: number | null;
  secrecy_level: number | null;
  turrets_s: number;
  turrets_m: number;
  turrets_l: number;
  turrets_xl: number;
  shields_s: number;
  shields_m: number;
  shields_l: number;
  shields_xl: number;
  dock_s: number;
  dock_m: number;
  dock_l: number;
  dock_xl: number;
  hangar_s: number;
  hangar_m: number;
  snap_points: number;
  production_method: string | null;
  build_time_sec: number | null;
  est_cost: number | null;
  production_rate: number | null;
  is_obtainable: boolean;
  produces_ware_name: string | null;
  consumes_ware_name: string | null;
  consumption_rate: number | null;
  icon_url: string | null;
};

export type ModuleDetail = ModuleSummary & {
  construction_resources: Array<{
    ware_id: string;
    name: string;
    amount: number;
    price_avg: number;
    total: number;
  }> | null;
  production_inputs: Array<{
    ware_id: string;
    name: string;
    amount: number;
    output_amount: number;
    time_sec: number;
    rate_per_hour: number;
  }> | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const KIND_LABELS: Record<string, string> = {
  storage: "Storage",
  dock: "Dock",
  connectionmodule: "Connection",
  production: "Production",
  defence: "Defence",
  habitation: "Habitation",
  buildmodule: "Build Module",
  welfaremodule: "Welfare",
  processingmodule: "Processing",
};

export const KIND_COLORS: Record<string, string> = {
  storage: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  dock: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  connectionmodule: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  production: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  defence: "bg-red-500/20 text-red-300 border-red-500/30",
  habitation: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  buildmodule: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  welfaremodule: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  processingmodule: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

/** Map module size string to ship class_id for reuse of ShipClassBadge. */
function moduleSizeToClassId(size: string | null): string {
  switch (size) {
    case "small": return "s";
    case "medium": return "m";
    case "large": return "l";
    case "extralarge": return "xl";
    default: return "";
  }
}

const SIZE_ORDER: Record<string, number> = {
  small: 1,
  medium: 2,
  large: 3,
  extralarge: 4,
};

function formatDlc(dlc: string | null) {
  if (!dlc) return "Base Game";
  return dlc.charAt(0).toUpperCase() + dlc.slice(1) + " DLC";
}

function formatLicence(lic: string | null) {
  if (!lic) return "";
  const cleaned = lic.replace(/_/g, " ");
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check whether a module's licence is locked. When makerrace is null, the licence
 *  may be obtainable from any faction (or via research) — check the factionless set. */
export function isModuleLicenceLocked(
  makerrace: string | null,
  restriction_licence: string | null,
  licenceSet: Set<string>,
  anyLicenceSet: Set<string>,
): boolean {
  if (!restriction_licence) return false;
  if (makerrace) return !licenceSet.has(`${makerrace}:${restriction_licence}`);
  return !anyLicenceSet.has(restriction_licence);
}

/** Human-readable source for a licence tooltip. */
function licenceSourceLabel(makerrace: string | null): string {
  return makerrace ?? "any faction";
}

type SortKey =
  | "name" | "kind" | "size" | "dlc" | "makerrace"
  | "hull" | "storage_capacity" | "workforce_capacity"
  | "blueprint_price_avg" | "build_time_sec" | "est_cost" | "production_rate"
  | "produces_ware_name" | "consumes_ware_name" | "consumption_rate"
  | "dock_s" | "dock_m" | "dock_l" | "dock_xl"
  | "hangar_s" | "hangar_m" | "snap_points"
  | "turrets_s" | "turrets_m" | "turrets_l" | "turrets_xl"
  | "shields_s" | "shields_m" | "shields_l" | "shields_xl";

type GroupByKey = "none" | "kind" | "size" | "dlc" | "makerrace";

// ── Column metadata ──────────────────────────────────────────────────────────

type ColumnMeta = {
  key: string;
  label: string;
  sortKey?: SortKey;
  groupId: string;
  defaultVisible: boolean;
  align?: "left" | "right";
};

const ALL_COLUMNS: ColumnMeta[] = [
  { key: "kind",      label: "Kind",      sortKey: "kind",          groupId: "classification", defaultVisible: true,  align: "left" },
  { key: "size",      label: "Size",      sortKey: "size",          groupId: "classification", defaultVisible: true,  align: "left" },
  { key: "makerrace", label: "Faction",   sortKey: "makerrace",     groupId: "classification", defaultVisible: true,  align: "left" },
  { key: "dlc",       label: "DLC",       sortKey: "dlc",           groupId: "classification", defaultVisible: false, align: "left" },
  { key: "hull",      label: "Hull",      sortKey: "hull",          groupId: "stats",   defaultVisible: true  },
  { key: "storage",   label: "Storage",   sortKey: "storage_capacity", groupId: "stats", defaultVisible: true  },
  { key: "workforce", label: "Workforce", sortKey: "workforce_capacity", groupId: "stats", defaultVisible: false },
  { key: "tur_s",     label: "Tur S",     sortKey: "turrets_s",    groupId: "slots-turrets", defaultVisible: false },
  { key: "tur_m",     label: "Tur M",     sortKey: "turrets_m",    groupId: "slots-turrets", defaultVisible: false },
  { key: "tur_l",     label: "Tur L",     sortKey: "turrets_l",    groupId: "slots-turrets", defaultVisible: false },
  { key: "tur_xl",    label: "Tur XL",    sortKey: "turrets_xl",   groupId: "slots-turrets", defaultVisible: false },
  { key: "shd_s",     label: "Shd S",     sortKey: "shields_s",    groupId: "slots-shields", defaultVisible: false },
  { key: "shd_m",     label: "Shd M",     sortKey: "shields_m",    groupId: "slots-shields", defaultVisible: false },
  { key: "shd_l",     label: "Shd L",     sortKey: "shields_l",    groupId: "slots-shields", defaultVisible: false },
  { key: "shd_xl",    label: "Shd XL",    sortKey: "shields_xl",   groupId: "slots-shields", defaultVisible: false },
  { key: "licence",   label: "Licence",   sortKey: undefined,       groupId: "unlock", defaultVisible: true,  align: "left" },
  { key: "price",     label: "Blueprint", sortKey: "blueprint_price_avg", groupId: "unlock", defaultVisible: true  },
  // Build (optional — construction cost / time)
  { key: "build_time", label: "Build Time", sortKey: "build_time_sec", groupId: "build", defaultVisible: false },
  { key: "est_cost",  label: "Est. Cost",  sortKey: "est_cost",        groupId: "build", defaultVisible: false },
  // Docks (optional)
  { key: "dock_s_c",  label: "Dock S",  sortKey: "dock_s",  groupId: "docks", defaultVisible: false },
  { key: "dock_m_c",  label: "Dock M",  sortKey: "dock_m",  groupId: "docks", defaultVisible: false },
  { key: "dock_l_c",  label: "Dock L",  sortKey: "dock_l",  groupId: "docks", defaultVisible: false },
  { key: "dock_xl_c", label: "Dock XL", sortKey: "dock_xl", groupId: "docks", defaultVisible: false },
  { key: "hangar_s_c",label: "Hangar S",sortKey: "hangar_s", groupId: "docks", defaultVisible: false },
  { key: "hangar_m_c",label: "Hangar M",sortKey: "hangar_m", groupId: "docks", defaultVisible: false },
  { key: "snap_c",    label: "Snap Pts", sortKey: "snap_points", groupId: "docks", defaultVisible: false },
  // Production (optional)
  { key: "produces",   label: "Produces", sortKey: "produces_ware_name" as SortKey, groupId: "production", defaultVisible: false, align: "left" },
  { key: "prod_rate",  label: "Rate/hr",  sortKey: "production_rate",       groupId: "production", defaultVisible: false },
  { key: "consumes",   label: "Consumes", sortKey: "consumes_ware_name" as SortKey, groupId: "production", defaultVisible: false, align: "left" },
  { key: "cons_rate",  label: "Cons./hr", sortKey: "consumption_rate",      groupId: "production", defaultVisible: false },
];

const DEFAULT_VISIBLE = new Set(
  ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
);
const STORAGE_KEY = "modules-table-columns";

const COLUMN_GROUPS: ColumnGroup[] = [
  { id: "classification", label: "Classification" },
  { id: "stats",          label: "Stats" },
  { id: "slots-turrets",  label: "Tur Slots" },
  { id: "slots-shields",  label: "Shd Slots" },
  { id: "unlock",         label: "Unlock" },
  { id: "build",          label: "Build" },
  { id: "docks",          label: "Docks" },
  { id: "production",     label: "Production" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function ModulesPage() {
  const [search, setSearch] = useState("");
  const [selectedKind, setSelectedKind] = useState("all");
  const [selectedSize, setSelectedSize] = useState("all");
  const [selectedFactions, setSelectedFactions] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortKey>("name");
  const [sortDesc, setSortDesc] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupByKey>("none");
  const [availabilityFilter, setAvailabilityFilter] = useState<string>("all");
  const [obtainableOnly, setObtainableOnly] = useState(false);
  const [selectedModule, setSelectedModule] = useState<ModuleSummary | null>(null);
  const [visibleColumns, setVisibleColumns] = useColumnVisibility(
    STORAGE_KEY,
    DEFAULT_VISIBLE
  );

  const { data: modules = [], isLoading } = useQuery<ModuleSummary[]>({
    queryKey: ["modules"],
    queryFn: () =>
      apiGet<any>("/api/v1/modules?limit=2000").then((d) =>
        Array.isArray(d) ? d : []
      ),
    staleTime: 10 * 60_000,
  });

  const { data: factions = [] } = useQuery<FactionSummary[]>({
    queryKey: ["factions"],
    queryFn: () => apiGet<FactionSummary[]>("/api/v1/factions"),
    staleTime: Infinity,
  });

  const { data: playerLicences = [] } = useQuery<
    { licence_type: string; faction_id: string }[]
  >({
    queryKey: ["player-licences"],
    queryFn: () => apiGet<{ licence_type: string; faction_id: string }[]>("/api/v1/player/licences"),
    staleTime: 60_000,
  });

  const factionMap = useMemo(
    () => new Map(factions.map((f) => [f.faction_id, f])),
    [factions]
  );
  const licenceSet = useMemo(
    () => new Set(playerLicences.map((l) => `${l.faction_id}:${l.licence_type}`)),
    [playerLicences]
  );
  const anyLicenceSet = useMemo(
    () => new Set(playerLicences.map((l) => l.licence_type)),
    [playerLicences]
  );

  const kinds = useMemo(
    () => [...new Set(modules.map((m) => m.kind).filter(Boolean) as string[])].sort(),
    [modules]
  );
  const sizes = useMemo(
    () =>
      [...new Set(modules.map((m) => m.size).filter(Boolean) as string[])].sort(
        (a, b) => (SIZE_ORDER[a] ?? 99) - (SIZE_ORDER[b] ?? 99)
      ),
    [modules]
  );
  // Derive available factions from makerrace
  const availableFactions = useMemo(() => {
    const seen = new Set<string>();
    modules.forEach((m) => {
      if (m.makerrace) seen.add(m.makerrace);
    });
    return [...seen].sort();
  }, [modules]);

  const filtered = modules.filter((m) => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (selectedKind !== "all" && m.kind !== selectedKind) return false;
    if (selectedSize === "none" && m.size !== null) return false;
    if (selectedSize !== "all" && selectedSize !== "none" && m.size !== selectedSize) return false;
    if (selectedFactions.size > 0 && !selectedFactions.has(m.makerrace || "__none__"))
      return false;
    if (obtainableOnly && !m.is_obtainable) return false;
    if (availabilityFilter !== "all") {
      const licenceLocked = isModuleLicenceLocked(m.makerrace, m.restriction_licence, licenceSet, anyLicenceSet);
      const isFreeDefault = !m.blueprint_price_avg && m.is_obtainable;
      if (availabilityFilter === "locked" && !licenceLocked) return false;
      if (availabilityFilter === "ready" && (licenceLocked || (!m.has_blueprint && !isFreeDefault))) return false;
      if (availabilityFilter === "purchasable" && (licenceLocked || m.has_blueprint || !m.blueprint_price_avg)) return false;
      if (availabilityFilter === "unavailable" && (licenceLocked || m.has_blueprint || m.blueprint_price_avg || m.is_obtainable)) return false;
    }
    if (m.is_obtainable && m.est_cost == null) return false; // sub-components: dock areas, PHQ asteroid, etc.
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortCol as keyof ModuleSummary];
    const bVal = b[sortCol as keyof ModuleSummary];
    if (aVal === null && bVal !== null) return sortDesc ? 1 : -1;
    if (aVal !== null && bVal === null) return sortDesc ? -1 : 1;
    if (aVal === null && bVal === null) return 0;
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDesc ? bVal - aVal : aVal - bVal;
    }
    return 0;
  });

  const handleSort = (key: string) => {
    const sk = key as SortKey;
    if (sortCol === sk) setSortDesc(!sortDesc);
    else {
      setSortCol(sk);
      setSortDesc(sk === "blueprint_price_avg" || sk === "hull");
    }
  };

  // Column visibility options for MultiSelect
  const columnOptions = useMemo(
    () =>
      ALL_COLUMNS.filter((c) => !(c as any).alwaysVisible).map((c) => ({
        value: c.key,
        label: c.label,
        group: c.groupId,
      })),
    []
  );

  // ── Row groups (when groupBy != "none") ──
  const rowGroups = useMemo((): RowGroup<ModuleSummary>[] | undefined => {
    if (groupBy === "none") return undefined;
    const groups = new Map<string, ModuleSummary[]>();
    for (const m of sorted) {
      let key: string;
      if (groupBy === "dlc") key = formatDlc(m.dlc || "base_game");
      else if (groupBy === "kind") key = KIND_LABELS[m.kind ?? ""] ?? m.kind ?? "—";
      else if (groupBy === "size") key = m.size ?? "—";
      else if (groupBy === "makerrace") key = m.makerrace ?? "—";
      else key = "—";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, rows]) => ({ key, label: <GroupLabel groupBy={groupBy} groupKey={key} factions={factionMap} rows={rows} />, rows }));
  }, [sorted, groupBy, factionMap]);

  // ── Columns ──
  const columns = useMemo<ColumnDef<ModuleSummary>[]>(
    () => [
      {
        key: "name",
        label: "Name",
        sortKey: "name",
        align: "left",
        alwaysVisible: true,
        render: (m) => (
          <div className="flex items-center gap-2">
            {m.icon_url ? (
              <EntityIcon src={m.icon_url} alt={m.name} size={24} className="shrink-0" />
            ) : (
              <div className="w-6 h-6 shrink-0" />
            )}
            <span className="font-medium">{m.name}</span>
            {!m.is_obtainable && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30"
                title="This module cannot be obtained or built by the player.">
                NPC Only
              </span>
            )}
          </div>
        ),
      },
      {
        key: "kind",
        label: "Kind",
        sortKey: "kind",
        groupId: "classification",
        align: "left",
        render: (m) => {
          const color = KIND_COLORS[m.kind ?? ""] ?? "bg-muted text-muted-foreground border-border";
          return (
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border", color)}>
              {KIND_LABELS[m.kind ?? ""] ?? m.kind ?? "—"}
            </span>
          );
        },
      },
      {
        key: "size",
        label: "Size",
        sortKey: "size",
        groupId: "classification",
        align: "left",
        render: (m) => m.size ? <SizeBadge size={moduleSizeToClassId(m.size)} /> : <span className="text-xs text-muted-foreground">—</span>,
      },
      {
        key: "makerrace",
        label: "Faction",
        sortKey: "makerrace",
        groupId: "classification",
        align: "left",
        render: (m) => {
          const faction = m.makerrace ? factionMap.get(m.makerrace) : undefined;
          return faction ? (
            <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />
          ) : (
            <span className="text-xs text-muted-foreground capitalize">{m.makerrace ?? "—"}</span>
          );
        },
      },
      {
        key: "dlc",
        label: "DLC",
        sortKey: "dlc",
        groupId: "classification",
        align: "left",
        render: (m) => (
          <span className={cn("text-xs", m.dlc ? "text-amber-300/80" : "text-muted-foreground")}>
            {formatDlc(m.dlc)}
          </span>
        ),
      },
      {
        key: "hull",
        label: "Hull",
        sortKey: "hull",
        groupId: "stats",
        align: "right",
        render: (m) =>
          m.hull ? (
            <span className="text-xs font-mono tabular-nums">{m.hull.toLocaleString()}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        key: "storage",
        label: "Storage",
        sortKey: "storage_capacity" as SortKey,
        groupId: "stats",
        align: "right",
        render: (m) =>
          m.storage_capacity ? (
            <span className="text-xs font-mono tabular-nums">{m.storage_capacity.toLocaleString()}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      {
        key: "workforce",
        label: "Workforce",
        sortKey: "workforce_capacity" as SortKey,
        groupId: "stats",
        align: "right",
        render: (m) =>
          m.workforce_capacity ? (
            <span className="text-xs font-mono tabular-nums">{m.workforce_capacity.toLocaleString()}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
      },
      { key: "tur_s",  label: "S",  sortKey: "turrets_s" as SortKey,  groupId: "slots-turrets", align: "right", render: (m) => slotNum(m.turrets_s) },
      { key: "tur_m",  label: "M",  sortKey: "turrets_m" as SortKey,  groupId: "slots-turrets", align: "right", render: (m) => slotNum(m.turrets_m) },
      { key: "tur_l",  label: "L",  sortKey: "turrets_l" as SortKey,  groupId: "slots-turrets", align: "right", render: (m) => slotNum(m.turrets_l) },
      { key: "tur_xl", label: "XL", sortKey: "turrets_xl" as SortKey, groupId: "slots-turrets", align: "right", render: (m) => slotNum(m.turrets_xl) },
      { key: "shd_s",  label: "S",  sortKey: "shields_s" as SortKey,  groupId: "slots-shields", align: "right", render: (m) => slotNum(m.shields_s) },
      { key: "shd_m",  label: "M",  sortKey: "shields_m" as SortKey,  groupId: "slots-shields", align: "right", render: (m) => slotNum(m.shields_m) },
      { key: "shd_l",  label: "L",  sortKey: "shields_l" as SortKey,  groupId: "slots-shields", align: "right", render: (m) => slotNum(m.shields_l) },
      { key: "shd_xl", label: "XL", sortKey: "shields_xl" as SortKey, groupId: "slots-shields", align: "right", render: (m) => slotNum(m.shields_xl) },
      {
        key: "licence",
        label: "Licence",
        sortKey: undefined,
        groupId: "unlock",
        align: "left",
        render: (m) => {
          const lic = m.restriction_licence;
          if (!lic) return <span className="text-muted-foreground text-xs">—</span>;
          const hasLicence = !isModuleLicenceLocked(m.makerrace, lic, licenceSet, anyLicenceSet);
          return (
            <span className={cn("text-xs cursor-default", hasLicence ? "text-emerald-400" : "text-red-400/80")}
              title={hasLicence ? `Licence owned (${formatLicence(lic)} from ${licenceSourceLabel(m.makerrace)})` : `Licence locked (requires ${formatLicence(lic)} from ${licenceSourceLabel(m.makerrace)})`}>
              {formatLicence(lic)}
            </span>
          );
        },
      },
      {
        key: "price",
        label: "Blueprint",
        sortKey: "blueprint_price_avg" as SortKey,
        groupId: "unlock",
        align: "right",
        render: (m) => {
          if (m.has_blueprint) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-emerald-400" title={m.blueprint_price_avg ? `Blueprint owned · ${m.blueprint_price_avg.toLocaleString()} Cr` : "Blueprint owned"}>✓</span>
              </span>
            );
          }
          const licenceLocked = isModuleLicenceLocked(m.makerrace, m.restriction_licence, licenceSet, anyLicenceSet);
          if (m.blueprint_price_avg && !licenceLocked) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-amber-400/80" title="Blueprint available for purchase">⊕</span>
                <Currency value={m.blueprint_price_avg} />
              </span>
            );
          }
          const isFreeDefault = !m.blueprint_price_avg && !licenceLocked && m.is_obtainable;
          if (isFreeDefault) {
            return (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="text-emerald-400/60" title="No blueprint required">—</span>
              </span>
            );
          }
          const reason = !m.blueprint_price_avg ? "Blueprint unobtainable" : "Blueprint locked behind licence";
          return (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-red-400/80" title={reason}>✗</span>
              {m.blueprint_price_avg ? <Currency value={m.blueprint_price_avg} /> : <span className="text-muted-foreground">—</span>}
            </span>
          );
        },
      },
      // ── Build ──
      {
        key: "build_time",
        label: "Build",
        sortKey: "build_time_sec" as SortKey,
        groupId: "build",
        align: "right",
        render: (m) =>
          m.build_time_sec != null ? (
            <span className="text-xs font-mono tabular-nums">
              {m.build_time_sec >= 60
                ? `${Math.floor(m.build_time_sec / 60)}m ${Math.round(m.build_time_sec % 60)}s`
                : `${m.build_time_sec.toFixed(0)}s`}
            </span>
          ) : <span className="text-muted-foreground text-xs">—</span>,
      },
      {
        key: "est_cost",
        label: "Est. Cost",
        sortKey: "est_cost" as SortKey,
        groupId: "build",
        align: "right",
        render: (m) =>
          m.est_cost != null ? <Currency value={m.est_cost} /> : <span className="text-muted-foreground text-xs">—</span>,
      },
      // ── Docks ──
      { key: "dock_s_c",  label: "S",  sortKey: "dock_s" as SortKey,  groupId: "docks", align: "right", render: (m) => slotNum(m.dock_s) },
      { key: "dock_m_c",  label: "M",  sortKey: "dock_m" as SortKey,  groupId: "docks", align: "right", render: (m) => slotNum(m.dock_m) },
      { key: "dock_l_c",  label: "L",  sortKey: "dock_l" as SortKey,  groupId: "docks", align: "right", render: (m) => slotNum(m.dock_l) },
      { key: "dock_xl_c", label: "XL", sortKey: "dock_xl" as SortKey, groupId: "docks", align: "right", render: (m) => slotNum(m.dock_xl) },
      { key: "hangar_s_c",label: "H S", sortKey: "hangar_s" as SortKey, groupId: "docks", align: "right", render: (m) => slotNum(m.hangar_s) },
      { key: "hangar_m_c",label: "H M", sortKey: "hangar_m" as SortKey, groupId: "docks", align: "right", render: (m) => slotNum(m.hangar_m) },
      { key: "snap_c",    label: "Snap", sortKey: "snap_points" as SortKey, groupId: "docks", align: "right", render: (m) => slotNum(m.snap_points) },
      // ── Production ──
      {
        key: "produces",
        label: "Produces",
        sortKey: "produces_ware_name" as SortKey,
        groupId: "production",
        align: "left",
        render: (m) =>
          m.produces_ware_name ? (
            <span className="text-xs">{m.produces_ware_name}</span>
          ) : <span className="text-muted-foreground text-xs">—</span>,
      },
      {
        key: "prod_rate",
        label: "Rate/hr",
        sortKey: "production_rate" as SortKey,
        groupId: "production",
        align: "right",
        render: (m) =>
          m.production_rate != null ? (
            <span className="text-xs font-mono tabular-nums">{Math.round(m.production_rate * 3600).toLocaleString()}</span>
          ) : <span className="text-muted-foreground text-xs">—</span>,
      },
      {
        key: "consumes",
        label: "Consumes",
        sortKey: "consumes_ware_name" as SortKey,
        groupId: "production",
        align: "left",
        render: (m) =>
          m.consumes_ware_name ? (
            <span className="text-xs">{m.consumes_ware_name}</span>
          ) : <span className="text-muted-foreground text-xs">—</span>,
      },
      {
        key: "cons_rate",
        label: "Cons./hr",
        sortKey: "consumption_rate" as SortKey,
        groupId: "production",
        align: "right",
        render: (m) =>
          m.consumption_rate != null ? (
            <span className="text-xs font-mono tabular-nums">{Math.round(m.consumption_rate).toLocaleString()}</span>
          ) : <span className="text-muted-foreground text-xs">—</span>,
      },
    ],
    [licenceSet, anyLicenceSet, factionMap]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">Station Modules</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold">
          {modules.length} buildable modules · hull, storage, turret &amp; shield hardpoints, blueprint prices
        </p>
      </div>

      <FilterBar>
        <SearchInput placeholder="Search modules…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select value={selectedKind} onValueChange={setSelectedKind}>
          <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="All kinds" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {kinds.map((k) => {
              const color = KIND_COLORS[k] ?? "bg-muted text-muted-foreground border-border";
              return (
                <SelectItem key={k} value={k}>
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border", color)}>
                    {KIND_LABELS[k] ?? k}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select value={selectedSize} onValueChange={setSelectedSize}>
          <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="All sizes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sizes</SelectItem>
            <SelectItem value="none">None</SelectItem>
            {sizes.map((s) => (<SelectItem key={s} value={s}><SizeBadge size={moduleSizeToClassId(s)} /></SelectItem>))}
          </SelectContent>
        </Select>
        <MultiSelect
          options={[
            { value: "__none__", label: "None" },
            ...availableFactions.map((f) => { const fac = factionMap.get(f); return { value: f, label: fac?.name ?? f, node: fac ? <FactionBadge name={fac.name} color_hex={fac.color_hex} icon_url={fac.icon_url} faction_id={fac.faction_id} /> : undefined }; }),
          ]}
          selected={selectedFactions}
          onChange={setSelectedFactions}
          placeholder="Factions…"
          className="h-7 text-xs w-40"
        />
        <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
          <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="All modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="ready">Ready to Build</SelectItem>
            <SelectItem value="purchasable">Purchasable</SelectItem>
            <SelectItem value="locked">Locked</SelectItem>
            <SelectItem value="unavailable">Unavailable</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 cursor-pointer">
          <Switch id="obtainable-only" checked={obtainableOnly} onCheckedChange={setObtainableOnly} />
          <span className="text-xs text-muted-foreground whitespace-nowrap">Obtainable</span>
        </label>
        {/* Right: column visibility + group-by */}
        <div className="ml-auto flex items-center gap-3">
          <div className="h-5 w-px bg-border/50" />
          <MultiSelect
            options={columnOptions}
            selected={visibleColumns}
            onChange={setVisibleColumns}
            placeholder="Columns"
            className="h-7 text-xs w-36"
            hideClear
          />
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupByKey)}>
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue placeholder="Group by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="kind">Kind</SelectItem>
              <SelectItem value="size">Size</SelectItem>
              <SelectItem value="dlc">DLC</SelectItem>
              <SelectItem value="makerrace">Faction</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-2 flex flex-col min-h-0">
        <HUDCard className="h-full">
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <PageLoaderPreset preset="trade" />
            ) : (
              <DataTable
                columns={columns}
                columnGroups={COLUMN_GROUPS}
                rows={sorted}
                rowGroups={rowGroups}
                getRowKey={(m) => m.module_id}
                sortKey={sortCol}
                sortDir={sortDesc ? "desc" : "asc"}
                onSortChange={(k) => handleSort(k)}
                visibleColumns={visibleColumns}
                onRowClick={(m) => setSelectedModule(m)}
                emptyMessage="No modules match your filters."
              />
            )}
          </div>
        </HUDCard>
      </div>

      <Dialog open={selectedModule !== null} onOpenChange={(open) => { if (!open) setSelectedModule(null); }}>
        <DialogContent className="sm:max-w-2xl md:max-w-3xl min-h-[50vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>{selectedModule?.name ?? "Module details"}</DialogTitle>
            <DialogDescription>Detailed stats for {selectedModule?.name}</DialogDescription>
          </DialogHeader>
          {selectedModule && <ModuleDetailPanel moduleId={selectedModule.module_id} summary={selectedModule} factions={factions} licenceSet={licenceSet} anyLicenceSet={anyLicenceSet} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function slotNum(n: number) {
  if (!n) return <span className="text-muted-foreground/40 text-xs">—</span>;
  return <span className="text-xs font-mono tabular-nums">{n}</span>;
}

function GroupLabel({ groupBy, groupKey, factions, rows }: { groupBy: GroupByKey; groupKey: string; factions: Map<string, FactionSummary>; rows: ModuleSummary[] }) {
  if (groupBy === "kind") {
    const color = KIND_COLORS[rows[0]?.kind ?? ""] ?? "bg-muted";
    return <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-sm font-semibold", color)}>{groupKey}</span>;
  }
  if (groupBy === "size" && rows[0]?.size) {
    return <SizeBadge size={moduleSizeToClassId(rows[0].size)} />;
  }
  if (groupBy === "makerrace") {
    const faction = factions.get(rows[0]?.makerrace ?? "");
    if (faction) return <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />;
  }
  return <span className="text-sm font-semibold text-foreground">{groupKey}</span>;
}

function buildSetColor(ref: string): string {
  if (ref === "factory" || ref === "headquarters_player") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (ref.startsWith("tradestation_")) return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  if (ref.includes("xenon")) return "bg-red-500/10 text-red-400 border-red-500/20";
  return "bg-primary/10 text-primary border-primary/20";
}

function formatBuildSetTag(ref: string): string {
  const tags: Record<string, string> = {
    factory: "Factory", headquarters_player: "Player HQ", piratebase: "Pirate Base",
    defence_xenon: "Xenon Defence", factory_xenon: "Xenon Factory", shipyard_xenon: "Xenon Shipyard",
    tradestation_argon: "Argon Trade Station", tradestation_teladi: "Teladi Trade Station",
    tradestation_paranid: "Paranid Trade Station", tradestation_split: "Split Trade Station",
    tradestation_boron: "Boron Trade Station", tradestation_terran: "Terran Trade Station",
    station_yaki: "Yaki Base",
  };
  return tags[ref] ?? ref.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ModuleStatRow({ label, value, maxVal, unit }: { label: string; value: number | null; maxVal: number; unit?: string }) {
  if (value == null || value === 0) {
    return (
      <div className="flex items-center gap-3 py-1 group">
        <span className="w-[110px] shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="flex-1" />
        <span className="w-[80px] text-right text-xs text-muted-foreground">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-1 group">
      <span className="w-[110px] shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <div className="flex-1 min-w-[40px]">
        <StatBar value={value} max={maxVal} width={100} height={6} className="w-full" />
      </div>
      <div className="w-[80px] shrink-0 flex justify-end items-baseline gap-1 text-right">
        <span className="font-mono text-xs text-foreground font-medium whitespace-nowrap">{value.toLocaleString()}</span>
        {unit && <span className="text-[9px] text-muted-foreground shrink-0">{unit}</span>}
      </div>
    </div>
  );
}

function UnlockGuide({ d, faction, licenceLocked }: {
  d: ModuleDetail;
  faction: FactionSummary | undefined;
  licenceLocked: boolean;
}) {
  const lic = d.restriction_licence;

  return (
    <div className="space-y-5">
      {/* Status header */}
      <div className="flex items-center gap-3">
        {d.has_blueprint ? (
          <>
            <span className="text-emerald-400 text-lg">✓</span>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Blueprint Owned</p>
              <p className="text-xs text-muted-foreground">You already have this blueprint.</p>
            </div>
          </>
        ) : !d.is_obtainable ? (
          <>
            <span className="text-red-400/80 text-lg">✗</span>
            <div>
              <p className="text-sm font-semibold text-red-400/80">Unobtainable</p>
              <p className="text-xs text-muted-foreground">This module cannot be acquired by the player.</p>
            </div>
          </>
        ) : (
          <>
            <span className="text-amber-400/80 text-lg">⊕</span>
            <div>
              <p className="text-sm font-semibold text-amber-400/80">Blueprint Available</p>
              <p className="text-xs text-muted-foreground">
                {d.blueprint_price_avg != null
                  ? <>Purchase for <Currency value={d.blueprint_price_avg} /></>
                  : "No cost — default blueprint"}
              </p>
            </div>
          </>
        )}
      </div>

      {/* How to get it (only when not owned and obtainable) */}
      {!d.has_blueprint && d.is_obtainable && (
        <div className="rounded-lg border border-border/50 bg-muted/5 p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">How to Acquire</p>

          {/* Faction purchase */}
          {d.makerrace ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Purchase from</span>
              {faction ? (
                <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} />
              ) : (
                <span className="text-xs capitalize">{d.makerrace}</span>
              )}
              <span className="text-xs text-muted-foreground">representative</span>
            </div>
          ) : d.blueprint_price_avg != null ? (
            <p className="text-xs text-muted-foreground">
              Available from any faction representative with the required licence.
            </p>
          ) : null}

          {/* Licence requirement */}
          {lic ? (
            <div className="flex items-center gap-2 pt-1 border-t border-border/30">
              <span className="text-xs text-muted-foreground">Requires licence:</span>
              <span className={cn(
                "text-xs font-medium",
                !licenceLocked ? "text-emerald-400" : "text-red-400/80"
              )}>
                {formatLicence(lic)}
              </span>
              {!licenceLocked ? (
                <span className="text-xs text-emerald-400/70">✓ Owned</span>
              ) : (
                <span className="text-xs text-red-400/70">
                  ✗ from {licenceSourceLabel(d.makerrace)}
                </span>
              )}
            </div>
          ) : d.blueprint_price_avg != null ? (
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/30">
              No faction licence required — purchase directly from the representative.
            </p>
          ) : null}
        </div>
      )}

      {/* Price range */}
      {d.blueprint_price_min != null && d.blueprint_price_max != null && !d.has_blueprint && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Price range: <Currency value={d.blueprint_price_min} /> – <Currency value={d.blueprint_price_max} /></p>
        </div>
      )}
    </div>
  );
}

export function ModuleDetailPanel({ moduleId, summary, factions, licenceSet, anyLicenceSet }: { moduleId: string; summary: ModuleSummary; factions: FactionSummary[]; licenceSet: Set<string>; anyLicenceSet: Set<string> }) {
  const { data: m } = useQuery<ModuleDetail>({
    queryKey: ["module", moduleId],
    queryFn: () => apiGet<ModuleDetail>(`/api/v1/modules/${moduleId}`),
    staleTime: 5 * 60_000,
    placeholderData: summary as ModuleDetail,
  });
  const d = m ?? (summary as ModuleDetail);
  const slotSizes = ["s", "m", "l", "xl"] as const;
  const hasDescription = d.description && d.description !== "No information available";
  const hasBuildResources = d.construction_resources && d.construction_resources.length > 0;
  const faction = d.makerrace ? factions.find((f) => f.faction_id === d.makerrace) : undefined;
  const hasDocks = d.dock_s > 0 || d.dock_m > 0 || d.dock_l > 0 || d.dock_xl > 0;
  const hasHangar = d.hangar_s > 0 || d.hangar_m > 0;
  const licenceLocked = isModuleLicenceLocked(d.makerrace, d.restriction_licence, licenceSet, anyLicenceSet);

  return (
    <div className="flex flex-col h-full -mx-6 -my-6">
      <div className="flex flex-col sm:flex-row gap-6 px-6 pt-6 pb-4">
        <div className="shrink-0 w-full sm:w-48 h-40 sm:h-48 flex items-center justify-center rounded-xl bg-muted/10 border border-border/60">
          {d.icon_url ? (
            <img src={d.icon_url} alt={d.name} className="w-32 h-32 object-contain transition-transform hover:scale-105 duration-500" />
          ) : (
            <Database className="w-16 h-16 text-muted-foreground/30" />
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center min-w-0 py-1">
          <div className="flex items-center gap-3 min-w-0">
            {d.icon_url && <EntityIcon src={d.icon_url} alt={d.name} size={28} className="opacity-70 shrink-0" />}
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight truncate" title={d.name}>{d.name}</h2>
          </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-sm font-medium border", KIND_COLORS[d.kind ?? ""] ?? "bg-muted text-muted-foreground border-border")}>
              {KIND_LABELS[d.kind ?? ""] ?? d.kind ?? "Module"}
            </span>
            {d.size && <SizeBadge size={moduleSizeToClassId(d.size)} className="text-sm" />}
            {faction && <FactionBadge name={faction.name} color_hex={faction.color_hex} icon_url={faction.icon_url} faction_id={faction.faction_id} size="md" className="text-sm" />}
            <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-sm border", d.dlc ? "bg-amber-500/10 text-amber-300 border-amber-500/30" : "bg-muted/50 text-muted-foreground border-border")}>
              {formatDlc(d.dlc)}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            {/* Blueprint */}
            {d.has_blueprint ? (
              <div className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Blueprint</span>
                <span className="text-xs text-emerald-400 font-medium">Owned</span>
                {d.blueprint_price_avg && <span className="text-xs text-muted-foreground">· <Currency value={d.blueprint_price_avg} /></span>}
              </div>
            ) : d.blueprint_price_avg ? (
              licenceLocked ? (
                <div className="flex items-center gap-2">
                  <span className="text-red-400/80">✗</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Blueprint</span>
                  <Currency value={d.blueprint_price_avg} />
                  <span className="text-xs text-red-400/80">· Locked behind licence</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-amber-400/80">⊕</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Blueprint</span>
                  <Currency value={d.blueprint_price_avg} />
                  <span className="text-xs text-amber-400/80">· Available for purchase</span>
                </div>
              )
            ) : d.is_obtainable ? (
              <div className="flex items-center gap-2">
                <span className="text-emerald-400/60">—</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Blueprint</span>
                <span className="text-xs text-muted-foreground">No blueprint required</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-red-400/80">✗</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Blueprint</span>
                <span className="text-xs text-muted-foreground">Unobtainable</span>
              </div>
            )}
            {/* Licence */}
            <div className="flex items-center gap-2">
              {d.restriction_licence ? (
                !isModuleLicenceLocked(d.makerrace, d.restriction_licence, licenceSet, anyLicenceSet) ? (
                  <>
                    <span className="text-emerald-400">✓</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Licence</span>
                    <span className="text-xs text-emerald-400 font-medium">{formatLicence(d.restriction_licence)}</span>
                    <span className="text-xs text-muted-foreground">· Owned</span>
                  </>
                ) : (
                  <>
                    <span className="text-red-400/80">✗</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Licence</span>
                    <span className="text-xs text-red-400/80 font-medium">{formatLicence(d.restriction_licence)}</span>
                    <span className="text-xs text-muted-foreground">· Required from {d.makerrace}</span>
                  </>
                )
              ) : (
                <>
                  <span className="text-emerald-400/60">—</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Licence</span>
                  <span className="text-xs text-muted-foreground">None required</span>
                </>
              )}
            </div>
          </div>
          {d.build_sets && (
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Buildable at:</span>
              {d.build_sets.split(" ").map((s) => (
                <span key={s} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border", buildSetColor(s))}>{formatBuildSetTag(s)}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <div className="border-b border-border/40 pb-px mt-2 px-6">
          <TabsList className="bg-transparent border-none p-0 h-auto space-x-6 w-full justify-start">
            <TabsTrigger value="overview" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Overview</TabsTrigger>
            {d.storage_capacity != null && d.storage_capacity > 0 && (
              <TabsTrigger value="storage" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Storage</TabsTrigger>
            )}
            {d.kind === "production" && (
              <TabsTrigger value="production" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Production</TabsTrigger>
            )}
            {(hasDocks || hasHangar) && (
              <TabsTrigger value="docking" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Docking</TabsTrigger>
            )}
            {hasBuildResources && (
              <TabsTrigger value="build" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">Build</TabsTrigger>
            )}
            {!d.has_blueprint && (
              <TabsTrigger value="unlock" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1 pb-3 pt-2 font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors hover:text-foreground">How to Unlock</TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="space-y-6 pt-5 px-6 pb-6 outline-none">
          <div className="bg-muted/10 border border-border/50 rounded-lg overflow-hidden">
            <div className="px-4 pt-3 pb-1 border-b border-border/30">
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Global Stats</span>
            </div>
            <div className="p-5 pt-4">
              <div className="flex flex-col gap-2 max-w-md">
                <ModuleStatRow label="Hull" value={d.hull} maxVal={5000000} unit="HP" />
                <ModuleStatRow label="Explosion Dmg" value={d.explosiondamage} maxVal={20000} unit="" />
                <ModuleStatRow label="Expl. Shield Dmg" value={d.explosion_shield_damage} maxVal={50000} unit="" />
                {d.secrecy_level != null && (
                  <div className="flex items-center gap-3 py-1">
                    <span className="w-[110px] shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">Secrecy Level</span>
                    <span className="font-mono text-xs text-foreground font-medium">{d.secrecy_level}</span>
                  </div>
                )}
                {d.snap_points > 0 && (
                  <div className="flex items-center gap-3 py-1">
                    <span className="w-[110px] shrink-0 text-xs font-bold uppercase tracking-wider text-muted-foreground">Snap Points</span>
                    <span className="font-mono text-xs text-foreground font-medium">{d.snap_points}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workforce — cross-kind (production, habitation, buildmodule) */}
          {(d.workforce_capacity != null && d.workforce_capacity > 0) && (
            <div className="rounded-lg border border-border/50 bg-muted/5 px-6 py-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Workforce</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Capacity</span>
                  <div className="font-mono text-lg font-semibold">{d.workforce_capacity.toLocaleString()}</div>
                </div>
                {d.workforce_race && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">Race</span>
                    <div className="font-semibold capitalize">{d.workforce_race}</div>
                  </div>
                )}
                {d.workforce_growthrate != null && (
                  <div>
                    <span className="text-xs text-muted-foreground uppercase">Growth Rate</span>
                    <div className="font-mono font-semibold text-emerald-400">+{((d.workforce_growthrate ?? 0) * 100).toFixed(0)}%</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(d.turrets_s > 0 || d.turrets_m > 0 || d.turrets_l > 0 || d.turrets_xl > 0 ||
            d.shields_s > 0 || d.shields_m > 0 || d.shields_l > 0 || d.shields_xl > 0) && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Equipment Slots</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left text-muted-foreground font-medium py-2 pl-4 text-xs">Type</th>
                      {slotSizes.map((s) => (<th key={s} className="text-center text-muted-foreground font-medium py-2 w-12 text-xs">{s.toUpperCase()}</th>))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="py-2 pl-4 text-muted-foreground text-xs">Turrets</td>
                      {slotSizes.map((s) => { const val = (d as Record<string, unknown>)[`turrets_${s}`] as number; return (<td key={s} className="py-2 text-center text-sm">{val > 0 ? <span className="font-medium">{val}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}</td>); })}
                    </tr>
                    <tr className="border-t border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="py-2 pl-4 text-muted-foreground text-xs">Shields</td>
                      {slotSizes.map((s) => { const val = (d as Record<string, unknown>)[`shields_${s}`] as number; return (<td key={s} className="py-2 text-center text-sm">{val > 0 ? <span className="font-medium">{val}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}</td>); })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Description */}
          {hasDescription && (
            <div className="rounded-lg border border-border/50 bg-muted/5 px-6 py-5">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{d.description}</p>
            </div>
          )}

          <div className="text-center text-[10px] text-muted-foreground/50 font-mono">{d.module_id}</div>
        </TabsContent>

        {/* ── Storage tab ── */}
        {d.storage_capacity != null && d.storage_capacity > 0 && (
          <TabsContent value="storage" className="space-y-6 pt-5 px-6 pb-6 outline-none">
            <div className="rounded-lg border border-border/50 bg-muted/5 px-6 py-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Storage</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Capacity</span>
                  <div className="font-mono text-lg font-semibold">{d.storage_capacity.toLocaleString()} m³</div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase">Type</span>
                  <div className="font-semibold capitalize">{d.storage_type ?? "—"}</div>
                </div>
              </div>
              {d.hull_integrated && (
                <div className="mt-3 text-xs text-muted-foreground">Hull is integrated (no standalone hull value).</div>
              )}
            </div>
          </TabsContent>
        )}

        {/* ── Production tab ── */}
        {d.kind === "production" && d.produces_ware_id && (
          <TabsContent value="production" className="pt-5 px-6 pb-6 outline-none">
            <ProductionChain wareId={d.produces_ware_id} filterMethod={d.production_method ?? undefined} />
          </TabsContent>
        )}

        {/* ── Docking tab ── */}
        {(hasDocks || hasHangar) && (
          <TabsContent value="docking" className="space-y-6 pt-5 px-6 pb-6 outline-none">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Dock Pads</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>{slotSizes.map((s) => (<th key={s} className="text-center text-muted-foreground font-medium py-2 w-14 text-xs">{s.toUpperCase()}</th>))}</tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-muted/10 transition-colors">
                      {slotSizes.map((s) => { const v = (d as Record<string,unknown>)[`dock_${s}`] as number; return (<td key={s} className="py-2 text-center text-sm">{v > 0 ? <span className="font-mono font-medium">{v}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}</td>); })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {hasHangar && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Internal Ship Storage</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr>{["S","M"].map((s) => (<th key={s} className="text-center text-muted-foreground font-medium py-2 w-14 text-xs">{s}</th>))}</tr>
                    </thead>
                    <tbody>
                      <tr className="hover:bg-muted/10 transition-colors">
                        {(["hangar_s","hangar_m"] as const).map((k) => { const v = (d as Record<string,unknown>)[k] as number; return (<td key={k} className="py-2 text-center text-sm">{v > 0 ? <span className="font-mono font-medium">{v}</span> : <span className="text-muted-foreground/40 text-xs">—</span>}</td>); })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {d.drone_capacity != null && d.drone_capacity > 0 && (
              <div className="rounded-lg border border-border/50 bg-muted/5 px-6 py-4">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Drone Capacity</span>
                <div className="mt-1 font-mono text-sm font-semibold">{d.drone_capacity.toLocaleString()}</div>
              </div>
            )}
          </TabsContent>
        )}

        {/* ── Build tab ── */}
        {hasBuildResources && (
          <TabsContent value="build" className="pt-5 px-6 pb-6 outline-none space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {d.est_cost != null && (
                <div className="rounded-lg border border-border/50 bg-muted/5 px-4 py-3">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Est. Construction Cost</span>
                  <div className="mt-1"><Currency value={d.est_cost} /></div>
                </div>
              )}
              {d.build_time_sec != null && (
                <div className="rounded-lg border border-border/50 bg-muted/5 px-4 py-3">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Build Time</span>
                  <div className="mt-1 text-sm font-mono font-medium">
                    {d.build_time_sec >= 60
                      ? `${Math.floor(d.build_time_sec / 60)}m ${Math.round(d.build_time_sec % 60)}s`
                      : `${d.build_time_sec.toFixed(0)}s`}
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Required Resources</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="text-left text-muted-foreground font-medium py-2 pl-4 text-xs">Ware</th>
                      <th className="text-right text-muted-foreground font-medium py-2 w-20 text-xs">Amount</th>
                      <th className="text-right text-muted-foreground font-medium py-2 w-24 text-xs">Unit Price</th>
                      <th className="text-right text-muted-foreground font-medium py-2 w-24 pr-4 text-xs">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.construction_resources!.map((r, i) => (
                      <tr key={r.ware_id} className={cn("border-t border-border/50 hover:bg-muted/10 transition-colors", i === d.construction_resources!.length - 1 && "font-semibold")}>
                        <td className="py-2 pl-4 text-xs">{r.name}</td>
                        <td className="py-2 text-right text-xs font-mono tabular-nums">{r.amount.toLocaleString()}</td>
                        <td className="py-2 text-right text-xs font-mono tabular-nums text-muted-foreground"><Currency value={r.price_avg} icon={false} /></td>
                        <td className="py-2 text-right text-xs font-mono tabular-nums pr-4"><Currency value={r.total} icon={false} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="unlock" className="pt-5 px-6 pb-6 outline-none">
          <UnlockGuide d={d} faction={faction} licenceLocked={licenceLocked} />
        </TabsContent>

        {hasDescription && (
          <TabsContent value="description" className="pt-4 px-6 pb-6 outline-none flex-1">
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed max-w-4xl">{d.description}</p>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
