import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Ship, Building2 } from "lucide-react";
import { PageLoaderPreset } from "../components/PageLoader";
import { HUDCard } from "../components/HUDCard";
import { FilterBar } from "../components/FilterBar";
import { SearchInput } from "../components/ui/search-input";
import { DataTable } from "../components/DataTable";
import type { ColumnDef } from "../components/DataTable";
import { useSort } from "../lib/useSort";
import { cn } from "../lib/utils";

type NPCEntry = {
  id: string;
  name: string | null;
  code: string | null;
  macro: string | null;
  owner_faction: string | null;
  entity_type: string | null;
  entity_post: string | null;
  seed: string | null;
  location_ship_id: string | null;
  location_station_id: string | null;
  employment: string;
  extra_json: string | null;
};

const ROLE_META: Record<string, { label: string; color: string }> = {
  aipilot:  { label: "Pilot",    color: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  defence:  { label: "Defence",  color: "bg-red-500/15 text-red-400 border-red-500/30" },
  engineer: { label: "Engineer", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  manager:  { label: "Manager",  color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  trader:   { label: "Trader",   color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  marine:   { label: "Marine",   color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
};

const TABS = [
  { key: "", label: "All" },
  { key: "owned", label: "My Crew" },
  { key: "hireable", label: "Hireable" },
] as const;

function roleBadge(post: string | null) {
  if (!post) return null;
  const meta = ROLE_META[post];
  const label = meta?.label ?? post;
  const color = meta?.color ?? "bg-muted/50 text-muted-foreground border-border";
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

function raceFromMacro(macro: string | null): string {
  if (!macro) return "Unknown";
  const m = macro.match(/character_(\w+)_/);
  if (!m) return "Unknown";
  const race = m[1];
  const map: Record<string, string> = {
    argon: "Argon", teladi: "Teladi", paranid: "Paranid", split: "Split",
    terran: "Terran", yaki: "Yaki", pioneers: "Pioneer",
  };
  return map[race] ?? race.charAt(0).toUpperCase() + race.slice(1);
}

function locationLabel(npc: NPCEntry): string {
  if (npc.location_ship_id) return "Ship";
  if (npc.location_station_id) return "Station";
  return "—";
}

const COLUMNS: ColumnDef<NPCEntry>[] = [
  {
    key: "name",
    label: "Name",
    sortKey: "name",
    align: "left",
    render: (npc) => (
      <div className="flex items-center gap-1.5 font-medium">
        {npc.name || npc.code || "Unknown"}
        {npc.employment === "owned" && (
          <span className="shrink-0 px-1 py-0 rounded text-[9px] font-semibold uppercase bg-primary/10 text-primary">
            Own
          </span>
        )}
      </div>
    ),
  },
  {
    key: "role",
    label: "Role",
    sortKey: "role",
    align: "left",
    render: (npc) => roleBadge(npc.entity_post),
  },
  {
    key: "race",
    label: "Race",
    sortKey: "race",
    align: "left",
    render: (npc) => (
      <span className="text-muted-foreground">{raceFromMacro(npc.macro)}</span>
    ),
  },
  {
    key: "code",
    label: "Code",
    sortKey: "code",
    align: "left",
    render: (npc) => (
      <span className="text-muted-foreground font-mono">{npc.code || "—"}</span>
    ),
  },
  {
    key: "location",
    label: "Location",
    sortKey: "location",
    align: "left",
    render: (npc) => (
      <span className="text-muted-foreground flex items-center gap-1">
        {npc.location_ship_id && <Ship className="h-3 w-3" />}
        {npc.location_station_id && <Building2 className="h-3 w-3" />}
        {locationLabel(npc)}
      </span>
    ),
  },
];

export default function CrewPage() {
  const [employment, setEmployment] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: npcs = [], isLoading } = useQuery<NPCEntry[]>({
    queryKey: ["npcs", employment],
    queryFn: () => {
      const params = new URLSearchParams();
      if (employment) params.set("employment", employment);
      params.set("limit", "2000");
      return fetch(`/api/v1/npcs?${params}`).then((r) => r.json());
    },
  });

  const filtered = search
    ? npcs.filter((n) => {
        const q = search.toLowerCase();
        return (
          n.name?.toLowerCase().includes(q) ||
          n.code?.toLowerCase().includes(q) ||
          n.entity_post?.toLowerCase().includes(q)
        );
      })
    : npcs;

  const { sorted, key, dir, toggle } = useSort(
    filtered,
    {
      name:     (n) => n.name ?? n.code ?? "",
      role:     (n) => n.entity_post ?? "￿",
      race:     (n) => raceFromMacro(n.macro),
      code:     (n) => n.code ?? "￿",
      location: (n) => locationLabel(n),
    },
    { key: "name", dir: "asc" }
  );

  if (isLoading) return <PageLoaderPreset preset="default" />;

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
          placeholder="Search by name, code, or role…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          containerClassName="flex-1 min-w-[200px] max-w-sm"
        />
        <div className="flex items-center gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setEmployment(tab.key)}
              className={cn(
                "px-2 py-1 rounded-[4px] text-xs font-medium transition-colors border",
                employment === tab.key
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </FilterBar>

      <div className="flex-1 overflow-hidden px-6 pb-6 pt-2 min-h-0">
        <HUDCard className="h-full flex flex-col">
          <div className="flex-1 overflow-auto">
            <DataTable
              columns={COLUMNS}
              rows={sorted}
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
