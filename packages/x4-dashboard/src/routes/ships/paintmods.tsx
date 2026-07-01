import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiGet } from "../../lib/api";
import { PageLoaderPreset } from "../../components/PageLoader";
import { HUDCard } from "../../components/HUDCard";
import { FilterBar } from "../../components/FilterBar";
import { SearchInput } from "../../components/ui/search-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

type Ware = {
  ware_id: string;
  name: string;
  tags: string | null;
  icon_url: string | null;
};

export default function PaintModsPage() {
  const [search, setSearch] = useState("");
  const [selectedMod, setSelectedMod] = useState<Ware | null>(null);

  const { data: wares = [], isLoading } = useQuery<Ware[]>({
    queryKey: ["wares", "inventory"],
    queryFn: () =>
      apiGet<any>("/api/v1/wares?category=inventory&limit=2000").then((d) =>
        Array.isArray(d) ? d : []
      ),
    staleTime: 5 * 60_000,
  });

  const paintMods = useMemo(() => {
    let mods = wares.filter((w) => (w.tags || "").includes("paintmod"));
    const needle = search.trim().toLowerCase();
    if (needle) {
      mods = mods.filter((w) => w.name.toLowerCase().includes(needle));
    }
    return mods.sort((a, b) => a.name.localeCompare(b.name));
  }, [wares, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-5">
        <h1 className="text-2xl font-bold tracking-tight">Paint Mods</h1>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-semibold mb-4">
          {paintMods.length} colors available for application
        </p>
      </div>

      <FilterBar>
        <SearchInput
          placeholder="Search paint mods..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48"
        />
      </FilterBar>

      <div className="flex-1 overflow-auto px-6 pb-6 pt-2">
        {isLoading ? (
          <PageLoaderPreset preset="inventory" />
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {paintMods.map((mod) => (
              <HUDCard 
                key={mod.ware_id} 
                className="flex flex-col items-center justify-between p-3 gap-2 aspect-square cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setSelectedMod(mod)}
              >
                <div className="flex-1 flex items-center justify-center w-full min-h-0">
                  {mod.icon_url ? (
                    <img
                      src={mod.icon_url}
                      alt={mod.name}
                      className="w-full h-full object-contain drop-shadow-md"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted/20 rounded-md flex items-center justify-center">
                      <span className="text-xs text-muted-foreground">No icon</span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-center leading-tight line-clamp-2">
                  {mod.name}
                </span>
              </HUDCard>
            ))}
            {paintMods.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No paint mods found.
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={selectedMod !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedMod(null);
        }}
      >
        <DialogContent className="sm:max-w-xl md:max-w-2xl bg-card border-border">
          <DialogHeader className="sr-only">
            <DialogTitle>Paint Mod Details</DialogTitle>
            <DialogDescription>
              Detailed view of the selected paint mod
            </DialogDescription>
          </DialogHeader>
          {selectedMod && (
            <div className="flex flex-col items-center justify-center p-4 sm:p-8 gap-6">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">{selectedMod.name}</h2>
              <div className="w-full flex items-center justify-center bg-black/20 rounded-xl p-8 shadow-inner">
                {selectedMod.icon_url ? (
                  <img
                    src={selectedMod.icon_url}
                    alt={selectedMod.name}
                    className="w-full max-h-[60vh] object-contain drop-shadow-2xl"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-64 flex items-center justify-center">
                    <span className="text-muted-foreground">No icon available</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
