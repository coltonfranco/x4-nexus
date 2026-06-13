import { useState, useMemo, useRef, useEffect } from "react";
import { Search } from "lucide-react";
import type { Sector, FactionSummary, Cluster } from "../../lib/map/types";
import { MAP_THEME } from "../../lib/map/constants";

export function SectorSearch({
  sectors,
  sectorName,
  factionMap,
  clusterMap,
  onSelectSector,
}: {
  sectors: Sector[];
  sectorName: (id: string) => string;
  factionMap: Map<string, FactionSummary>;
  clusterMap: Map<string, Cluster>;
  onSelectSector: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const options = useMemo(() => {
    return sectors.map(s => {
      let owner = s.owner_faction;
      if (!owner && s.cluster_id) {
        owner = clusterMap.get(s.cluster_id)?.owner_faction ?? null;
      }
      const faction = owner ? factionMap.get(owner) : null;
      const color = faction?.color_hex ?? MAP_THEME.sectorFallback;

      return {
        id: s.sector_id,
        name: sectorName(s.sector_id),
        color,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [sectors, sectorName, factionMap, clusterMap]);

  const filtered = useMemo(() => {
    const q = filter.toLowerCase();
    if (!q) return options;
    return options.filter(o => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)).slice(0, 100);
  }, [options, filter]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative flex items-center" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input 
          value={filter} 
          onChange={(e) => {
            setFilter(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Find Sector..."
          className="w-64 text-xs pl-8 pr-2 py-1.5 rounded bg-muted/50 border border-border focus:outline-none focus:border-primary/60 transition-colors" 
        />
      </div>

      {isOpen && (
        <div className="absolute top-full mt-1 right-0 w-64 max-h-[28rem] overflow-y-auto bg-popover border border-border rounded shadow-lg z-50 flex flex-col p-1.5 gap-0.5">
          {filtered.length > 0 ? (
            filtered.map((s) => (
              <button key={s.id} 
                onClick={() => {
                  onSelectSector(s.id);
                  setFilter("");
                  setIsOpen(false);
                }}
                className="flex items-center gap-3 text-left text-sm px-2.5 py-2 rounded transition-colors hover:bg-muted/60 hover:text-foreground truncate"
                title={s.name}
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="truncate">{s.name}</span>
              </button>
            ))
          ) : (
            <div className="text-xs text-muted-foreground px-2 py-2 text-center">No sectors found</div>
          )}
        </div>
      )}
    </div>
  );
}
