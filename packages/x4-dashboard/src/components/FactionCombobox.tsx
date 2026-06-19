import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "../lib/utils";
import type { FactionSummary } from '../lib/map/types';

interface FactionComboboxProps {
  factions: FactionSummary[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export function FactionCombobox({ factions, value, onChange, className, disabled }: FactionComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const selectedFaction = factions.find(f => f.faction_id === value);

  const filtered = factions.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase()) || 
    f.faction_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "flex h-7 w-[180px] items-center justify-between rounded-[4px] border border-input bg-transparent px-2 py-1 text-xs shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <div className="flex-1 truncate text-left">
            {selectedFaction ? (
              <div className="flex items-center gap-2">
                {selectedFaction.icon_url ? (
                  <span
                    className="shrink-0"
                    style={{
                      width: 14,
                      height: 14,
                      backgroundColor: selectedFaction.color_hex ?? "#888",
                      WebkitMaskImage: `url(${selectedFaction.icon_url})`,
                      WebkitMaskSize: "contain",
                      WebkitMaskRepeat: "no-repeat",
                      WebkitMaskPosition: "center",
                      maskImage: `url(${selectedFaction.icon_url})`,
                      maskSize: "contain",
                      maskRepeat: "no-repeat",
                      maskPosition: "center",
                    }}
                  />
                ) : (
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: selectedFaction.color_hex ?? '#888' }} />
                )}
                <span>{selectedFaction.name}</span>
              </div>
            ) : (
              <span className="text-muted-foreground">All Factions</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-[240px] rounded-md border bg-[#101422]/95 backdrop-blur-md text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
          align="start"
          sideOffset={4}
        >
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search factions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            <div
              className={cn(
                "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                value === "all" && "bg-accent text-accent-foreground"
              )}
              onClick={() => { onChange("all"); setOpen(false); setSearch(""); }}
            >
              <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                {value === "all" && <Check className="h-4 w-4" />}
              </span>
              All Factions
            </div>
            {filtered.map(f => (
              <div
                key={f.faction_id}
                className={cn(
                  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                  value === f.faction_id && "bg-accent text-accent-foreground"
                )}
                onClick={() => { onChange(f.faction_id); setOpen(false); setSearch(""); }}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  {value === f.faction_id && <Check className="h-4 w-4" />}
                </span>
                <div className="flex items-center gap-2">
                  {f.icon_url ? (
                    <span
                      className="shrink-0"
                      style={{
                        width: 14,
                        height: 14,
                        backgroundColor: f.color_hex ?? "#888",
                        WebkitMaskImage: `url(${f.icon_url})`,
                        WebkitMaskSize: "contain",
                        WebkitMaskRepeat: "no-repeat",
                        WebkitMaskPosition: "center",
                        maskImage: `url(${f.icon_url})`,
                        maskSize: "contain",
                        maskRepeat: "no-repeat",
                        maskPosition: "center",
                      }}
                    />
                  ) : (
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color_hex ?? '#888' }} />
                  )}
                  <span>{f.name}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">No factions found.</div>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
