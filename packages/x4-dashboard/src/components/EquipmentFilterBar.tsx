import { X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { FactionCombobox } from "./FactionCombobox";
import { EquipmentMkBadge } from "./ShipBadges";
import { cn } from "../lib/utils";

export interface SortOption {
  id: string;
  label: string;
  desc?: boolean;
  eval?: (item: any) => any;
}

export interface EquipmentFilterBarProps {
  categoryKind: string;
  
  availableFactions: string[];
  factions: any[]; 
  factionFilter: string;
  setFactionFilter: (val: string) => void;
  
  availableMks: number[];
  mkFilter: string;
  setMkFilter: (val: string) => void;
  
  availableTypes: string[];
  typeFilter: string;
  setTypeFilter: (val: string) => void;

  showObtainableOnly?: boolean;
  obtainableOnly?: boolean;
  setObtainableOnly?: (val: boolean) => void;

  showSort?: boolean;
  sortFilter?: string;
  setSortFilter?: (val: string) => void;
  sortOptions?: SortOption[];
  baseSorts?: SortOption[];
  defaultSortId?: string;
}

export function EquipmentFilterBar({
  categoryKind,
  availableFactions, factions, factionFilter, setFactionFilter,
  availableMks, mkFilter, setMkFilter,
  availableTypes, typeFilter, setTypeFilter,
  showObtainableOnly, obtainableOnly, setObtainableOnly,
  showSort, sortFilter, setSortFilter, sortOptions, baseSorts, defaultSortId
}: EquipmentFilterBarProps) {
  const hasFilters = factionFilter !== "all" || mkFilter !== "all" || typeFilter !== "all" || (showSort && sortFilter !== "") || (showObtainableOnly && obtainableOnly);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {showObtainableOnly && setObtainableOnly && (
        <button
          onClick={() => setObtainableOnly(!obtainableOnly)}
          className={cn(
            "text-xs font-medium px-3 h-9 rounded transition-colors flex items-center shrink-0 border",
            obtainableOnly ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-foreground border-input hover:bg-accent hover:text-accent-foreground"
          )}
        >
          Obtainable Only
        </button>
      )}

      {showSort && setSortFilter && sortOptions && baseSorts && (
        <Select value={sortFilter || defaultSortId} onValueChange={setSortFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground truncate">
              <span>Order by:</span>
              <span className="text-foreground font-medium truncate"><SelectValue /></span>
            </div>
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
            {baseSorts.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {["weapon", "turret"].includes(categoryKind) && (
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {availableTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={mkFilter} onValueChange={setMkFilter}>
        <SelectTrigger className="w-[120px] h-9 text-xs">
          <SelectValue placeholder="All Mks" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Mks</SelectItem>
          {availableMks.map(mk => (
            <SelectItem key={mk} value={mk.toString()}>
              <div className="flex items-center py-0.5"><EquipmentMkBadge mk={mk} className="px-1.5 py-0 rounded text-[10px]" /></div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FactionCombobox
        factions={factions.filter(f => availableFactions.includes(f.faction_id))}
        value={factionFilter}
        onChange={setFactionFilter}
        className="w-[180px]"
        disabled={availableFactions.length === 0}
      />
      
      {hasFilters && (
        <button
          onClick={() => { 
            setFactionFilter("all"); setMkFilter("all"); setTypeFilter("all"); 
            if (setSortFilter) setSortFilter(""); 
            if (setObtainableOnly) setObtainableOnly(false); 
          }}
          className="text-[11px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1.5 rounded bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Clear filters
        </button>
      )}
    </div>
  );
}
