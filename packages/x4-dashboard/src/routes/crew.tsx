import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Search, X, Ship, Building2 } from "lucide-react";
import { PageLoaderPreset } from "../components/PageLoader";
import { HUDCard } from "../components/HUDCard";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "../components/ui/table";
import { SortHeader } from "../components/ui/sort-header";
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
  aipilot: { label: "Pilot", color: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  defence: { label: "Defence", color: "bg-red-500/15 text-red-400 border-red-500/30" },
  engineer: { label: "Engineer", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  manager: { label: "Manager", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  trader: { label: "Trader", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  marine: { label: "Marine", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
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
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border", color)}>
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
          (n.name?.toLowerCase().includes(q)) ||
          (n.code?.toLowerCase().includes(q)) ||
          (n.entity_post?.toLowerCase().includes(q))
        );
      })
    : npcs;

  const { sorted, key, dir, toggle } = useSort(
    filtered,
    {
      name: (n) => n.name ?? n.code ?? "",
      role: (n) => n.entity_post ?? "\uffff",
      race: (n) => raceFromMacro(n.macro),
      code: (n) => n.code ?? "\uffff",
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

      {/* Filters */}
      <div className="px-6 pt-4 shrink-0 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, code, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/30 pl-8 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setEmployment(tab.key)}
              className={cn(
                "px-2 py-1 rounded text-xs font-medium transition-colors border",
                employment === tab.key
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden px-6 pb-6 pt-3">
        <HUDCard className="h-full flex flex-col">
          <div className="flex-1 overflow-auto">
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Users className="h-10 w-10 opacity-30" />
                <p className="text-sm">No crew found.</p>
                <p className="text-xs">Activate a save and re-ingest to populate crew data.</p>
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <SortHeader label="Name" active={key === "name"} dir={dir} onClick={() => toggle("name", "asc")} />
                    <SortHeader label="Role" active={key === "role"} dir={dir} onClick={() => toggle("role", "asc")} />
                    <SortHeader label="Race" active={key === "race"} dir={dir} onClick={() => toggle("race", "asc")} />
                    <SortHeader label="Code" active={key === "code"} dir={dir} onClick={() => toggle("code", "asc")} />
                    <SortHeader label="Location" active={key === "location"} dir={dir} onClick={() => toggle("location", "asc")} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((npc) => (
                    <TableRow key={npc.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {npc.name || npc.code || "Unknown"}
                          {npc.employment === "owned" && (
                            <span className="shrink-0 px-1 py-0 rounded text-[9px] font-semibold uppercase bg-primary/10 text-primary">Own</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{roleBadge(npc.entity_post)}</TableCell>
                      <TableCell className="text-muted-foreground">{raceFromMacro(npc.macro)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono">{npc.code || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {npc.location_ship_id && <Ship className="h-3 w-3" />}
                          {npc.location_station_id && <Building2 className="h-3 w-3" />}
                          {locationLabel(npc)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </HUDCard>
      </div>
    </div>
  );
}
