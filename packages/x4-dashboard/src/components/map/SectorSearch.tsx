// Sector-only search with keyboard navigation (↑/↓ to move, Enter to select, Escape to close).

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
        ownerName: faction?.name ?? "Unknown",
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [sectors, sectorName, factionMap, clusterMap]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return [];
    return options.filter(o =>
      o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
    ).slice(0, 80);
  }, [options, filter]);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(-1); }, [filtered]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const select = useCallback((id: string) => {
    onSelectSector(id);
    setFilter("");
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, [onSelectSector]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) {
      if (e.key === "Escape") { setFilter(""); setIsOpen(false); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // If a row is highlighted use it; if exactly one result, jump there directly
      const target = activeIndex >= 0 ? filtered[activeIndex] : filtered.length === 1 ? filtered[0] : null;
      if (target) select(target.id);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  }, [isOpen, filtered, activeIndex, select]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2 w-[280px] px-[13px] py-[9px] bg-[#0a0f1a]/85 backdrop-blur-[12px] border border-white/10 rounded-[11px]">
        <Search className="w-[15px] h-[15px] text-[#6b7890] shrink-0" strokeWidth={1.9} />
        <input
          ref={inputRef}
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setIsOpen(true); }}
          onFocus={() => { if (filter.trim()) setIsOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Search sectors…"
          className="flex-1 bg-transparent border-none outline-none text-[#e7edf6] text-[13px] font-['Space_Grotesk',sans-serif] placeholder:text-[#6b7890]"
        />
      </div>

      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute top-[48px] left-0 right-0 max-h-[28rem] overflow-y-auto bg-[#0d121e]/96 backdrop-blur-[16px] border border-white/10 rounded-[11px] shadow-[0_14px_40px_rgba(0,0,0,0.5)] z-50"
        >
          {filtered.map((s, index) => (
            <button
              key={s.id}
              onClick={() => select(s.id)}
              className={`w-full flex items-center gap-[10px] px-[13px] py-[10px] text-left transition-colors ${
                index === activeIndex ? "bg-white/[0.08]" : "hover:bg-white/5"
              } ${index !== filtered.length - 1 ? "border-b border-white/[0.04]" : ""}`}
              title={s.name}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[13px] text-[#e7edf6] flex-1 truncate">{s.name}</span>
              <span className="text-[11px] text-[#6b7890] shrink-0">{s.ownerName}</span>
            </button>
          ))}
        </div>
      )}

      {isOpen && filter.trim() !== "" && filtered.length === 0 && (
        <div className="absolute top-[48px] left-0 right-0 bg-[#0d121e]/96 backdrop-blur-[16px] border border-white/10 rounded-[11px] shadow-[0_14px_40px_rgba(0,0,0,0.5)] z-50">
          <div className="text-[13px] text-[#6b7890] px-[13px] py-[10px] text-center">No sectors found</div>
        </div>
      )}
    </div>
  );
}
