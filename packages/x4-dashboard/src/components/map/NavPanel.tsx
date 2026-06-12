// Navigation controls, parked at the bottom of the sidebar. Deliberately understated —
// the prominent origin→destination readout lives on the map itself.

export function NavPanel({
  navFrom, navTo, onClear, sectorName,
}: {
  navFrom: string | null;
  navTo: string | null;
  onClear: () => void;
  sectorName: (id: string) => string;
}) {
  return (
    <div className="mt-auto p-4 border-t border-border flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Navigate</p>
      <p className="text-[11px] text-muted-foreground/70">Left-click a sector for origin, right-click for destination.</p>
      {(navFrom || navTo) && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate">{navFrom ? sectorName(navFrom) : "—"} → {navTo ? sectorName(navTo) : "—"}</span>
          <button onClick={onClear} className="shrink-0 hover:text-foreground underline">clear</button>
        </div>
      )}
    </div>
  );
}
