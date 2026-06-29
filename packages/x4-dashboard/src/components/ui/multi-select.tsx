import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";

type Option = { label: string; value: string; node?: React.ReactNode; group?: string };

interface MultiSelectProps {
  options: Option[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  placeholder?: string;
  className?: string;
  searchable?: boolean;
  hideClear?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
  searchable,
  hideClear,
}: MultiSelectProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const grouped: Map<string, Option[]> = new Map();
  const ungrouped: Option[] = [];
  for (const o of filtered) {
    if (o.group) {
      if (!grouped.has(o.group)) grouped.set(o.group, []);
      grouped.get(o.group)!.push(o);
    } else {
      ungrouped.push(o);
    }
  }

  const toggleOption = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  };

  const selectedCount = selected.size;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-[4px] border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
        >
          <div className="flex gap-1 overflow-hidden truncate">
            {selectedCount === 0 && <span className="text-muted-foreground">{placeholder}</span>}
            {selectedCount > 0 && selectedCount <= 2 && (
              <span className="truncate">
                {options
                  .filter((o) => selected.has(o.value))
                  .map((o) => o.label)
                  .join(", ")}
              </span>
            )}
            {selectedCount > 2 && (
              <Badge variant="secondary" className="px-1 py-0 h-5 font-normal">
                {selectedCount} selected
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {selectedCount > 0 && !hideClear && (
              <div 
                role="button"
                className="p-0.5 rounded-sm hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onChange(new Set());
                }}
              >
                <X className="h-3.5 w-3.5 opacity-50 hover:opacity-100 transition-opacity text-muted-foreground" />
              </div>
            )}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </div>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-full min-w-[200px] rounded-md border bg-[#101422]/95 backdrop-blur-md p-1 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            if (searchable) e.preventDefault();
          }}
        >
          {searchable && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 mb-1">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter..."
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {[...grouped.entries()].map(([group, groupOpts]) => (
              <div key={group}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group}
                </div>
                {groupOpts.map((option) => renderOption(option, selected.has(option.value), toggleOption))}
              </div>
            ))}
            {ungrouped.length > 0 && grouped.size > 0 && (
              <div className="border-t border-border/30 my-0.5" />
            )}
            {ungrouped.map((option) => renderOption(option, selected.has(option.value), toggleOption))}
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">No matches</div>
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function renderOption(
  option: Option,
  isSelected: boolean,
  onClick: (v: string) => void,
) {
  return (
    <div
      key={option.value}
      className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-muted/50 focus:bg-muted/50"
      onClick={() => onClick(option.value)}
    >
      <div className={cn(
        "absolute left-2 flex h-4 w-4 items-center justify-center rounded-sm border transition-colors",
        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30 opacity-50"
      )}>
        {isSelected && <Check className="h-3 w-3" />}
      </div>
      {option.node || option.label}
    </div>
  );
}
